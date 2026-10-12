import {
  barTicks,
  eventAttacks,
  listBars,
  tieCandidate,
  writtenNotes,
  type Arrangement,
  type ArrangementEvent,
} from "./arrangement";
import { rhythmShape } from "./notation";

type Note = NonNullable<ArrangementEvent["notes"]>[number];
export type EngravingOrigin = {
  barId: string;
  eventId: string;
  tick: number;
  stringIndex: number;
};
export type ScoreEngraving = {
  /** Presentation only: persist, edit and play the original arrangement. */
  arrangement: Arrangement;
  origins: Map<string, EngravingOrigin>;
  continuations: Set<string>;
};
export const scoreEngravingKey = (note: {
  eventId: string;
  offsetTick: number;
  stringIndex: number;
}) => `${note.eventId}:${note.offsetTick}:${note.stringIndex}`;

const normalValues = [96, 48, 24, 12, 6, 3];
const shapedValues = Array.from({ length: 96 }, (_, i) => 96 - i).filter(
  (ticks) => rhythmShape(ticks),
);

function metricalBoundary(tick: number, meter: Arrangement["meter"]) {
  const limit = barTicks(meter);
  if (tick === 0) return limit;
  const blocks = meter === "6/8" ? [36, 12, 6, 3] : [48, 24, 12, 6, 3];
  const aligned = blocks.find((block) => tick % block === 0);
  // A ternary phase rejoins the next ordinary pulse before larger durations.
  const pulse = meter === "6/8" ? 12 : 24;
  return Math.min(
    limit,
    aligned ? tick + aligned : Math.ceil((tick + 1) / pulse) * pulse,
  );
}

function fragments(
  tick: number,
  duration: number,
  meter: Arrangement["meter"],
) {
  const end = tick + duration;
  if (
    !Number.isInteger(tick) ||
    !Number.isInteger(duration) ||
    duration < 2 ||
    end > barTicks(meter)
  )
    return undefined;
  const parts: { tick: number; duration: number }[] = [];
  while (tick < end) {
    const capacity = Math.min(end, metricalBoundary(tick, meter)) - tick;
    // A one-tick remainder has no glyph in this vocabulary. Do not invent time.
    const usable = (value: number) =>
      value <= capacity && end - tick - value !== 1;
    const duration =
      rhythmShape(capacity) && usable(capacity)
        ? capacity
        : (normalValues.find((value) => usable(value) && tick % value === 0) ??
          shapedValues.find(usable) ??
          // An odd phase can put the next beat only one tick away. Cross that
          // boundary with the smallest glyph instead of leaving a fake 1 tick.
          [...shapedValues]
            .reverse()
            .find((value) => value <= end - tick && end - tick - value !== 1));
    if (!duration) return undefined;
    parts.push({ tick, duration });
    tick += duration;
  }
  return parts;
}

function materializedNotes(
  event: ArrangementEvent,
  pattern: Arrangement["pattern"],
): Note[] {
  return eventAttacks(event, pattern).map((attack) => {
    const original = event.notes?.find(
      (note) =>
        note.offsetTick === attack.offsetTick &&
        note.stringIndex === attack.stringIndex,
    );
    return {
      ...original,
      offsetTick: attack.offsetTick,
      stringIndex: attack.stringIndex,
      fret: attack.fret >= 0 ? attack.fret : (original?.fret ?? 0),
      durationTicks: attack.durationTicks,
      ...(attack.gateTicks !== attack.durationTicks
        ? { sustainTicks: attack.gateTicks }
        : {}),
      ...(attack.marker ? { marker: attack.marker } : {}),
      ...(attack.tieToNext ? { tieToNext: true } : {}),
    };
  });
}

/**
 * Split unshaped durations into readable, tied notation without editing music.
 * Existing shaped notes, event boundaries and untouched events remain intact.
 * Virtual notes select their original source; they never create playback onsets.
 */
