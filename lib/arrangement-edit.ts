import {
  eventAttacks,
  makeEvent,
  type Arrangement,
  type ArrangementBar,
  type ArrangementEvent,
} from "./arrangement";
export function writeNote(
  event: ArrangementEvent,
  pattern: Arrangement["pattern"],
  offsetTick: number,
  stringIndex: number,
  fret: number | null,
  durationTicks = 12,
  marker?: "cross",
): ArrangementEvent {
  const materialized = materializeNotes(event, pattern);
  const previous = materialized.find(
    (n) => n.offsetTick === offsetTick && n.stringIndex === stringIndex,
  );
  const notes = materialized.filter(
    (n) => n.offsetTick !== offsetTick || n.stringIndex !== stringIndex,
  );
  if (fret !== null)
    notes.push({
      ...(previous
        ? previous
        : {
            durationTicks: Math.min(
              durationTicks,
              event.durationTicks - offsetTick,
            ),
          }),
      offsetTick,
      stringIndex,
      fret,
      marker,
      ...(previous?.tieToNext ? { tieToNext: false } : {}),
    });
  return {
    ...event,
    ...(marker === "cross" && !event.stroke
      ? { stroke: "pluck" as const }
      : {}),
    notes: notes.sort(
      (a, b) => a.offsetTick - b.offsetTick || a.stringIndex - b.stringIndex,
    ),
  };
}
export function splitEvent(
  bar: ArrangementBar,
  eventId: string,
  at?: number,
  pattern: Arrangement["pattern"] = "strum",
): ArrangementBar {
  return {
    ...bar,
    events: bar.events.flatMap((e) => {
      if (e.id !== eventId || e.durationTicks < 2) return [e];
      const left = Math.max(
        1,
        Math.min(e.durationTicks - 1, at ?? Math.floor(e.durationTicks / 2)),
      );
      const notes = e.notes?.map((n) => ({
        ...n,
        durationTicks:
          n.durationTicks ??
          eventAttacks(e, pattern).find(
            (a) =>
              a.offsetTick === n.offsetTick && a.stringIndex === n.stringIndex,
          )!.durationTicks,
      }));
      return [
        {
          ...e,
          durationTicks: left,
          ...(notes ? { notes: notes.filter((n) => n.offsetTick < left) } : {}),
        },
        {
          ...makeEvent(e.chord, e.durationTicks - left),
          ...(e.stroke ? { stroke: e.stroke } : {}),
          ...(notes
            ? {
                notes: notes
                  .filter((n) => n.offsetTick >= left)
                  .map((n) => ({ ...n, offsetTick: n.offsetTick - left })),
              }
            : {}),
        },
      ];
    }),
  };
}
export function isRest(event: ArrangementEvent) {
  return event.notes !== undefined
    ? event.notes.length === 0
    : event.chord === null;
}
// Extending a duration consumes only following silence, leaving other notes in place.
export function durationCapacity(
  bar: ArrangementBar,
  eventId: string,
  limit: number,
) {
  const index = bar.events.findIndex((e) => e.id === eventId);
  if (index < 0) return 0;
  let result = bar.events[index].durationTicks,
    i = index + 1;
  for (; i < bar.events.length && isRest(bar.events[i]); i++)
    result += bar.events[i].durationTicks;
  if (i === bar.events.length)
    result += Math.max(
      0,
      limit - bar.events.reduce((n, e) => n + e.durationTicks, 0),
    );
  return Math.min(limit, result);
}
export function resizeEvent(
  bar: ArrangementBar,
  eventId: string,
  ticks: number,
  limit: number,
): ArrangementBar {
  const index = bar.events.findIndex((e) => e.id === eventId);
  if (
    index < 0 ||
    ticks <
      Math.max(
        1,
        ...(bar.events[index].notes ?? []).map((n) => n.offsetTick + 1),
      ) ||
    ticks > durationCapacity(bar, eventId, limit)
  )
    return bar;
  const event = bar.events[index],
    delta = ticks - event.durationTicks;
  if (!delta) return bar;
  const next = {
    ...event,
    durationTicks: ticks,
    ...(event.notes
      ? { notes: event.notes.filter((n) => n.offsetTick < ticks) }
      : {}),
  };
  let after = bar.events.slice(index + 1);
  if (delta < 0) {
    const excess = Math.max(
      0,
      bar.events.reduce((n, e) => n + e.durationTicks, 0) - limit,
    );
    const silence = Math.max(0, -delta - excess);
    if (silence) {
      if (
        after[0] &&
        isRest(after[0]) &&
        after[0].durationTicks + silence <= limit
      )
        after = [
          { ...after[0], durationTicks: after[0].durationTicks + silence },
          ...after.slice(1),
        ];
      else after = [makeEvent(null, silence), ...after];
    }
  } else {
    let remaining = delta;
    while (remaining > 0 && after[0] && isRest(after[0])) {
      const first = after[0];
      if (first.durationTicks <= remaining) {
        remaining -= first.durationTicks;
        after = after.slice(1);
      } else {
        after = [
          { ...first, durationTicks: first.durationTicks - remaining },
          ...after.slice(1),
        ];
        remaining = 0;
      }
    }
  }
  return { ...bar, events: [...bar.events.slice(0, index), next, ...after] };
}

export function materializeNotes(
  event: ArrangementEvent,
  pattern: Arrangement["pattern"],
): NonNullable<ArrangementEvent["notes"]> {
  return event.notes
    ? event.notes.map((n) => ({ ...n }))
    : eventAttacks(event, pattern).map(
        ({ offsetTick, stringIndex, fret, marker }) => ({
          offsetTick,
          stringIndex,
          fret,
          ...(marker ? { marker } : {}),
        }),
      );
}
