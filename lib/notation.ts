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
  // Tuplets can start between beats. Infer their windows from the written voice,
  // retaining a metrical window only when its existing notes fit that lattice.
  const windows: { start: number; end: number; step: number; lane: number }[] = [];
  for (const item of items) {
    if (!item.shape?.triplet) continue;
    const step = item.duration,
      span = step * 3,
      voice = items.filter((n) => n.lane === item.lane),
      fits = (n: RhythmItem, start: number) =>
        n.shape?.triplet &&
        n.duration === step &&
        (n.tick - start) % step === 0;
    if (
      windows.some(
        (w) =>
          w.lane === item.lane &&
          w.step === step &&
          item.tick >= w.start &&
          item.tick < w.end &&
          fits(item, w.start),
      )
    )
      continue;
    const metricalStart = Math.floor(item.tick / span) * span,
      metricalEnd = Math.min(limit, metricalStart + span),
      threeNotes = [1, 2].every((offset) =>
        voice.some(
          (n) => n.tick === item.tick + offset * step && fits(n, item.tick),
        ),
      ),
      metricalFits =
        fits(item, metricalStart) &&
        windows.every(
          (w) =>
            w.lane !== item.lane ||
            w.end <= metricalStart ||
            w.start >= metricalEnd,
        ) &&
        voice.every(
          (n) =>
            n.tick >= metricalEnd ||
            n.tick + n.duration <= metricalStart ||
            fits(n, metricalStart),
        ),
      start = threeNotes || !metricalFits ? item.tick : metricalStart;
    let end = Math.min(limit, start + span);
    const conflict = voice.find(
      (n) => n.tick >= start && n.tick < end && !fits(n, start),
    );
    if (conflict) end = conflict.tick;
    windows.push({ start, end, step, lane: item.lane });
  }
  const pulse = meter === "6/8" ? 36 : 24;
  function silence(start: number, end: number) {
    while (start < end) {
      const window = windows.find(
        (w) => w.lane === 0 && start >= w.start && start < w.end,
      );
      const nextWindow = windows
        .filter((w) => w.lane === 0 && w.start > start)
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
      const remainder = boundary - start,
        exact = window && rhythmShape(remainder);
      const duration = inTuplet
        ? window!.step
        : exact
          ? remainder
          : values.find((v) => v <= remainder && (start % pulse) % v === 0)!;
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
  const tupletGroups = new Map<RhythmItem, number>();
  for (const window of windows) {
    const group = items.filter(
      (item) =>
        item.lane === window.lane &&
        item.tick >= window.start &&
        item.tick < window.end &&
        item.shape?.triplet,
    );
    if (!group.length) continue;
    const complete =
      window.end - window.start === window.step * 3 &&
      group.length === 3 &&
      group.every(
        (item, index) =>
          item.tick === window.start + index * window.step &&
          item.duration === window.step,
      );
    group.forEach((item) => tupletGroups.set(item, tuplets.length));
    tuplets.push({ items: group, complete });
  }
  const beamGroups: RhythmItem[][] = [];
  const unit = meter === "6/8" ? 36 : 24;
  let current: RhythmItem[] = [];
  for (const item of items) {
    const previous = current.at(-1);
    const connected =
      previous &&
      !item.rest &&
      item.shape &&
      item.shape.beams > 0 &&
      previous.lane === item.lane &&
      previous.tick + previous.duration === item.tick &&
      previous.shape?.triplet === item.shape.triplet &&
      (item.shape.triplet
        ? tupletGroups.get(previous) === tupletGroups.get(item)
        : Math.floor(previous.tick / unit) === Math.floor(item.tick / unit));
    if (!connected && current.length) {
      beamGroups.push(current);
      current = [];
    }
    if (!item.rest && item.shape && item.shape.beams > 0) current.push(item);
  }
  if (current.length) beamGroups.push(current);
  return { items, tuplets, beamGroups, lanes: Math.max(1, laneEnds.length) };
}
