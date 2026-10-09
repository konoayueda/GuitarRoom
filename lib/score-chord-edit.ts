import {
  eventAttacks,
  repairNoteLinks,
  type Arrangement,
  type ArrangementBar,
  type ArrangementEvent,
} from "./arrangement";
import { splitEvent } from "./arrangement-edit";
import type { Chord } from "./chords";
import type { ScoreCursor } from "./score-editing";

function sameChord(left: ArrangementEvent["chord"], right: Chord) {
  return (
    left?.name === right.name &&
    left.frets.every((fret, index) => fret === right.frets[index]) &&
    left.fingers.every((finger, index) => finger === right.fingers[index])
  );
}

function checkChord(chord: Chord) {
  if (
    !chord ||
    typeof chord.name !== "string" ||
    !chord.name.trim() ||
    chord.name.length > 40 ||
    !Array.isArray(chord.frets) ||
    chord.frets.length !== 6 ||
    !chord.frets.every(
      (fret) => Number.isInteger(fret) && fret >= -1 && fret <= 24,
    ) ||
    !chord.frets.some((fret) => fret >= 0) ||
    !Array.isArray(chord.fingers) ||
    chord.fingers.length !== 6 ||
    !chord.fingers.every(
      (finger) => Number.isInteger(finger) && finger >= 0 && finger <= 4,
    )
  )
    throw Error("请选择包含完整六弦按法的有效和弦。");
}

function checkBar(bar: ArrangementBar) {
  if (
    !bar.events.length ||
    bar.events.length > 96 ||
    bar.events.some(
      (event) =>
        !Number.isInteger(event.durationTicks) ||
        event.durationTicks < 1 ||
        event.durationTicks > 96,
    )
  )
    throw Error("当前小节的段数或时值无效，请先修正后再添加和弦。");
}

/** Snapshot the original rhythm before cutting an automatically generated event. */
function frozenNotes(
  event: ArrangementEvent,
  pattern: Arrangement["pattern"],
): NonNullable<ArrangementEvent["notes"]> {
  return eventAttacks(event, pattern).map((attack) => {
    const existing = event.notes?.find(
      (note) =>
        note.offsetTick === attack.offsetTick &&
        note.stringIndex === attack.stringIndex,
    );
    return {
      ...existing,
      offsetTick: attack.offsetTick,
      stringIndex: attack.stringIndex,
      fret: existing?.fret ?? attack.fret,
      durationTicks: attack.durationTicks,
      ...(attack.marker ? { marker: attack.marker } : {}),
      ...(attack.gateTicks !== attack.durationTicks
        ? { sustainTicks: attack.gateTicks }
        : {}),
      ...(attack.tieToNext ? { tieToNext: true } : {}),
    };
  });
}

function checkExplicitNotes(event: ArrangementEvent) {
  if (
    event.notes &&
    (event.notes.length > 144 ||
      event.notes.some(
        (note) =>
          !Number.isInteger(note.offsetTick) ||
          note.offsetTick < 0 ||
          note.offsetTick >= event.durationTicks ||
          !Number.isInteger(note.stringIndex) ||
          note.stringIndex < 0 ||
          note.stringIndex > 5 ||
          !Number.isInteger(note.fret) ||
          note.fret < 0 ||
          note.fret > 24 ||
          (note.durationTicks !== undefined &&
            (!Number.isInteger(note.durationTicks) ||
              note.durationTicks < 1 ||
              note.durationTicks > 96)) ||
          (note.sustainTicks !== undefined &&
            (!Number.isFinite(note.sustainTicks) ||
              note.sustainTicks <= 0 ||
              note.sustainTicks > 96)),
      ))
  )
    throw Error("当前音符的位置或时值无效，请先修正后再添加和弦。");
}

function withChord(
  event: ArrangementEvent,
  chord: Chord,
  automatic: boolean,
): ArrangementEvent {
  if (automatic) {
    const generated = { ...event, chord: structuredClone(chord) };
    delete generated.notes;
    return generated;
  }
  const unavailable = event.notes?.find(
    (note) => note.marker === "cross" && chord.frets[note.stringIndex] < 0,
  );
  if (unavailable)
    throw Error(
      `这个和弦的第 ${6 - unavailable.stringIndex} 弦不弹，但这里写有 ×。请选择其他指型，或先把该音改为数字品位。`,
    );
  return { ...event, chord: structuredClone(chord) };
}

/**
 * Change harmony at an event-relative cursor without moving later music.
 * Throws for an invalid target or an incompatible explicit chord marker.
 * A same-fingering change at the event's start returns the original arrangement.
 * Apply the returned arrangement once so splitting and changing share one undo.
 */
export function setScoreChord(
  arrangement: Arrangement,
  cursor: ScoreCursor,
  chord: Chord,
): { arrangement: Arrangement; cursor: ScoreCursor } {
  checkChord(chord);
  const bar = arrangement.sections
    .flatMap((section) => section.bars)
    .find((candidate) => candidate.id === cursor.barId);
  const event = bar?.events.find(
    (candidate) => candidate.id === cursor.eventId,
  );
  if (!bar || !event) throw Error("这个谱面位置已不存在，请重新选择拍位。");
  checkBar(bar);
  checkExplicitNotes(event);
  const at = cursor.tick ?? 0;
  if (!Number.isInteger(at) || at < 0 || at >= event.durationTicks)
    throw Error("和弦起点必须位于当前段内的有效拍位。");
  if (at === 0 && sameChord(event.chord, chord)) return { arrangement, cursor };

  // Empty imported/cleared silence can become accompaniment. A chord-bearing
  // explicit rest remains intentional silence; other manual notes stay manual.
  const automatic =
    event.notes === undefined || (!event.chord && event.notes.length === 0);
  let changedBar: ArrangementBar;
  let nextCursor = cursor;
  if (at === 0) {
    changedBar = {
      ...bar,
      events: bar.events.map((candidate) =>
        candidate.id === event.id
          ? withChord(candidate, chord, automatic)
          : candidate,
      ),
    };
  } else {
    if (bar.events.length >= 96)
      throw Error("一个小节最多容纳 96 段，请合并已有段落后再添加和弦。");
    const materialized = {
      ...bar,
      events: bar.events.map((candidate) =>
        candidate.id === event.id
          ? { ...candidate, notes: frozenNotes(candidate, arrangement.pattern) }
          : candidate,
      ),
    };
    const divided = splitEvent(materialized, event.id, at, arrangement.pattern);
    const index = divided.events.findIndex(
      (candidate) => candidate.id === event.id,
    );
    const right = divided.events[index + 1];
    changedBar = {
      ...divided,
      events: divided.events.map((candidate) =>
        candidate.id === right.id
          ? withChord(candidate, chord, automatic)
          : candidate,
      ),
    };
    nextCursor = { ...cursor, eventId: right.id, tick: 0 };
  }
  const next = repairNoteLinks({
    ...arrangement,
    sections: arrangement.sections.map((section) => ({
      ...section,
      bars: section.bars.map((candidate) =>
        candidate.id === bar.id ? changedBar : candidate,
      ),
    })),
  });
  return { arrangement: next, cursor: nextCursor };
}