export function engraveScore(arrangement: Arrangement): ScoreEngraving {
  const origins = new Map<string, EngravingOrigin>();
  const continuations = new Set<string>();
  const notes = writtenNotes(arrangement);
  for (const note of notes) {
    if (!note.tieToNext) continue;
    const next = tieCandidate(notes, note);
    if (next && next.startTick === note.startTick + note.durationTicks)
      continuations.add(scoreEngravingKey(next));
  }
  const occupied = new Set(notes.map(scoreEngravingKey));
  const counts = new Map<string, number>();
  for (const note of notes) {
    const key = scoreEngravingKey(note);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const size = barTicks(arrangement.meter);
  const segments = new Map(
    listBars(arrangement).map(({ bar }) => {
      let tick = 0;
      return [
        bar.id,
        bar.events.map((event) => {
          const start = tick;
          tick += event.durationTicks;
          return { event, start, end: tick };
        }),
      ] as const;
    }),
  );
  const changed = new Map<string, Note[]>();
  const touch = (event: ArrangementEvent) => {
    let explicit = changed.get(event.id);
    if (!explicit) {
      explicit = materializedNotes(event, arrangement.pattern);
      changed.set(event.id, explicit);
    }
    return explicit;
  };
  for (const note of notes) {
    const sourceKey = scoreEngravingKey(note);
    if (
      rhythmShape(note.durationTicks) ||
      note.fret < 0 ||
      counts.get(sourceKey)! > 1
    )
      continue;
    const localTick = note.startTick - (note.barNumber - 1) * size;
    const parts = fragments(localTick, note.durationTicks, arrangement.meter);
    if (!parts || parts.length < 2) continue;
    const barSegments = segments.get(note.barId)!;
    const destinations = parts.map((part) =>
      barSegments.find(
        (segment) => part.tick >= segment.start && part.tick < segment.end,
      ),
    );
    if (destinations.some((destination) => !destination)) continue;
    const keys = parts.map((part, i) =>
      scoreEngravingKey({
        eventId: destinations[i]!.event.id,
        offsetTick: part.tick - destinations[i]!.start,
        stringIndex: note.stringIndex,
      }),
    );
    // Legacy or unfinished scores can contain overlaps. Leave their source
    // intact rather than add a second selectable head at an occupied position.
    if (keys.some((key) => key !== sourceKey && occupied.has(key))) continue;
    const source = barSegments.find(
      (segment) => segment.event.id === note.eventId,
    )!.event;
    const existing = touch(source);
    const index = existing.findIndex(
      (n) =>
        n.offsetTick === note.offsetTick && n.stringIndex === note.stringIndex,
    );
    if (index < 0) continue;
    existing.splice(index, 1);
    const origin: EngravingOrigin = {
      barId: note.barId,
      eventId: note.eventId,
      tick: note.offsetTick,
      stringIndex: note.stringIndex,
    };
    parts.forEach((part, i) => {
      const destination = destinations[i]!;
      const elapsed = part.tick - localTick;
      const sustain =
        i < parts.length - 1
          ? Math.min(part.duration, note.gateTicks - elapsed)
          : note.gateTicks - elapsed;
      const displayed: Note = {
        offsetTick: part.tick - destination.start,
        stringIndex: note.stringIndex,
        fret: note.fret,
        durationTicks: part.duration,
        ...(note.marker === "cross" &&
        destination.event.chord?.frets[note.stringIndex] === note.fret
          ? { marker: "cross" as const }
          : {}),
        ...(sustain > 0 && sustain !== part.duration
          ? { sustainTicks: sustain }
          : {}),
        ...(i < parts.length - 1 || note.tieToNext ? { tieToNext: true } : {}),
      };
      touch(destination.event).push(displayed);
      const key = scoreEngravingKey({
        ...displayed,
        eventId: destination.event.id,
      });
      origins.set(key, origin);
      occupied.add(key);
      if (i > 0) continuations.add(key);
    });
  }
  if (!changed.size) return { arrangement, origins, continuations };
  return {
    arrangement: {
      ...arrangement,
      sections: arrangement.sections.map((section) => ({
        ...section,
        bars: section.bars.map((bar) => ({
          ...bar,
          events: bar.events.map((event) => {
            const notes = changed.get(event.id);
            return notes
              ? {
                  ...event,
                  notes: notes.sort(
                    (left, right) =>
                      left.offsetTick - right.offsetTick ||
                      left.stringIndex - right.stringIndex,
                  ),
                }
              : event;
          }),
        })),
      })),
    },
    origins,
    continuations,
  };
}
