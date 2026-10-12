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
  // A 3:2 group may mix note values: an eighth rest and a quarter note can
  // occupy the same group as three eighths. Keep the group's unit separate
  // from each written duration, and retain explicitly shifted equal triplets.
  type TupletWindow = {
    start: number;
    end: number;
    step: number;
    span: number;
    lane: number;
  };
  const windows: TupletWindow[] = [];
  const fits = (n: RhythmItem, window: TupletWindow) =>
    !!n.shape?.triplet &&
    n.tick >= window.start &&
    n.tick + n.duration <= window.end &&
    (n.tick - window.start) % Math.min(n.duration, window.step) === 0;
  const overlaps = (n: RhythmItem, window: TupletWindow) =>
    n.tick < window.end && n.tick + n.duration > window.start;
  for (const item of items) {
    if (!item.shape?.triplet) continue;
    const voice = items.filter((n) => n.lane === item.lane);
    if (windows.some((w) => w.lane === item.lane && fits(item, w))) continue;
    const step = item.duration,
      span = step * 3,
      threeNotes = [1, 2].every((offset) =>
        voice.some(
          (n) =>
            n.tick === item.tick + offset * step &&
            n.shape?.triplet &&
            n.duration === step,
        ),
      ),
      shifted: TupletWindow = {
        start: item.tick,
        end: Math.min(limit, item.tick + span),
        step,
        span,
        lane: item.lane,
      };
    let window: TupletWindow | undefined;
    if (!threeNotes) {
      // A quarter triplet at tick 8 fits the last two subdivisions of a
      // quarter beat. Smaller metrical units are considered only for groups
      // of at least one beat; a lone offbeat eighth keeps its shifted group.
      for (let unit = step; unit >= 2; unit /= 2) {
        if (unit !== step && unit * 3 < 24) break;
        const start = Math.floor(item.tick / (unit * 3)) * unit * 3,
          candidate: TupletWindow = {
            start,
            end: Math.min(limit, start + unit * 3),
            step: unit,
            span: unit * 3,
            lane: item.lane,
          };
        if (
          fits(item, candidate) &&
          windows.every(
            (w) =>
              w.lane !== item.lane ||
              w.end <= candidate.start ||
              w.start >= candidate.end,
          ) &&
          voice.every((n) => !overlaps(n, candidate) || fits(n, candidate))
        ) {
          window = candidate;
          break;
        }
      }
    }
    window ??= shifted;
    const conflict = voice.find(
      (n) => n.tick >= window.start && n.tick < window.end && !fits(n, window),
    );
    if (conflict) window.end = conflict.tick;
    if (window.end > window.start) windows.push(window);
  }
  const pulse = meter === "6/8" ? 36 : 24;
  const tripletValues = bases.map((base) => (base * 2) / 3);
  function silence(start: number, end: number, lane = 0) {
    while (start < end) {
      const window = windows.find(
        (w) => w.lane === lane && start >= w.start && start < w.end,
      );
      const nextWindow = windows
        .filter((w) => w.lane === lane && w.start > start)
        .reduce((n, w) => Math.min(n, w.start), end);
      const boundary = Math.min(
        end,
        window?.end ?? Math.ceil((start + 1) / pulse) * pulse,
        nextWindow,
      );
      const values =
        meter === "6/8" ? [36, 24, 18, 12, 6, 3, 1] : [24, 12, 6, 3, 1];
      const remainder = boundary - start,
        tupletRest =
          window &&
          tripletValues.find(
            (v) =>
              v <= remainder &&
              (start - window.start) % Math.min(v, window.step) === 0,
          ),
        ordinaryRest = values.find(
          (v) => v <= remainder && (start % pulse) % v === 0,
        )!,
        duration =
          tupletRest ||
          // Off-grid gaps can end on a fractional beat. Prefer one known
          // value to a row of one-tick placeholders without moving any onset.
          (ordinaryRest === 1 && rhythmShape(remainder)
            ? remainder
            : ordinaryRest);
      rests.push({
        tick: start,
        duration,
        rest: true,
        lane,
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
  // Secondary voices need rests within a tuplet to explain its ratio, but
  // should not gain unrelated rest symbols throughout the whole measure.
  for (const window of windows.filter((w) => w.lane !== 0)) {
    let end = window.start;
    for (const item of items.filter(
      (n) => n.lane === window.lane && overlaps(n, window),
    )) {
      if (item.tick > end) silence(end, item.tick, window.lane);
      end = Math.max(end, item.tick + item.duration);
    }
    if (end < window.end) silence(end, window.end, window.lane);
  }
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
      window.end - window.start === window.span &&
      group[0].tick === window.start &&
      group.at(-1)!.tick + group.at(-1)!.duration === window.end &&
      group.every(
        (item, index) =>
          fits(item, window) &&
          (!index ||
            group[index - 1].tick + group[index - 1].duration === item.tick),
      );
    group.forEach((item) => tupletGroups.set(item, tuplets.length));
    tuplets.push({ items: group, complete });
  }
  // A compact fractional rest outside an authored group still needs its
  // explicit 3:2 ratio. It does not imply three new notes or a complete group.
  for (const rest of rests) {
    if (rest.shape?.triplet && !tupletGroups.has(rest)) {
      tupletGroups.set(rest, tuplets.length);
      tuplets.push({ items: [rest], complete: false });
    }
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
