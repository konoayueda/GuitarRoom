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
  function silence(start: number, end: number) {
    const values = [
      96, 84, 72, 48, 42, 36, 24, 21, 18, 16, 12, 9, 8, 6, 4, 3, 2, 1,
    ];
    while (start < end) {
      const duration = values.find((v) => v <= end - start)!;
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
