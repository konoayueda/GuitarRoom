import {
  arrangementSchema,
  barTicks,
  eventAttacks,
  listBars,
  nextOnString,
  repairNoteLinks,
  tieCandidate,
  writtenNotes,
  type Arrangement,
  type ArrangementEvent,
  type WrittenNote,
} from "./arrangement";
import { cursorAt, cursorTick, type ScoreCursor } from "./score-editing";

type Note = NonNullable<ArrangementEvent["notes"]>[number];
const noteKey = (n: {
  eventId: string;
  offsetTick: number;
  stringIndex: number;
}) => `${n.eventId}:${n.offsetTick}:${n.stringIndex}`;

function selectedNote(a: Arrangement, cursor: ScoreCursor) {
  const notes = writtenNotes(a);
  const note = notes.find(
    (n) =>
      n.barId === cursor.barId &&
      n.eventId === cursor.eventId &&
      n.offsetTick === cursor.tick &&
      n.stringIndex === cursor.stringIndex,
  );
  return { notes, note };
}

// A duration edit owns only the selected onset and its actual forward tie chain.
function forwardChain(notes: WrittenNote[], first?: WrittenNote) {
  const chain: WrittenNote[] = [];
  let note = first;
  while (note) {
    chain.push(note);
    const next = note.tieToNext ? tieCandidate(notes, note) : undefined;
    note =
      next && next.startTick === note.startTick + note.durationTicks
        ? next
        : undefined;
  }
  return chain;
}

export function scoreNoteDuration(a: Arrangement, cursor: ScoreCursor) {
  const { notes, note } = selectedNote(a, cursor);
  if (!note) return undefined;
  return forwardChain(notes, note).reduce((sum, n) => sum + n.durationTicks, 0);
}

function explicitNotes(e: ArrangementEvent, a: Arrangement): Note[] {
  return eventAttacks(e, a.pattern).map((n) => ({
    offsetTick: n.offsetTick,
    stringIndex: n.stringIndex,
    fret: n.fret,
    durationTicks: n.durationTicks,
    ...(n.gateTicks !== n.durationTicks ? { sustainTicks: n.gateTicks } : {}),
    ...(n.marker ? { marker: n.marker } : {}),
    ...(n.tieToNext ? { tieToNext: true } : {}),
  }));
}

function replaceNotes(
  a: Arrangement,
  owned: WrittenNote[],
  additions: Map<string, Note[]>,
) {
  const keys = new Set(owned.map(noteKey));
  const touched = new Set([
    ...owned.map((n) => n.eventId),
    ...additions.keys(),
  ]);
  return repairNoteLinks({
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        events: bar.events.map((event) =>
          touched.has(event.id)
            ? {
                ...event,
                notes: [
                  ...explicitNotes(event, a).filter(
                    (n) => !keys.has(noteKey({ ...n, eventId: event.id })),
                  ),
                  ...(additions.get(event.id) ?? []),
                ].sort(
                  (left, right) =>
                    left.offsetTick - right.offsetTick ||
                    left.stringIndex - right.stringIndex,
                ),
              }
            : event,
        ),
      })),
    })),
  });
}

/** Clear a written note and its tied continuation, retaining other voices. */
export function removeScoreNote(
  a: Arrangement,
  cursor: ScoreCursor,
): Arrangement {
  const { notes, note } = selectedNote(a, cursor);
  return note ? replaceNotes(a, forwardChain(notes, note), new Map()) : a;
}

