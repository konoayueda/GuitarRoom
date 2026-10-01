import { z } from "zod";
import { CHORDS, type Chord } from "./chords";
import { legacyArrangementSchema } from "./arrangement-legacy";

const id = z.string().min(1).max(100);
const fingering = z
  .object({
    name: z.string().min(1).max(40),
    frets: z.array(z.number().int().min(-1).max(24)).length(6),
    fingers: z.array(z.number().int().min(0).max(4)).length(6),
  })
  .strict()
  .refine((c) => c.frets.some((f) => f >= 0), "使用休止来表示不发声");
const arrangementShape = z
  .object({
    version: z.literal(2),
    bpm: z.number().int().min(30).max(240),
    meter: z.enum(["4/4", "3/4", "6/8"]),
    pattern: z.enum(["strum", "arpeggio"]),
    lyricLineCount: z.number().int().min(1).max(8).optional(),
    vocalKey: z
      .enum(["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"])
      .optional(),
    sections: z
      .array(
        z
          .object({
            id,
            label: z.string().trim().min(1).max(30),
            repeat: z.number().int().min(1).max(8),
            bars: z
              .array(
                z
                  .object({
                    id,
                    pageId: id.optional(),
                    lyrics: z
                      .array(
                        z
                          .object({
                            tick: z.number().int().min(0).max(95),
                            verse: z.number().int().min(0).max(7),
                            text: z.string().min(1).max(120),
                            anchorMode: z.enum(["auto", "free"]).optional(),
                            vocalNoteId: id.optional(),
                            offsetX: z.number().min(-96).max(96).optional(),
                            offsetY: z.number().min(-24).max(24).optional(),
                            endVocalNoteId: id.optional(),
                          })
                          .strict(),
                      )
                      .max(768)
                      .optional(),
                    vocalNotes: z
                      .array(
                        z
                          .object({
                            id,
                            tick: z.number().int().min(0).max(95),
                            degree: z.number().int().min(0).max(7),
                            octave: z.number().int().min(-2).max(2),
                            accidental: z
                              .union([
                                z.literal(-1),
                                z.literal(0),
                                z.literal(1),
                              ])
                              .optional(),
                            durationTicks: z.number().int().min(1).max(96),
                            tieToNext: z.boolean().optional(),
                          })
                          .strict(),
                      )
                      .max(96)
                      .optional(),
                    events: z
                      .array(
                        z
                          .object({
                            id,
                            chord: fingering.nullable(),
                            stroke: z.enum(["pluck", "down", "up"]).optional(),
                            durationTicks: z.number().int().min(1).max(96),
                            notes: z
                              .array(
                                z
                                  .object({
                                    offsetTick: z.number().int().min(0).max(95),
                                    stringIndex: z.number().int().min(0).max(5),
                                    fret: z.number().int().min(0).max(24),
                                    marker: z.literal("cross").optional(),
                                    durationTicks: z
                                      .number()
                                      .int()
                                      .min(1)
                                      .max(96)
                                      .optional(),
                                    sustainTicks: z
                                      .number()
                                      .positive()
                                      .max(96)
                                      .optional(),
                                    tieToNext: z.boolean().optional(),
                                  })
                                  .strict(),
                              )
                              .max(144)
                              .optional(),
                          })
                          .strict(),
                      )
                      .min(1)
                      .max(96),
                  })
                  .strict(),
              )
              .min(1)
              .max(32),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export type Arrangement = z.infer<typeof arrangementShape>;
const arrangementV2Schema = arrangementShape.superRefine((a, ctx) => {
  const allIds = new Set<string>();
  let count = 0;
  const checkId = (value: string) => {
    if (allIds.has(value))
      ctx.addIssue({ code: "custom", message: "编排标识重复" });
    allIds.add(value);
  };
  for (const section of a.sections) {
    checkId(section.id);
    for (const bar of section.bars) {
      count++;
      checkId(bar.id);
      for (const note of bar.vocalNotes ?? []) checkId(note.id);
      const lyricPositions = new Set<string>();
      for (const lyric of bar.lyrics ?? []) {
        const position = lyric.tick + ":" + lyric.verse;
        if (lyric.tick >= barTicks(a.meter) || lyricPositions.has(position))
          ctx.addIssue({
            code: "custom",
            message: "歌词位置超出小节或同一行同一拍点重复",
          });
        lyricPositions.add(position);
      }
      for (const e of bar.events) {
        checkId(e.id);
        const coordinates = new Set<string>();
        for (const note of e.notes ?? []) {
          const coordinate = note.offsetTick + ":" + note.stringIndex;
          if (note.offsetTick >= e.durationTicks || coordinates.has(coordinate))
            ctx.addIssue({
              code: "custom",
              message: "音符位置超出时值或重复",
            });
          coordinates.add(coordinate);
        }
      }
      if (
        bar.events.reduce((n, e) => n + e.durationTicks, 0) !==
        barTicks(a.meter)
      )
        ctx.addIssue({ code: "custom", message: "请补齐每个小节的时值" });
    }
  }
  for (const problem of [
    ...noteProblems(a),
    ...vocalProblems(a),
    ...lyricProblems(a),
  ])
    ctx.addIssue({ code: "custom", message: problem.message });
  if (count > 128)
    ctx.addIssue({ code: "custom", message: "一份编排最多128个小节" });
});
export const arrangementSchema = z.union([
  arrangementV2Schema,
  legacyArrangementSchema
    .transform((old) => ({
      ...old,
      version: 2 as const,
      sections: old.sections.map((s) => ({
        ...s,
        bars: s.bars.map((b) => ({
          ...b,
          events: b.events.map((e) => ({
            ...e,
            durationTicks: e.durationTicks * 12,
            ...(e.notes
              ? {
                  notes: e.notes.map((n) => ({
                    ...n,
                    offsetTick: n.offsetTick * 12,
                  })),
                }
              : {}),
          })),
        })),
      })),
    }))
    .pipe(arrangementV2Schema),
]);
export function normalizeArrangement(value: unknown): Arrangement {
  return arrangementSchema.parse(value);
}
export type ArrangementSection = Arrangement["sections"][number];
export type ArrangementBar = ArrangementSection["bars"][number];
export type ArrangementEvent = ArrangementBar["events"][number];
export type ArrangementLyric = NonNullable<ArrangementBar["lyrics"]>[number];
export type VocalNote = NonNullable<ArrangementBar["vocalNotes"]>[number];
export type ArrangementVocalNote = VocalNote;
export type VocalKey = NonNullable<Arrangement["vocalKey"]>;
export const EMPTY_ARRANGEMENT: Arrangement = {
  version: 2,
  bpm: 72,
  meter: "4/4",
  pattern: "strum",
  sections: [],
};
export const barTicks = (meter: Arrangement["meter"]) =>
  meter === "4/4" ? 96 : 72;
export const tickSeconds = (bpm: number) => 60 / (bpm * 24);
export const RHYTHMS = [
  { ticks: 96, label: "全音符", symbol: "1/1" },
  { ticks: 84, label: "复附点二分音符", symbol: "1/2··" },
  { ticks: 72, label: "附点二分音符", symbol: "1/2·" },
  { ticks: 48, label: "二分音符", symbol: "1/2" },
  { ticks: 42, label: "复附点四分音符", symbol: "♩··" },
  { ticks: 36, label: "附点四分音符", symbol: "♩·" },
  { ticks: 24, label: "四分音符", symbol: "♩" },
  { ticks: 21, label: "复附点八分音符", symbol: "♪··" },
  { ticks: 18, label: "附点八分音符", symbol: "♪·" },
  { ticks: 16, label: "四分三连音", symbol: "♩₃" },
  { ticks: 12, label: "八分音符", symbol: "♪" },
  { ticks: 9, label: "附点十六分音符", symbol: "1/16·" },
  { ticks: 8, label: "八分三连音", symbol: "♪₃" },
  { ticks: 6, label: "十六分音符", symbol: "1/16" },
  { ticks: 4, label: "十六分三连音", symbol: "1/16₃" },
  { ticks: 3, label: "三十二分音符", symbol: "1/32" },
  { ticks: 2, label: "三十二分三连音", symbol: "1/32₃" },
];
export const GRID_OPTIONS = [
  { value: "12", label: "八分音符" },
  { value: "6", label: "十六分音符" },
  { value: "3", label: "三十二分音符" },
  { value: "2", label: "三十二分三连音" },
  { value: "16", label: "四分三连音" },
  { value: "8", label: "八分三连音" },
  { value: "4", label: "十六分三连音" },
  { value: "18", label: "附点八分" },
  { value: "9", label: "附点十六分" },
  { value: "24", label: "四分音符" },
];
export const durationLabel = (ticks: number) =>
  RHYTHMS.find((r) => r.ticks === ticks)?.label ?? ticks / 24 + " 拍";
export const rhythmSymbol = (ticks: number) =>
  RHYTHMS.find((r) => r.ticks === ticks)?.symbol ??
  Math.round((ticks / 24) * 100) / 100 + "拍";
export const beatLabel = (
  tick: number,
  meter: Arrangement["meter"] = "4/4",
) => {
  const unit = meter === "6/8" ? 12 : 24;
  const beat = Math.floor(tick / unit) + 1,
    part = tick % unit;
  let divisor = part,
    denominator = unit;
  while (denominator) {
    [divisor, denominator] = [denominator, divisor % denominator];
  }
  return part === 0
    ? "第 " + beat + " 拍"
    : "第 " + beat + " 拍 + " + part / divisor + "/" + unit / divisor;
};
export function durationOptions(capacity: number, current?: number) {
  const values = RHYTHMS.filter((r) => r.ticks <= capacity).map((r) => ({
    value: String(r.ticks),
    label: r.label,
  }));
  if (current && !values.some((v) => v.value === String(current)))
    values.push({ value: String(current), label: durationLabel(current) });
  return values;
}
export function makeEvent(
  chord: Chord | null,
  durationTicks: number,
): ArrangementEvent {
  return {
    id: crypto.randomUUID(),
    chord: chord ? structuredClone(chord) : null,
    durationTicks,
  };
}
export function makeBar(
  meter: Arrangement["meter"],
  pageId?: string,
): ArrangementBar {
  return {
    id: crypto.randomUUID(),
    ...(pageId ? { pageId } : {}),
    events: [makeEvent(null, barTicks(meter))],
  };
}
export function duplicateBar(
  bar: ArrangementBar,
  pattern: Arrangement["pattern"] = "strum",
): ArrangementBar {
  const total = bar.events.reduce((n, e) => n + e.durationTicks, 0);
  const vocalIds = new Map(
    (bar.vocalNotes ?? []).map((note) => [note.id, crypto.randomUUID()]),
  );
  let offset = 0;
  return {
    ...structuredClone(bar),
    ...(bar.lyrics
      ? {
          lyrics: bar.lyrics.map((lyric) => {
            const result = { ...lyric };
            const source =
              lyric.anchorMode !== "free"
                ? (bar.vocalNotes ?? []).find(
                    (note) =>
                      note.degree !== 0 &&
                      note.tick === lyric.tick &&
                      (!lyric.vocalNoteId || note.id === lyric.vocalNoteId),
                  )
                : undefined;
            if (source) result.vocalNoteId = vocalIds.get(source.id)!;
            else if (lyric.vocalNoteId) {
              result.anchorMode = "free";
              delete result.vocalNoteId;
            }
            if (
              lyric.endVocalNoteId &&
              vocalIds.has(lyric.endVocalNoteId) &&
              source
            )
              result.endVocalNoteId = vocalIds.get(lyric.endVocalNoteId)!;
            else delete result.endVocalNoteId;
            return result;
          }),
        }
      : {}),
    id: crypto.randomUUID(),
    ...(bar.vocalNotes
      ? {
          vocalNotes: bar.vocalNotes.map((n) => ({
            ...n,
            id: vocalIds.get(n.id)!,
            ...(n.tick + n.durationTicks >= total ? { tieToNext: false } : {}),
          })),
        }
      : {}),
    events: bar.events.map((e) => {
      const start = offset;
      offset += e.durationTicks;
      return {
        ...structuredClone(e),
        id: crypto.randomUUID(),
        ...(e.notes
          ? {
              notes: e.notes.map((n) => ({
                ...n,
                ...(n.tieToNext &&
                start +
                  n.offsetTick +
                  (n.durationTicks ??
                    eventAttacks(e, pattern).find(
                      (a) =>
                        a.offsetTick === n.offsetTick &&
                        a.stringIndex === n.stringIndex,
                    )!.durationTicks) >=
                  total
                  ? { tieToNext: false }
                  : {}),
              })),
            }
          : {}),
      };
    }),
  };
}
export function sampleArrangement(demoId: number, pageId: string): Arrangement {
  const names =
    demoId === 1
      ? ["C", "Am", "Dm", "G"]
      : demoId === 2
        ? ["Em", "C", "G", "D"]
        : ["C", "Am", "Fmaj7", "G"];
  return {
    ...EMPTY_ARRANGEMENT,
    pattern: "arpeggio",
    sections: ["A · 分解练习", "B · 反复巩固"].map((label) => ({
      id: crypto.randomUUID(),
      label,
      repeat: 2,
      bars: names.map((name) => ({
        id: crypto.randomUUID(),
        pageId,
        events: [
          makeEvent(
            CHORDS.find((c) => c.name === name)!,
            96,
          ),
        ],
      })),
    })),
  };
}
export function listBars(a: Arrangement) {
  let number = 0;
  return a.sections.flatMap((section) =>
    section.bars.map((bar) => ({ bar, section, number: ++number })),
  );
}
export function arrangementProblems(a: Arrangement) {
  return [
    ...listBars(a).flatMap(({ bar, number }) =>
      bar.events
        .filter((e) => e.chord && !fingering.safeParse(e.chord).success)
        .map(() => ({
          barId: bar.id,
          gap: 0,
          message: "第 " + number + " 小节请填写和弦名称及至少一根可弹的弦",
        })),
    ),
    ...noteProblems(a),
    ...vocalProblems(a),
    ...lyricProblems(a),
    ...listBars(a).flatMap(({ bar, number }) => {
      const gap =
        barTicks(a.meter) - bar.events.reduce((n, e) => n + e.durationTicks, 0);
      return gap
        ? [
            {
              barId: bar.id,
              message: `第 ${number} 小节${gap > 0 ? "还差" : "多出"} ${Math.round((Math.abs(gap) / 24) * 100) / 100} 拍`,
              gap,
            },
          ]
        : [];
    }),
  ];
}
export type PlaybackBar = {
  bar: ArrangementBar;
  number: number;
  sectionId: string;
  sectionLabel: string;
  sectionPass: number;
  sectionRepeat: number;
  occurrenceIndex: number;
  startTick: number;
  endTick: number;
};
export type PlaybackEvent = {
  event: ArrangementEvent;
  bar: PlaybackBar;
  startTick: number;
  endTick: number;
};
export function buildPlayback(
  a: Arrangement,
  range?: { from: string; to: string },
) {
  const base = listBars(a),
    from = range ? base.findIndex((b) => b.bar.id === range.from) : 0,
    to = range ? base.findIndex((b) => b.bar.id === range.to) : base.length - 1;
  if (from < 0 || to < from)
    return {
      bars: [] as PlaybackBar[],
      events: [] as PlaybackEvent[],
      totalTicks: 0,
    };
  const chosen = new Set(base.slice(from, to + 1).map((b) => b.bar.id));
  const bars: PlaybackBar[] = [],
    events: PlaybackEvent[] = [];
  let tick = 0;
  for (const section of a.sections) {
    const selected = base.filter(
      (b) => b.section.id === section.id && chosen.has(b.bar.id),
    );
    for (let pass = 1; pass <= section.repeat; pass++)
      for (const item of selected) {
        const bar: PlaybackBar = {
          bar: item.bar,
          number: item.number,
          sectionId: section.id,
          sectionLabel: section.label,
          sectionPass: pass,
          sectionRepeat: section.repeat,
          occurrenceIndex: bars.length,
          startTick: tick,
          endTick: tick + barTicks(a.meter),
        };
        bars.push(bar);
        let startTick = tick;
        for (const event of item.bar.events) {
          events.push({
            event,
            bar,
            startTick,
            endTick: startTick + event.durationTicks,
          });
          startTick += event.durationTicks;
        }
        tick = bar.endTick;
      }
  }
  return { bars, events, totalTicks: tick };
}
export type PlaybackPlan = ReturnType<typeof buildPlayback>;

export type ArrangementAttack = {
  offsetTick: number;
  stringIndex: number;
  fret: number;
  marker?: "cross";
  midi: number;
  delaySeconds: number;
  gateTicks: number;
  durationTicks: number;
  tieToNext?: boolean;
};
export function noteFret(
  event: ArrangementEvent,
  note: NonNullable<ArrangementEvent["notes"]>[number],
) {
  return note.marker === "cross"
    ? (event.chord?.frets[note.stringIndex] ?? -1)
    : note.fret;
}
// A single source for both sounding notes and the live TAB notation.
export function eventAttacks(
  event: ArrangementEvent,
  pattern: Arrangement["pattern"],
  capo = 0,
): ArrangementAttack[] {
  if (event.notes !== undefined) {
    const tuning = [40, 45, 50, 55, 59, 64];
    const notes = [...event.notes].sort(
      (a, b) => a.offsetTick - b.offsetTick || a.stringIndex - b.stringIndex,
    );
    return notes.map((note) => ({
      ...note,
      fret: noteFret(event, note),
      midi: tuning[note.stringIndex] + noteFret(event, note) + capo,
      delaySeconds:
        (event.stroke ?? (pattern === "strum" ? "down" : "pluck")) === "pluck"
          ? 0
          : notes.filter(
              (n) =>
                n.offsetTick === note.offsetTick &&
                (event.stroke === "up"
                  ? n.stringIndex > note.stringIndex
                  : n.stringIndex < note.stringIndex),
            ).length * 0.016,
      durationTicks:
        note.durationTicks ??
        Math.min(
          pattern === "strum" ? event.durationTicks : 12,
          event.durationTicks - note.offsetTick,
          ...notes
            .filter(
              (n) =>
                n.stringIndex === note.stringIndex &&
                n.offsetTick > note.offsetTick,
            )
            .map((n) => n.offsetTick - note.offsetTick),
        ),
      gateTicks: Math.min(
        note.sustainTicks ??
          note.durationTicks ??
          (pattern === "strum"
            ? event.durationTicks - note.offsetTick
            : Math.min(21.6, event.durationTicks - note.offsetTick)),
        ...notes
          .filter(
            (n) =>
              n.stringIndex === note.stringIndex &&
              n.offsetTick > note.offsetTick,
          )
          .map((n) => n.offsetTick - note.offsetTick),
      ),
    }));
  }
  if (!event.chord) return [];
  const frets = event.chord.frets;
  const available = frets
    .map((f, i) => (f >= 0 ? i : -1))
    .filter((i) => i >= 0);
  if (!available.length) return [];
  const tuning = [40, 45, 50, 55, 59, 64];
  const attack = (
    stringIndex: number,
    offsetTick: number,
    delaySeconds: number,
    gateTicks: number,
  ) => ({
    offsetTick,
    stringIndex,
    fret: frets[stringIndex],
    marker: "cross" as const,
    midi: tuning[stringIndex] + frets[stringIndex] + capo,
    delaySeconds,
    gateTicks,
    durationTicks: Math.min(
      pattern === "strum" ? event.durationTicks : 12,
      event.durationTicks - offsetTick,
    ),
  });
  if (pattern === "strum")
    return available.map((string, i) =>
      attack(
        string,
        0,
        event.stroke === "pluck"
          ? 0
          : (event.stroke === "up" ? available.length - 1 - i : i) * 0.016,
        event.durationTicks,
      ),
    );
  const sequence =
    event.durationTicks <= 72
      ? [available[0], 3, 4, 5, 2, 1]
      : [available[0], 3, 4, 5, 4, 3, 2, 1];
  return Array.from(
    { length: Math.ceil(event.durationTicks / 12) },
    (_, index) => {
      const tick = index * 12;
      const wanted = sequence[index % sequence.length];
      const string = frets[wanted] >= 0 ? wanted : available[0];
      return attack(
        string,
        tick,
        0,
        Math.min(21.6, event.durationTicks - tick),
      );
    },
  );
}

// Written order ignores playback repeats. Ties refer to this order, never a loop jump.
export function writtenNotes(a: Arrangement) {
  const limit = barTicks(a.meter);
  return listBars(a)
    .flatMap(({ bar, number }) => {
      let offset = 0;
      return bar.events.flatMap((event) => {
        const start = (number - 1) * limit + offset;
        offset += event.durationTicks;
        return eventAttacks(event, a.pattern).map((n) => ({
          ...n,
          eventId: event.id,
          barId: bar.id,
          barNumber: number,
          startTick: start + n.offsetTick,
          barEnd: number * limit,
          explicit: event.notes?.find(
            (v) =>
              v.offsetTick === n.offsetTick && v.stringIndex === n.stringIndex,
          ),
        }));
      });
    })
    .sort((a, b) => a.startTick - b.startTick || a.stringIndex - b.stringIndex);
}
export type WrittenNote = ReturnType<typeof writtenNotes>[number];
const nextNoteCache = new WeakMap<
  WrittenNote[],
  Map<WrittenNote, WrittenNote>
>();
export function nextOnString(notes: WrittenNote[], note: WrittenNote) {
  let cache = nextNoteCache.get(notes);
  if (!cache) {
    cache = new Map();
    const last = new Map<number, WrittenNote>();
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i],
        next = last.get(n.stringIndex);
      if (next) cache.set(n, next);
      last.set(n.stringIndex, n);
    }
    nextNoteCache.set(notes, cache);
  }
  return cache.get(note);
}
export function tieCandidate(notes: WrittenNote[], note: WrittenNote) {
  const next = nextOnString(notes, note);
  return next &&
    note.fret >= 0 &&
    next.fret === note.fret &&
    next.startTick <= note.barEnd &&
    next.barNumber <= note.barNumber + 1
    ? next
    : undefined;
}
export function noteCapacity(notes: WrittenNote[], note: WrittenNote) {
  return Math.max(
    1,
    Math.min(
      note.barEnd - note.startTick,
      (nextOnString(notes, note)?.startTick ?? Infinity) - note.startTick,
    ),
  );
}
export function noteProblems(a: Arrangement) {
  const notes = writtenNotes(a),
    problems: { barId: string; message: string; gap: number }[] = [];
  for (const n of notes) {
    if (n.marker === "cross" && n.fret < 0)
      problems.push({
        barId: n.barId,
        gap: 0,
        message:
          "第 " +
          n.barNumber +
          " 小节的 " +
          (6 - n.stringIndex) +
          " 弦 × 缺少可弹的和弦按法，请设置和弦或改为数字品位",
      });
    if (
      n.explicit?.durationTicks &&
      n.explicit.durationTicks > noteCapacity(notes, n)
    )
      problems.push({
        barId: n.barId,
        gap: 0,
        message: `第 ${n.barNumber} 小节的音符时值越过小节或覆盖了同弦后音`,
      });
    if (n.tieToNext) {
      const next = tieCandidate(notes, n);
      if (!next || next.startTick !== n.startTick + n.durationTicks)
        problems.push({
          barId: n.barId,
          gap: 0,
          message: `第 ${n.barNumber} 小节的延音必须连接紧邻的同弦同品音符`,
        });
    }
  }
  return problems;
}
// Inserting, moving or deleting a note cuts overlapping durations and removes broken ties.
export function repairNoteLinks(a: Arrangement): Arrangement {
  a = repairLyricLinks(repairVocalLinks(a));
  const notes = writtenNotes(a),
    byKey = new Map(
      notes.map((n) => [
        n.eventId + ":" + n.offsetTick + ":" + n.stringIndex,
        n,
      ]),
    );
  return {
    ...a,
    sections: a.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => ({
        ...b,
        events: b.events.map((e) => ({
          ...e,
          ...(e.notes
            ? {
                notes: e.notes.map((n) => {
                  const written = byKey.get(
                    e.id + ":" + n.offsetTick + ":" + n.stringIndex,
                  )!;
                  const duration = n.durationTicks
                    ? Math.min(n.durationTicks, noteCapacity(notes, written))
                    : undefined;
                  const target = tieCandidate(notes, written);
                  return {
                    ...n,
                    ...(n.marker === "cross" && written.fret >= 0
                      ? { fret: written.fret }
                      : {}),
                    ...(duration ? { durationTicks: duration } : {}),
                    ...(n.sustainTicks
                      ? {
                          sustainTicks: Math.min(
                            n.sustainTicks,
                            noteCapacity(notes, written),
                          ),
                        }
                      : {}),
                    ...(n.tieToNext
                      ? {
                          tieToNext:
                            !!target &&
                            target.startTick ===
                              written.startTick +
                                (duration ?? written.durationTicks),
                        }
                      : {}),
                  };
                }),
              }
            : {}),
        })),
      })),
    })),
  };
}
export function barGridPoints(
  bar: ArrangementBar,
  step: number,
  limit: number,
  pattern: Arrangement["pattern"] = "strum",
) {
  const points = new Set<number>([
    0,
    limit,
    ...(bar.lyrics ?? []).map((lyric) => lyric.tick),
    ...(bar.vocalNotes ?? []).flatMap((note) => [
      note.tick,
      Math.min(limit, note.tick + note.durationTicks),
    ]),
  ]);
  for (let t = 0; t < limit; t += step) points.add(t);
  let offset = 0;
  for (const e of bar.events) {
    points.add(offset);
    for (const n of eventAttacks(e, pattern)) {
      points.add(offset + n.offsetTick);
      if (n.durationTicks)
        points.add(Math.min(limit, offset + n.offsetTick + n.durationTicks));
    }
    offset += e.durationTicks;
    points.add(offset);
  }
  return [...points].sort((a, b) => a - b);
}
export function buildPlaybackAttacks(
  plan: PlaybackPlan,
  a: Arrangement,
  capo = 0,
) {
  const notes = plan.events
    .flatMap((entry) =>
      eventAttacks(entry.event, a.pattern, capo)
        .filter((n) => n.fret >= 0)
        .map((n) => ({
          ...n,
          startTick: entry.startTick + n.offsetTick,
          bar: entry.bar,
          gateTicks: Math.min(
            n.gateTicks,
            entry.bar.endTick - entry.startTick - n.offsetTick,
          ),
        })),
    )
    .sort((a, b) => a.startTick - b.startTick || a.stringIndex - b.stringIndex);
  type Note = (typeof notes)[number];
  const output: Note[] = [],
    last = new Map<number, { root: Note; tail: Note }>();
  for (const note of notes) {
    const previous = last.get(note.stringIndex),
      tail = previous?.tail;
    const adjacent =
      tail &&
      (tail.bar.occurrenceIndex === note.bar.occurrenceIndex ||
        (tail.bar.occurrenceIndex + 1 === note.bar.occurrenceIndex &&
          tail.bar.number + 1 === note.bar.number));
    if (
      previous &&
      tail?.tieToNext &&
      adjacent &&
      tail.fret === note.fret &&
      tail.startTick + tail.durationTicks === note.startTick
    ) {
      previous.root.gateTicks =
        note.startTick + note.gateTicks - previous.root.startTick;
      previous.tail = note;
    } else {
      if (previous)
        previous.root.gateTicks = Math.min(
          previous.root.gateTicks,
          note.startTick - previous.root.startTick,
        );
      const root = { ...note };
      output.push(root);
      last.set(note.stringIndex, { root, tail: note });
    }
  }
  return output;
}

