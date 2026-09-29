import {
  arrangementSchema,
  barTicks,
  eventAttacks,
  listBars,
  repairNoteLinks,
  writtenNotes,
  type Arrangement,
  type ArrangementEvent,
} from "./arrangement";
export type ScoreCursor = {
  barId: string;
  eventId: string;
  tick?: number;
  stringIndex?: number;
};
export type TickSpan = { start: number; end: number };
type Note = NonNullable<ArrangementEvent["notes"]>[number];
export type ScorePassage = {
  ticks: number;
  events: {
    start: number;
    duration: number;
    chord: ArrangementEvent["chord"];
    stroke: ArrangementEvent["stroke"];
  }[];
  notes: (Note & { start: number; durationTicks: number })[];
};
export function cursorTick(a: Arrangement, c: ScoreCursor) {
  const bars = listBars(a),
    i = bars.findIndex((b) => b.bar.id === c.barId);
  if (i < 0 || c.tick === undefined) return undefined;
  let t = i * barTicks(a.meter);
  for (const e of bars[i].bar.events) {
    if (e.id === c.eventId) return t + c.tick;
    t += e.durationTicks;
  }
}
export function cursorAt(
  a: Arrangement,
  tick: number,
  stringIndex = 5,
): ScoreCursor | undefined {
  const size = barTicks(a.meter),
    item = listBars(a)[Math.floor(tick / size)];
  if (!item || tick < 0) return;
  let offset = tick % size;
  for (const e of item.bar.events) {
    if (offset < e.durationTicks)
      return { barId: item.bar.id, eventId: e.id, tick: offset, stringIndex };
    offset -= e.durationTicks;
  }
}
export function scoreSpan(
  a: Arrangement,
  cursor: ScoreCursor,
  anchor: ScoreCursor | null,
  duration: number,
): TickSpan | undefined {
  const t = cursorTick(a, cursor),
    first = anchor ? cursorTick(a, anchor) : t;
  if (t === undefined || first === undefined) return;
  const start = Math.min(t, first),
    last = Math.max(t, first),
    notes = writtenNotes(a).filter((n) => n.startTick === last);
  const tail = notes.length
    ? Math.max(...notes.map((n) => n.durationTicks))
    : duration;
  return {
    start,
    end: Math.min(listBars(a).length * barTicks(a.meter), last + tail),
  };
}
function explicit(e: ArrangementEvent, a: Arrangement): Note[] {
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
// A rest also cuts notes that sustain into the chosen interval.
export function clearPassage(a: Arrangement, span: TickSpan): Arrangement {
  const size = barTicks(a.meter);
  let bi = 0;
  return repairNoteLinks({
    ...a,
    sections: a.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => {
        let at = bi++ * size;
        return {
          ...b,
          events: b.events.map((e) => {
            const start = at;
            at += e.durationTicks;
            const notes = explicit(e, a);
            if (
              !notes.some(
                (n) =>
                  start + n.offsetTick < span.end &&
                  start +
                    n.offsetTick +
                    Math.max(n.durationTicks!, n.sustainTicks ?? 0) >
                    span.start,
              )
            )
              return e;
            return {
              ...e,
              notes: notes
                .filter(
                  (n) =>
                    start + n.offsetTick < span.start ||
                    start + n.offsetTick >= span.end,
                )
                .map((n) =>
                  start + n.offsetTick < span.start &&
                  start +
                    n.offsetTick +
                    Math.max(n.durationTicks!, n.sustainTicks ?? 0) >
                    span.start
                    ? {
                        ...n,
                        durationTicks: Math.min(
                          n.durationTicks!,
                          span.start - start - n.offsetTick,
                        ),
                        sustainTicks: Math.min(
                          n.sustainTicks ?? n.durationTicks!,
                          span.start - start - n.offsetTick,
                        ),
                        tieToNext: false,
                      }
                    : n,
                ),
            };
          }),
        };
      }),
    })),
  });
}
export function copyPassage(a: Arrangement, span: TickSpan): ScorePassage {
  const events: ScorePassage["events"] = [];
  const size = barTicks(a.meter);
  listBars(a).forEach(({ bar }, i) => {
    let at = i * size;
    for (const e of bar.events) {
      const start = Math.max(at, span.start),
        end = Math.min(at + e.durationTicks, span.end);
      if (end > start)
        events.push({
          start: start - span.start,
          duration: end - start,
          chord: structuredClone(e.chord),
          stroke: e.stroke ?? (a.pattern === "strum" ? "down" : "pluck"),
        });
      at += e.durationTicks;
    }
  });
  const notes = writtenNotes(a)
    .filter((n) => n.startTick >= span.start && n.startTick < span.end)
    .map((n) => ({
      start: n.startTick - span.start,
      offsetTick: 0,
      stringIndex: n.stringIndex,
      fret: n.fret,
      durationTicks: Math.min(n.durationTicks, span.end - n.startTick),
      ...(n.gateTicks !== n.durationTicks
        ? { sustainTicks: Math.min(n.gateTicks, span.end - n.startTick) }
        : {}),
      ...(n.marker ? { marker: n.marker } : {}),
      ...(n.tieToNext && n.startTick + n.durationTicks < span.end
        ? { tieToNext: true }
        : {}),
    }));
  return { ticks: span.end - span.start, events, notes };
}
// Replace a musical interval, including rests and harmony, without shifting later music.
export function pastePassage(
  a: Arrangement,
  at: number,
  passage: ScorePassage,
): Arrangement {
  const size = barTicks(a.meter),
    end = at + passage.ticks;
  if (at < 0 || !Number.isInteger(at) || end > listBars(a).length * size)
    throw Error("剩余小节不足，请先添加小节再粘贴。");
  const cleared = clearPassage(a, { start: at, end });
  let bi = 0;
  const result: Arrangement = {
    ...cleared,
    sections: cleared.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => {
        const base = bi++ * size;
        if (base >= end || base + size <= at) return b;
        const fragments: { at: number; event: ArrangementEvent }[] = [];
        let offset = base;
        for (const e of b.events) {
          const es = offset,
            ee = es + e.durationTicks;
          offset = ee;
          for (const [start, stop] of [
            [es, Math.min(ee, at)],
            [Math.max(es, end), ee],
          ])
            if (stop > start)
              fragments.push({
                at: start,
                event: {
                  ...e,
                  id: crypto.randomUUID(),
                  durationTicks: stop - start,
                  notes: explicit(e, cleared)
                    .filter(
                      (n) =>
                        es + n.offsetTick >= start && es + n.offsetTick < stop,
                    )
                    .map((n) => ({
                      ...n,
                      offsetTick: es + n.offsetTick - start,
                    })),
                },
              });
        }
        for (const fragment of passage.events) {
          const fs = at + fragment.start,
            fe = fs + fragment.duration,
            start = Math.max(base, fs),
            stop = Math.min(base + size, fe);
          if (stop <= start) continue;
          const notes: Note[] = [];
          for (const n of passage.notes) {
            const ns = at + n.start,
              ne = ns + n.durationTicks,
              onset = Math.max(ns, base);
            if (onset < start || onset >= stop || ne <= onset) continue;
            const carry = ns < base;
            notes.push({
              offsetTick: onset - start,
              stringIndex: n.stringIndex,
              fret: n.fret,
              durationTicks: Math.min(ne, base + size) - onset,
              ...(n.sustainTicks
                ? {
                    sustainTicks: Math.max(
                      0.001,
                      Math.min(ns + n.sustainTicks, base + size) - onset,
                    ),
                  }
                : {}),
              ...(n.marker &&
              (!carry || fragment.chord?.frets[n.stringIndex] === n.fret)
                ? { marker: n.marker }
                : {}),
              ...(ne > base + size || n.tieToNext ? { tieToNext: true } : {}),
            });
          }
          fragments.push({
            at: start,
            event: {
              id: crypto.randomUUID(),
              chord: structuredClone(fragment.chord),
              ...(fragment.stroke ? { stroke: fragment.stroke } : {}),
              durationTicks: stop - start,
              notes,
            },
          });
        }
        return {
          ...b,
          events: fragments.sort((a, b) => a.at - b.at).map((f) => f.event),
        };
      }),
    })),
  };
  const repaired = repairNoteLinks(result);
  if (!arrangementSchema.safeParse(repaired).success)
    throw Error("这段内容无法放入当前位置，请检查小节容量和和弦按法。");
  return repaired;
}
