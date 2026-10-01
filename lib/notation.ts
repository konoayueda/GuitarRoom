import {
  barTicks,
  eventAttacks,
  type Arrangement,
  type ArrangementBar,
} from "./arrangement";
export type RhythmShape = {
  base: number;
  beams: number;
  dots: number;
  triplet: boolean;
};
const bases = [96, 48, 24, 12, 6, 3];
export function rhythmShape(ticks: number): RhythmShape | undefined {
  for (const base of bases) {
    const beams = Math.max(0, Math.log2(24 / base));
    if (ticks === base) return { base, beams, dots: 0, triplet: false };
    if (ticks === base * 1.5) return { base, beams, dots: 1, triplet: false };
    if (ticks === base * 1.75) return { base, beams, dots: 2, triplet: false };
    if (ticks === (base * 2) / 3)
      return { base, beams, dots: 0, triplet: true };
  }
}
export type RhythmItem = {
  tick: number;
  duration: number;
  rest: boolean;
  measureRest?: boolean;
  lane: number;
  strings: number[];
  shape?: RhythmShape;
};
export function barRhythm(
  bar: ArrangementBar,
  meter: Arrangement["meter"],
  pattern: Arrangement["pattern"],
) {
  const limit = barTicks(meter),
    groups = new Map<string, RhythmItem>();
  let offset = 0;
  for (const event of bar.events) {
    for (const note of eventAttacks(event, pattern)) {
      const tick = offset + note.offsetTick,
        duration = Math.min(note.durationTicks, limit - tick);
      if (duration <= 0) continue;
      const key = tick + ":" + duration,
        group = groups.get(key);
      if (group) group.strings.push(note.stringIndex);
      else
        groups.set(key, {
          tick,
          duration,
          rest: false,
          lane: 0,
          strings: [note.stringIndex],
          shape: rhythmShape(duration),
        });
    }
    offset += event.durationTicks;
  }
  const items = [...groups.values()].sort(
    (a, b) => a.tick - b.tick || b.duration - a.duration,
  );
  if (!items.length) {
    const rest: RhythmItem = {
      tick: 0,
      duration: limit,
      rest: true,
      measureRest: true,
      lane: 0,
      strings: [],
      shape: { base: 96, beams: 0, dots: 0, triplet: false },
    };
    return {
      items: [rest],
      tuplets: [] as { items: RhythmItem[]; complete: boolean }[],
      beamGroups: [] as RhythmItem[][],
      lanes: 1,
    };
  }
  const laneEnds: number[] = [],
    stringLanes = new Map<number, number>();
  for (const item of items) {
    const preferred = item.strings
      .map((string) => stringLanes.get(string))
      .filter(
        (lane): lane is number =>
          lane !== undefined && laneEnds[lane] <= item.tick,
      );
    let lane = preferred.length
      ? preferred[0]
      : laneEnds.findIndex((end) => end <= item.tick);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.tick + item.duration;
    item.strings.forEach((string) => stringLanes.set(string, lane));
  }
  // Show silence in the primary rhythm; sustained lower notes and shorter upper
  // notes get separate lanes instead of silently adopting the first duration.
  const primary = items.filter((n) => n.lane === 0),
    rests: RhythmItem[] = [];
  // Tuplet silence belongs only to a window introduced by an actual tuplet note.
  const windows = primary
    .filter((item) => item.shape?.triplet)
    .map((item) => {
      const span = item.duration * 3,
        start = Math.floor(item.tick / span) * span;
      return { start, end: Math.min(limit, start + span), step: item.duration };
    });
  const pulse = meter === "6/8" ? 36 : 24;
  function silence(start: number, end: number) {
    while (start < end) {
      const window = windows.find((w) => start >= w.start && start < w.end);
      const nextWindow = windows
        .filter((w) => w.start > start)
        .reduce((n, w) => Math.min(n, w.start), end);
      const boundary = Math.min(
        end,
        window?.end ?? Math.ceil((start + 1) / pulse) * pulse,
        nextWindow,
      );
      const inTuplet =
        !!window &&
        (start - window.start) % window.step === 0 &&
        start + window.step <= boundary;
      const values =
        meter === "6/8" ? [36, 24, 18, 12, 6, 3, 1] : [24, 12, 6, 3, 1];
      const duration = inTuplet
        ? window!.step
        : values.find(
            (v) => v <= boundary - start && (start % pulse) % v === 0,
          )!;
      rests.push({
        tick: start,
        duration,
        rest: true,
        lane: 0,
        strings: [],
        shape: rhythmShape(duration),
      });
      start += duration;
    }
  }
  let cursor = 0;
  for (const item of primary) {
    if (item.tick > cursor) silence(cursor, item.tick);
    cursor = item.tick + item.duration;
  }
  if (cursor < limit) silence(cursor, limit);
  items.push(...rests);
  items.sort((a, b) => a.lane - b.lane || a.tick - b.tick);
  const tuplets: { items: RhythmItem[]; complete: boolean }[] = [];
  const used = new Set<RhythmItem>();
  for (const item of items) {
    if (!item.shape?.triplet || used.has(item)) continue;
    const three = [
      item,
      ...[1, 2].flatMap((i) =>
        items.filter(
          (n) =>
            n.lane === item.lane &&
            n.tick === item.tick + i * item.duration &&
            n.duration === item.duration &&
            n.shape?.triplet,
        ),
      ),
    ];
    const complete =
      item.tick % (item.duration * 3) === 0 && three.length === 3;
    const group = complete ? three : [item];
    group.forEach((n) => used.add(n));
    tuplets.push({ items: group, complete });
  }
  const beamGroups: RhythmItem[][] = [];
  const unit = meter === "6/8" ? 36 : 24;
  let current: RhythmItem[] = [];
  for (const item of items) {
    const previous = current.at(-1);
    const span = item.shape?.triplet ? item.duration * 3 : unit;
    const connected =
      previous &&
      !item.rest &&
      item.shape &&
      item.shape.beams > 0 &&
      previous.lane === item.lane &&
      previous.tick + previous.duration === item.tick &&
      previous.shape?.triplet === item.shape.triplet &&
      Math.floor(previous.tick / span) === Math.floor(item.tick / span);
    if (!connected && current.length) {
      beamGroups.push(current);
      current = [];
    }
    if (!item.rest && item.shape && item.shape.beams > 0) current.push(item);
  }
  if (current.length) beamGroups.push(current);
  return { items, tuplets, beamGroups, lanes: Math.max(1, laneEnds.length) };
}