// Vocal melody is independent from the six guitar strings and has one voice.
export function writtenVocalNotes(a: Arrangement) {
  const size = barTicks(a.meter);
  return listBars(a)
    .flatMap(({ bar, number }) =>
      (bar.vocalNotes ?? []).map((note) => ({
        ...note,
        barId: bar.id,
        barNumber: number,
        startTick: (number - 1) * size + note.tick,
        barEnd: number * size,
      })),
    )
    .sort((left, right) => left.startTick - right.startTick);
}
export type WrittenVocalNote = ReturnType<typeof writtenVocalNotes>[number];
export function sameVocalPitch(left: VocalNote, right: VocalNote) {
  return (
    left.degree !== 0 &&
    left.degree === right.degree &&
    left.octave === right.octave &&
    (left.accidental ?? 0) === (right.accidental ?? 0)
  );
}
export function vocalProblems(a: Arrangement) {
  const notes = writtenVocalNotes(a),
    result: { barId: string; message: string; gap: number }[] = [];
  notes.forEach((note, index) => {
    const next = notes[index + 1];
    if (
      note.tick >= barTicks(a.meter) ||
      note.startTick + note.durationTicks > note.barEnd ||
      (next && note.startTick + note.durationTicks > next.startTick)
    )
      result.push({
        barId: note.barId,
        gap: 0,
        message: "第 " + note.barNumber + " 小节的唱音时值超出小节或覆盖后音",
      });
    if (
      note.tieToNext &&
      (!next ||
        !sameVocalPitch(note, next) ||
        next.startTick !== note.startTick + note.durationTicks)
    )
      result.push({
        barId: note.barId,
        gap: 0,
        message: "第 " + note.barNumber + " 小节的唱音延音必须连接紧邻的同音",
      });
  });
  return result;
}
export function repairVocalLinks(a: Arrangement): Arrangement {
  const notes = writtenVocalNotes(a),
    edits = new Map<string, VocalNote>();
  notes.forEach((note, index) => {
    const next = notes[index + 1],
      durationTicks = Math.max(
        1,
        Math.min(
          note.durationTicks,
          note.barEnd - note.startTick,
          (next?.startTick ?? Infinity) - note.startTick,
        ),
      );
    edits.set(note.id, {
      id: note.id,
      tick: note.tick,
      degree: note.degree,
      octave: note.octave,
      ...(note.accidental !== undefined ? { accidental: note.accidental } : {}),
      durationTicks,
      ...(note.tieToNext
        ? {
            tieToNext:
              !!next &&
              sameVocalPitch(note, next) &&
              next.startTick === note.startTick + durationTicks,
          }
        : {}),
    });
  });
  return {
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        ...(bar.vocalNotes
          ? { vocalNotes: bar.vocalNotes.map((note) => edits.get(note.id)!) }
          : {}),
      })),
    })),
  };
}