/** Write one musical duration, splitting only at bar lines with tied continuations. */
export function putScoreNote(
  a: Arrangement,
  cursor: ScoreCursor,
  fret: number,
  ticks: number,
  marker?: "cross",
): Arrangement {
  const start = cursorTick(a, cursor),
    stringIndex = cursor.stringIndex,
    size = barTicks(a.meter),
    bars = listBars(a);
  if (
    start === undefined ||
    !Number.isInteger(start) ||
    cursor.tick === undefined ||
    cursor.tick < 0 ||
    stringIndex === undefined ||
    !Number.isInteger(stringIndex) ||
    stringIndex < 0 ||
    stringIndex > 5
  )
    throw Error("请先在谱面选择一个弦上的音符位置。");
  if (!Number.isInteger(fret) || fret < 0 || fret > 24)
    throw Error("品位须为 0 到 24 的整数。");
  const { notes, note } = selectedNote(a, cursor),
    owned = forwardChain(notes, note),
    previousTicks = owned.reduce((sum, n) => sum + n.durationTicks, 0),
    ownedKeys = new Set(owned.map(noteKey));
  // Changing pitch can retain an existing long tie chain beyond the duration palette.
  if (
    !Number.isInteger(ticks) ||
    !((ticks >= 2 && ticks <= 96) || (note && ticks === previousTicks))
  )
    throw Error("音符时值须在三十二分三连音到全音符之间。");
  const end = start + ticks;
  if (end > bars.length * size)
    throw Error("后续小节不足，请先添加小节，再输入跨小节长音。");
  const first = cursorAt(a, start, stringIndex);
  if (!first || first.eventId !== cursor.eventId || first.tick !== cursor.tick)
    throw Error("当前音符位置已变化，请重新选择谱面位置。");
  const source = bars
    .find(({ bar }) => bar.id === cursor.barId)
    ?.bar.events.find((event) => event.id === cursor.eventId);
  const pitch = marker === "cross" ? source?.chord?.frets[stringIndex] : fret;
  if (pitch === undefined || pitch < 0)
    throw Error("这根弦没有可弹的和弦按法，请选择和弦或输入数字品位。");
  // Inserting into a held slot cuts the earlier sound, as direct fret input does.
  const collision = notes.find(
    (n) =>
      n.stringIndex === stringIndex &&
      !ownedKeys.has(noteKey(n)) &&
      n.startTick >= start &&
      n.startTick < end,
  );
  if (collision)
    throw Error(
      `这个时值会覆盖第 ${collision.barNumber} 小节的同弦音符，请先留出空拍。`,
    );
  const additions = new Map<string, Note[]>();
  for (let onset = start; onset < end;) {
    const destination = cursorAt(a, onset, stringIndex);
    if (!destination)
      throw Error("后续小节尚未补齐，请先补齐空拍再输入跨小节长音。");
    const event = bars
      .find(({ bar }) => bar.id === destination.barId)!
      .bar.events.find((e) => e.id === destination.eventId)!;
    const stop = Math.min(end, (Math.floor(onset / size) + 1) * size);
    const part: Note = {
      offsetTick: destination.tick!,
      stringIndex,
      fret: pitch,
      durationTicks: stop - onset,
      ...(marker === "cross" && event.chord?.frets[stringIndex] === pitch
        ? { marker: "cross" as const }
        : {}),
      ...(stop < end ? { tieToNext: true } : {}),
    };
    additions.set(event.id, [...(additions.get(event.id) ?? []), part]);
    onset = stop;
  }
  const result = replaceNotes(a, owned, additions);
  if (!arrangementSchema.safeParse(result).success)
    throw Error("无法写入这个长音，请检查小节时值、音符数量和和弦按法。");
  return result;
}

export function setNoteDuration(
  a: Arrangement,
  cursor: ScoreCursor,
  ticks: number,
): Arrangement {
  if (!Number.isInteger(ticks) || ticks < 2 || ticks > 96)
    throw Error("音符时值须在三十二分三连音到全音符之间。");
  const { note } = selectedNote(a, cursor);
  if (!note) throw Error("请先选择一个音符，再修改时值。");
  return putScoreNote(a, cursor, note.fret, ticks, note.marker);
}

export type ScoreTieAvailability = {
  enabled: boolean;
  reason: string;
  action: "connect" | "create" | "disconnect" | "blocked";
};

type TiePlan = {
  action: "connect" | "create" | "disconnect";
  reason: string;
  note: WrittenNote;
  end: number;
};