// Lyrics anchor to vocal onsets by default; free text keeps an independent onset.
// The optional legacy reference is resolved without modifying the loaded score.
export function lyricVocalNote(
  a: Arrangement,
  barId: string,
  lyric: ArrangementLyric,
): WrittenVocalNote | undefined {
  if (lyric.anchorMode === "free") return;
  const item = listBars(a).find(({ bar }) => bar.id === barId);
  if (!item) return;
  const note = item.bar.vocalNotes?.find(
    (candidate) =>
      candidate.degree !== 0 &&
      candidate.tick === lyric.tick &&
      (!lyric.vocalNoteId || candidate.id === lyric.vocalNoteId),
  );
  return note
    ? {
        ...note,
        barId,
        barNumber: item.number,
        startTick: (item.number - 1) * barTicks(a.meter) + note.tick,
        barEnd: item.number * barTicks(a.meter),
      }
    : undefined;
}
export function lyricProblems(a: Arrangement) {
  const notes = writtenVocalNotes(a),
    byId = new Map(notes.map((note) => [note.id, note])),
    byPosition = new Map(
      notes.map((note) => [note.barId + ":" + note.tick, note]),
    );
  const result: { barId: string; message: string; gap: number }[] = [];
  for (const { bar, number } of listBars(a))
    for (const lyric of bar.lyrics ?? []) {
      const source = lyric.vocalNoteId
        ? byId.get(lyric.vocalNoteId)
        : byPosition.get(bar.id + ":" + lyric.tick);
      if (
        lyric.anchorMode === "free" &&
        (lyric.vocalNoteId || lyric.endVocalNoteId)
      )
        result.push({
          barId: bar.id,
          gap: 0,
          message: "自由歌词不能同时关联唱音或延唱末音",
        });
      if (
        lyric.vocalNoteId &&
        (!source ||
          source.degree === 0 ||
          source.barId !== bar.id ||
          source.tick !== lyric.tick)
      )
        result.push({
          barId: bar.id,
          gap: 0,
          message: "第 " + number + " 小节歌词必须关联同拍的有效唱音",
        });
      if (lyric.endVocalNoteId) {
        const end = byId.get(lyric.endVocalNoteId);
        if (
          lyric.anchorMode === "free" ||
          !source ||
          source.degree === 0 ||
          !end ||
          end.degree === 0 ||
          end.startTick < source.startTick
        )
          result.push({
            barId: bar.id,
            gap: 0,
            message: "歌词延唱末音必须在关联唱音之后，且不能是休止",
          });
      }
    }
  return result;
}
// Used after deleting/reordering bars. Never throw away text when its note disappears.
export function repairLyricLinks(a: Arrangement): Arrangement {
  const notes = writtenVocalNotes(a),
    byId = new Map(notes.map((note) => [note.id, note])),
    byPosition = new Map(
      notes.map((note) => [note.barId + ":" + note.tick, note]),
    );
  let changed = false;
  const sections = a.sections.map((section) => ({
    ...section,
    bars: section.bars.map((bar) => {
      if (!bar.lyrics) return bar;
      const lyrics = bar.lyrics.map((lyric) => {
        const source = lyric.vocalNoteId
          ? byId.get(lyric.vocalNoteId)
          : byPosition.get(bar.id + ":" + lyric.tick);
        const invalidSource =
          !!lyric.vocalNoteId &&
          (!source ||
            source.degree === 0 ||
            source.barId !== bar.id ||
            source.tick !== lyric.tick);
        const end = lyric.endVocalNoteId
          ? byId.get(lyric.endVocalNoteId)
          : undefined;
        const invalidEnd =
          !!lyric.endVocalNoteId &&
          (!source ||
            source.degree === 0 ||
            !end ||
            end.degree === 0 ||
            end.startTick < source.startTick);
        if (
          invalidSource ||
          (lyric.anchorMode === "free" &&
            (lyric.vocalNoteId || lyric.endVocalNoteId)) ||
          invalidEnd
        ) {
          const result = { ...lyric };
          if (invalidSource || lyric.anchorMode === "free") {
            result.anchorMode = "free";
            delete result.vocalNoteId;
          }
          delete result.endVocalNoteId;
          changed = true;
          return result;
        }
        return lyric;
      });
      return { ...bar, lyrics };
    }),
  }));
  return changed ? { ...a, sections } : a;
}