function tiePlan(a: Arrangement, cursor: ScoreCursor): TiePlan {
  const { notes, note } = selectedNote(a, cursor);
  if (!note) throw Error("请先在谱面选择一个音符，再添加延音。");
  if (note.fret < 0 || !Number.isInteger(note.fret))
    throw Error("这个 × 缺少可弹的和弦按法，请先设置和弦或输入数字品位。");
  const end = note.startTick + note.durationTicks;
  if (note.tieToNext)
    return {
      action: "disconnect",
      reason: "取消与下一续音的延音线，保留续音。",
      note,
      end,
    };
  const next = nextOnString(notes, note);
  if (next && next.startTick < end)
    throw Error("当前音符与后面的同弦音符重叠，请先缩短时值。");
  if (next?.fret === note.fret)
    return {
      action: "connect",
      reason:
        next.barId === note.barId
          ? "延续到后面的同弦同品音符，中间空拍会补成续音。"
          : "跨小节延续到后面的同弦同品音符，中间空拍会补成续音。",
      note,
      end: next.startTick,
    };
  if (next && next.startTick === end)
    throw Error("下一音符是同弦不同品位，延音只能连接同弦同品音符。");
  const scoreEnd = listBars(a).length * barTicks(a.meter);
  if (end >= scoreEnd)
    throw Error("谱子已到末尾，请先添加下一小节，再添加延音。");
  return {
    action: "create",
    reason: "在音符结束处自动添加同弦同品续音，并画出延音线。",
    note,
    end: Math.min(
      end + note.durationTicks,
      next?.startTick ?? scoreEnd,
      scoreEnd,
    ),
  };
}

function noteFromWritten(note: WrittenNote): Note {
  return {
    offsetTick: note.offsetTick,
    stringIndex: note.stringIndex,
    fret: note.fret,
    durationTicks: note.durationTicks,
    ...(note.gateTicks !== note.durationTicks
      ? { sustainTicks: note.gateTicks }
      : {}),
    ...(note.marker ? { marker: note.marker } : {}),
    ...(note.tieToNext ? { tieToNext: true } : {}),
  };
}

// Bridge gaps with same-pitch notes at bar heads. Existing destination notes and
// their forward links are retained, including implicit arpeggio gate lengths.
function applyTiePlan(a: Arrangement, plan: TiePlan): Arrangement {
  const { note } = plan,
    additions = new Map<string, Note[]>();
  if (plan.action === "disconnect") {
    const source = noteFromWritten(note);
    delete source.tieToNext;
    additions.set(note.eventId, [source]);
  } else {
    const size = barTicks(a.meter),
      bars = listBars(a);
    let onset =
      plan.action === "create"
        ? note.startTick + note.durationTicks
        : note.startTick;
    if (plan.action === "create") {
      const source = { ...noteFromWritten(note), tieToNext: true };
      // A tied segment sustains until its continuation starts.
      delete source.sustainTicks;
      additions.set(note.eventId, [source]);
    }
    while (onset < plan.end) {
      const destination = cursorAt(a, onset, note.stringIndex);
      if (!destination)
        throw Error("后续小节尚未补齐，请先补齐空拍再添加延音。");
      const event = bars
        .find(({ bar }) => bar.id === destination.barId)!
        .bar.events.find((e) => e.id === destination.eventId)!;
      const stop = Math.min(plan.end, (Math.floor(onset / size) + 1) * size);
      const part: Note = {
        offsetTick: destination.tick!,
        stringIndex: note.stringIndex,
        fret: note.fret,
        durationTicks: stop - onset,
        ...(note.marker === "cross" &&
        event.chord?.frets[note.stringIndex] === note.fret
          ? { marker: "cross" as const }
          : {}),
        ...(stop < plan.end || plan.action === "connect"
          ? { tieToNext: true }
          : {}),
      };
      additions.set(event.id, [...(additions.get(event.id) ?? []), part]);
      onset = stop;
    }
  }
  const result = replaceNotes(a, [note], additions);
  if (!arrangementSchema.safeParse(result).success)
    throw Error("无法添加延音，请检查小节时值、音符数量和和弦按法。");
  return result;
}

/** Explain whether the tie button will connect an existing note or create one. */
export function scoreTieAvailability(
  a: Arrangement,
  cursor: ScoreCursor,
): ScoreTieAvailability {
  try {
    const plan = tiePlan(a, cursor);
    return { enabled: true, action: plan.action, reason: plan.reason };
  } catch (error) {
    return {
      enabled: false,
      action: "blocked",
      reason: error instanceof Error ? error.message : "当前位置无法添加延音。",
    };
  }
}

/** One immutable edit: connect, bridge or create a continuation; undo restores all. */
export function toggleScoreTie(
  a: Arrangement,
  cursor: ScoreCursor,
): Arrangement {
  return applyTiePlan(a, tiePlan(a, cursor));
}
