import {
  arrangementSchema,
  barTicks,
  listBars,
  sameVocalPitch,
  writtenVocalNotes,
  repairVocalLinks,
  repairLyricLinks,
  lyricVocalNote,
  type ArrangementLyric,
  type Arrangement,
  type VocalKey,
  type VocalNote,
  type WrittenVocalNote,
  type PlaybackPlan,
} from "./arrangement";
export {
  writtenVocalNotes,
  repairVocalLinks,
  lyricVocalNote,
} from "./arrangement";
export const VOCAL_KEYS: VocalKey[] = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const major = [0, 2, 4, 5, 7, 9, 11];
export function vocalMidi(
  note: Pick<VocalNote, "degree" | "octave" | "accidental">,
  key: VocalKey = "C",
) {
  if (note.degree === 0) return undefined;
  return (
    60 +
    VOCAL_KEYS.indexOf(key) +
    major[note.degree - 1] +
    note.octave * 12 +
    (note.accidental ?? 0)
  );
}
export function vocalPitchForKey(
  note: VocalNote,
  from: VocalKey,
  to: VocalKey,
): Pick<VocalNote, "degree" | "octave" | "accidental"> {
  if (!note.degree || from === to)
    return {
      degree: note.degree,
      octave: note.octave,
      ...(note.accidental !== undefined ? { accidental: note.accidental } : {}),
    };
  const pitch = vocalMidi(note, from),
    candidates: { degree: number; octave: number; accidental: -1 | 0 | 1 }[] =
      [];
  for (let octave = -2; octave <= 2; octave++)
    for (let degree = 1; degree <= 7; degree++)
      for (const accidental of [0, -1, 1] as const) {
        if (vocalMidi({ degree, octave, accidental }, to) === pitch)
          candidates.push({ degree, octave, accidental });
      }
  candidates.sort(
    (left, right) =>
      Math.abs(left.accidental) - Math.abs(right.accidental) ||
      Math.abs(left.octave) - Math.abs(right.octave),
  );
  if (!candidates.length)
    throw Error("粘贴的唱音超出当前调号可表示的音域，请调整调号或八度。");
  return candidates[0];
}
export function lyricLineCount(a: Arrangement) {
  return Math.max(
    a.lyricLineCount ?? 2,
    ...listBars(a).flatMap(({ bar }) =>
      (bar.lyrics ?? []).map((lyric) => lyric.verse + 1),
    ),
  );
}
export function addLyricLine(a: Arrangement): Arrangement {
  const count = lyricLineCount(a);
  if (count >= 8) throw Error("一份编排最多支持 8 行歌词。");
  return { ...a, lyricLineCount: count + 1 };
}
export function removeLyricLine(a: Arrangement, verse: number): Arrangement {
  const count = lyricLineCount(a);
  if (count <= 1) throw Error("请保留至少一行歌词。");
  if (!Number.isInteger(verse) || verse < 0 || verse >= count)
    throw Error("请选择有效的歌词行。");
  return {
    ...a,
    lyricLineCount: count - 1,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        ...(bar.lyrics
          ? {
              lyrics: bar.lyrics
                .filter((lyric) => lyric.verse !== verse)
                .map((lyric) => ({
                  ...lyric,
                  verse: lyric.verse > verse ? lyric.verse - 1 : lyric.verse,
                })),
            }
          : {}),
      })),
    })),
  };
}
function location(a: Arrangement, barId: string, tick: number) {
  const bars = listBars(a),
    index = bars.findIndex(({ bar }) => bar.id === barId),
    size = barTicks(a.meter);
  if (index < 0 || !Number.isInteger(tick) || tick < 0 || tick >= size)
    throw Error("请选择有效的小节位置。");
  return index * size + tick;
}
function checked(a: Arrangement): Arrangement {
  const result = repairLyricLinks(repairVocalLinks(a)),
    valid = arrangementSchema.safeParse(result);
  if (!valid.success)
    throw Error(
      valid.error.issues[0]?.message ?? "唱音或歌词内容不符合曲谱规则。",
    );
  return result;
}
function freeLyric(lyric: ArrangementLyric): ArrangementLyric {
  const result = { ...lyric, anchorMode: "free" as const };
  delete result.vocalNoteId;
  delete result.endVocalNoteId;
  return result;
}
function lyricAt(a: Arrangement, barId: string, tick: number, verse: number) {
  location(a, barId, tick);
  return listBars(a)
    .find(({ bar }) => bar.id === barId)!
    .bar.lyrics?.find((lyric) => lyric.tick === tick && lyric.verse === verse);
}
function replaceLyric(
  a: Arrangement,
  barId: string,
  tick: number,
  verse: number,
  lyric?: ArrangementLyric,
): Arrangement {
  return checked({
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => {
        if (bar.id !== barId) return bar;
        const lyrics = (bar.lyrics ?? []).filter(
          (item) => item.tick !== tick || item.verse !== verse,
        );
        if (lyric) lyrics.push(lyric);
        lyrics.sort(
          (left, right) => left.tick - right.tick || left.verse - right.verse,
        );
        return { ...bar, lyrics };
      }),
    })),
  });
}
export function setLyricText(
  a: Arrangement,
  barId: string,
  tick: number,
  verse: number,
  text: string,
  anchorMode?: "auto" | "free",
): Arrangement {
  const previous = lyricAt(a, barId, tick, verse);
  // Spaces are intentional lyric content; only an empty field removes its entry.
  if (text === "") return previous ? replaceLyric(a, barId, tick, verse) : a;
  if (
    previous?.text === text &&
    (anchorMode === undefined || (previous.anchorMode ?? "auto") === anchorMode)
  )
    return a;
  let lyric: ArrangementLyric = { ...previous, tick, verse, text };
  if (anchorMode !== undefined) lyric.anchorMode = anchorMode;
  if (lyric.anchorMode === "free") lyric = freeLyric(lyric);
  else {
    delete lyric.vocalNoteId;
    const note = lyricVocalNote(a, barId, lyric);
    if (note) lyric.vocalNoteId = note.id;
    else delete lyric.endVocalNoteId;
  }
  return replaceLyric(a, barId, tick, verse, lyric);
}
export function setLyricAnchor(
  a: Arrangement,
  barId: string,
  tick: number,
  verse: number,
  mode: "auto" | "free",
): Arrangement {
  const previous = lyricAt(a, barId, tick, verse);
  if (!previous) throw Error("请先填写要调整的歌词。");
  let lyric: ArrangementLyric = { ...previous, anchorMode: mode };
  if (mode === "free") lyric = freeLyric(lyric);
  else {
    delete lyric.vocalNoteId;
    const note = lyricVocalNote(a, barId, lyric);
    if (note) lyric.vocalNoteId = note.id;
    else delete lyric.endVocalNoteId;
  }
  if (JSON.stringify(previous) === JSON.stringify(lyric)) return a;
  return replaceLyric(a, barId, tick, verse, lyric);
}
export function setLyricLayout(
  a: Arrangement,
  barId: string,
  tick: number,
  verse: number,
  offsetX: number,
  offsetY: number,
): Arrangement {
  const previous = lyricAt(a, barId, tick, verse);
  if (!previous) throw Error("请先填写要调整的歌词。");
  if (
    (previous.offsetX ?? 0) === offsetX &&
    (previous.offsetY ?? 0) === offsetY
  )
    return a;
  return replaceLyric(a, barId, tick, verse, { ...previous, offsetX, offsetY });
}
export function setLyricExtend(
  a: Arrangement,
  barId: string,
  tick: number,
  verse: number,
  endId?: string,
): Arrangement {
  const previous = lyricAt(a, barId, tick, verse);
  if (!previous) throw Error("请先填写要延唱的歌词。");
  const note = lyricVocalNote(a, barId, previous),
    end = endId
      ? writtenVocalNotes(a).find((item) => item.id === endId)
      : undefined;
  if (
    endId &&
    (!note || !end || end.degree === 0 || end.startTick < note.startTick)
  )
    throw Error("延唱末音必须位于关联唱音之后，且不能是休止。");
  if (previous.endVocalNoteId === endId) return a;
  const lyric = { ...previous };
  if (endId) {
    lyric.endVocalNoteId = endId;
    lyric.vocalNoteId = note!.id;
  } else delete lyric.endVocalNoteId;
  return replaceLyric(a, barId, tick, verse, lyric);
}
// Rebuild all verses atomically after note edits; missing notes detach rather than delete words.
function lyricsAfterVocalEdit(
  before: Arrangement,
  after: Arrangement,
): Arrangement {
  const newNotes = writtenVocalNotes(after),
    byId = new Map(newNotes.map((note) => [note.id, note])),
    staged = new Map<string, ArrangementLyric[]>();
  for (const { bar } of listBars(before))
    for (const old of bar.lyrics ?? []) {
      const bound = lyricVocalNote(before, bar.id, old);
      let lyric = { ...old },
        targetBarId = bar.id;
      if (bound) {
        const next = byId.get(bound.id);
        if (!next || next.degree === 0) lyric = freeLyric(old);
        else {
          targetBarId = next.barId;
          lyric = { ...old, tick: next.tick, vocalNoteId: next.id };
          if (lyric.endVocalNoteId) {
            const end = byId.get(lyric.endVocalNoteId);
            if (!end || end.degree === 0 || end.startTick < next.startTick)
              delete lyric.endVocalNoteId;
          }
        }
      } else if (old.anchorMode !== "free") {
        const next = lyricVocalNote(after, bar.id, old);
        if (next) lyric.vocalNoteId = next.id;
      }
      const list = staged.get(targetBarId) ?? [];
      if (
        list.some(
          (item) => item.tick === lyric.tick && item.verse === lyric.verse,
        )
      )
        throw Error("目标拍位同一行已有歌词，请选择空白位置。");
      list.push(lyric);
      staged.set(targetBarId, list);
    }
  return {
    ...after,
    sections: after.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        ...(bar.lyrics || staged.has(bar.id)
          ? {
              lyrics: (staged.get(bar.id) ?? []).sort(
                (left, right) =>
                  left.tick - right.tick || left.verse - right.verse,
              ),
            }
          : {}),
      })),
    })),
  };
}
function protectedVocalIds(a: Arrangement) {
  const ids = new Set<string>();
  for (const { bar } of listBars(a))
    for (const lyric of bar.lyrics ?? []) {
      const note = lyricVocalNote(a, bar.id, lyric);
      if (note) ids.add(note.id);
      if (lyric.endVocalNoteId) ids.add(lyric.endVocalNoteId);
    }
  return ids;
}

export function setLyricPosition(
  a: Arrangement,
  barId: string,
  verse: number,
  oldTick: number,
  newAbsoluteTick: number,
): Arrangement {
  location(a, barId, oldTick);
  const bars = listBars(a),
    size = barTicks(a.meter),
    destination = bars[Math.floor(newAbsoluteTick / size)]?.bar;
  if (!Number.isInteger(newAbsoluteTick) || newAbsoluteTick < 0 || !destination)
    throw Error("歌词位置超出曲谱，请先添加小节。");
  const source = bars
    .find(({ bar }) => bar.id === barId)!
    .bar.lyrics?.find(
      (lyric) => lyric.tick === oldTick && lyric.verse === verse,
    );
  if (!source) throw Error("请先填写要移动的歌词。");
  const bound = lyricVocalNote(a, barId, source);
  if (bound) return moveVocalNote(a, barId, oldTick, newAbsoluteTick);
  const tick = newAbsoluteTick % size;
  if (destination.id === barId && tick === oldTick) return a;
  if (
    destination.lyrics?.some(
      (lyric) => lyric.verse === verse && lyric.tick === tick,
    )
  )
    throw Error("该位置已有歌词，请选择空白位置。");
  return checked({
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => {
        let lyrics = bar.lyrics ?? [];
        if (bar.id === barId)
          lyrics = lyrics.filter(
            (lyric) => !(lyric.tick === oldTick && lyric.verse === verse),
          );
        if (bar.id === destination.id)
          lyrics = [...lyrics, { ...source, tick }].sort(
            (left, right) => left.tick - right.tick || left.verse - right.verse,
          );
        return { ...bar, ...(bar.lyrics || lyrics.length ? { lyrics } : {}) };
      }),
    })),
  });
}
function chain(a: Arrangement, barId: string, tick: number) {
  const all = writtenVocalNotes(a),
    first = all.findIndex((note) => note.barId === barId && note.tick === tick);
  if (first < 0) return [] as WrittenVocalNote[];
  const result = [all[first]];
  for (let i = first; i + 1 < all.length; i++) {
    if (
      !all[i].tieToNext ||
      all[i].startTick + all[i].durationTicks !== all[i + 1].startTick ||
      !sameVocalPitch(all[i], all[i + 1])
    )
      break;
    result.push(all[i + 1]);
  }
  return result;
}
export function vocalNoteDuration(a: Arrangement, barId: string, tick: number) {
  const notes = chain(a, barId, tick);
  return notes.length
    ? notes.reduce((sum, note) => sum + note.durationTicks, 0)
    : undefined;
}
function without(a: Arrangement, ids: Set<string>): Arrangement {
  return {
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        ...(bar.vocalNotes
          ? { vocalNotes: bar.vocalNotes.filter((note) => !ids.has(note.id)) }
          : {}),
      })),
    })),
  };
}
function insert(
  a: Arrangement,
  start: number,
  patch: Pick<
    VocalNote,
    "degree" | "octave" | "accidental" | "durationTicks" | "tieToNext"
  >,
  id?: string,
  retained: { start: number; id: string; split: boolean }[] = [],
): Arrangement {
  const size = barTicks(a.meter),
    end = start + patch.durationTicks,
    total = listBars(a).length * size;
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    start >= total ||
    !Number.isInteger(patch.durationTicks) ||
    patch.durationTicks < 1 ||
    end > total
  )
    throw Error("唱音时值超出曲谱，请先添加小节。");
  if (
    !Number.isInteger(patch.degree) ||
    patch.degree < 0 ||
    patch.degree > 7 ||
    !Number.isInteger(patch.octave) ||
    patch.octave < -2 ||
    patch.octave > 2 ||
    (patch.accidental !== undefined && ![-1, 0, 1].includes(patch.accidental))
  )
    throw Error("请选择有效的唱音、八度和升降号。");
  const collisions = writtenVocalNotes(a).filter(
    (note) =>
      note.startTick < end && note.startTick + note.durationTicks > start,
  );
  if (collisions.some((note) => note.degree !== 0))
    throw Error("该时段已有唱音，请缩短时值或移动到空白位置。");
  let index = 0;
  const result: Arrangement = {
    ...a,
    sections: a.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => {
        const base = index++ * size,
          stop = base + size;
        if (base >= end || stop <= start) return bar;
        const notes: VocalNote[] = [];
        for (const note of bar.vocalNotes ?? []) {
          const ns = base + note.tick,
            ne = ns + note.durationTicks;
          if (ne <= start || ns >= end) {
            notes.push(note);
            continue;
          }
          if (ns < start)
            notes.push({
              ...note,
              durationTicks: start - ns,
              tieToNext: false,
            });
          if (ne > end)
            notes.push({
              ...note,
              id: crypto.randomUUID(),
              tick: end - base,
              durationTicks: ne - end,
              tieToNext: false,
            });
        }
        const onset = Math.max(base, start),
          noteEnd = Math.min(stop, end);
        const cuts = [
          onset,
          ...retained
            .filter(
              (node) =>
                node.split && node.start > onset && node.start < noteEnd,
            )
            .map((node) => node.start),
          noteEnd,
        ].sort((left, right) => left - right);
        for (let i = 0; i < cuts.length - 1; i++) {
          const pieceStart = cuts[i],
            pieceEnd = cuts[i + 1];
          if (pieceEnd <= pieceStart) continue;
          notes.push({
            id:
              (pieceStart === start && id
                ? id
                : retained.find((node) => node.start === pieceStart)?.id) ??
              crypto.randomUUID(),
            tick: pieceStart - base,
            degree: patch.degree,
            octave: patch.octave,
            ...(patch.accidental !== undefined
              ? { accidental: patch.accidental }
              : {}),
            durationTicks: pieceEnd - pieceStart,
            ...(patch.degree !== 0 && (pieceEnd < end || patch.tieToNext)
              ? { tieToNext: true }
              : {}),
          });
        }
        return {
          ...bar,
          vocalNotes: notes.sort((left, right) => left.tick - right.tick),
        };
      }),
    })),
  };
  if (patch.tieToNext && patch.degree !== 0) {
    const notes = writtenVocalNotes(result),
      tail = notes.find(
        (note) =>
          note.startTick + note.durationTicks === end &&
          note.startTick >= start,
      ),
      next = notes.find((note) => note.startTick === end);
    if (!tail || !next || !sameVocalPitch(tail, next))
      throw Error("唱音延音必须接到紧邻的同音，请先添加续音。");
  }
  return result;
}
export function setVocalNote(
  a: Arrangement,
  barId: string,
  tick: number,
  patch: Pick<
    VocalNote,
    "degree" | "octave" | "accidental" | "durationTicks" | "tieToNext"
  >,
): Arrangement {
  const start = location(a, barId, tick),
    owned = chain(a, barId, tick),
    existing = owned[0];
  const currentDuration = owned.reduce(
    (sum, note) => sum + note.durationTicks,
    0,
  );
  if (patch.durationTicks > 96 && patch.durationTicks !== currentDuration)
    throw Error("一次输入的唱音时值最多为全音符，较长延音请连接续音。");
  const protectedIds = protectedVocalIds(a);
  const inserted = insert(
    without(a, new Set(owned.map((note) => note.id))),
    start,
    patch,
    existing?.id,
    owned.map((note) => ({
      start: note.startTick,
      id: note.id,
      split: protectedIds.has(note.id),
    })),
  );
  return checked(lyricsAfterVocalEdit(a, inserted));
}
export function deleteVocalNote(
  a: Arrangement,
  barId: string,
  tick: number,
): Arrangement {
  location(a, barId, tick);
  const owned = chain(a, barId, tick);
  if (!owned.length) return a;
  return checked(
    lyricsAfterVocalEdit(a, without(a, new Set(owned.map((note) => note.id)))),
  );
}
export function moveVocalNote(
  a: Arrangement,
  barId: string,
  tick: number,
  newAbsoluteTick: number,
): Arrangement {
  location(a, barId, tick);
  const owned = chain(a, barId, tick),
    root = owned[0];
  if (!root) throw Error("请先选择要移动的唱音。");
  if (newAbsoluteTick === root.startTick) return a;
  const protectedIds = protectedVocalIds(a);
  const inserted = insert(
    without(a, new Set(owned.map((note) => note.id))),
    newAbsoluteTick,
    {
      degree: root.degree,
      octave: root.octave,
      ...(root.accidental !== undefined ? { accidental: root.accidental } : {}),
      durationTicks: owned.reduce((sum, note) => sum + note.durationTicks, 0),
    },
    root.id,
    owned.map((note) => ({
      start: newAbsoluteTick + note.startTick - root.startTick,
      id: note.id,
      split: protectedIds.has(note.id),
    })),
  );
  return checked(lyricsAfterVocalEdit(a, inserted));
}
export function toggleVocalTie(
  a: Arrangement,
  barId: string,
  tick: number,
): Arrangement {
  location(a, barId, tick);
  const all = writtenVocalNotes(a),
    root = all.find((note) => note.barId === barId && note.tick === tick);
  if (!root || root.degree === 0)
    throw Error("请先选择一个唱音，休止不能添加延音。");
  const edit = (value: Arrangement, tieToNext: boolean) => ({
    ...value,
    sections: value.sections.map((section) => ({
      ...section,
      bars: section.bars.map((bar) => ({
        ...bar,
        ...(bar.vocalNotes
          ? {
              vocalNotes: bar.vocalNotes.map((note) =>
                note.id === root.id ? { ...note, tieToNext } : note,
              ),
            }
          : {}),
      })),
    })),
  });
  if (root.tieToNext) return checked(edit(a, false));
  const start = root.startTick + root.durationTicks,
    next = all.find((note) => note.startTick >= start && note.degree !== 0);
  if (next?.startTick === start) {
    if (!sameVocalPitch(root, next))
      throw Error("下一个唱音音高不同，延音只能连接同音。");
    return checked(edit(a, true));
  }
  const total = listBars(a).length * barTicks(a.meter),
    duration = Math.min(
      root.durationTicks,
      total - start,
      (next?.startTick ?? Infinity) - start,
    );
  if (duration < 1) throw Error("剩余小节不足，请先添加小节再延音。");
  const added = insert(a, start, {
    degree: root.degree,
    octave: root.octave,
    ...(root.accidental !== undefined ? { accidental: root.accidental } : {}),
    durationTicks: duration,
  });
  return checked(lyricsAfterVocalEdit(a, edit(added, true)));
}
// Repeat jumps and a range starting at a continuation require a new attack.
export function vocalPlayback(a: Arrangement, plan: PlaybackPlan) {
  const notes = plan.bars
    .flatMap((bar) =>
      (bar.bar.vocalNotes ?? []).map((note) => ({
        ...note,
        midi: vocalMidi(note, a.vocalKey),
        startTick: bar.startTick + note.tick,
        bar,
      })),
    )
    .sort((left, right) => left.startTick - right.startTick);
  type Note = (typeof notes)[number];
  const output: (Note & {
    midi: number;
    gateTicks: number;
    delaySeconds: number;
  })[] = [];
  let last: { root: (typeof output)[number]; tail: Note } | undefined;
  for (const note of notes) {
    if (note.midi === undefined) {
      last = undefined;
      continue;
    }
    const tail = last?.tail,
      adjacent =
        tail &&
        (tail.bar.occurrenceIndex === note.bar.occurrenceIndex ||
          (tail.bar.occurrenceIndex + 1 === note.bar.occurrenceIndex &&
            tail.bar.number + 1 === note.bar.number));
    if (
      last &&
      tail?.tieToNext &&
      adjacent &&
      sameVocalPitch(tail, note) &&
      tail.startTick + tail.durationTicks === note.startTick
    ) {
      last.root.gateTicks =
        note.startTick + note.durationTicks - last.root.startTick;
      last.tail = note;
    } else {
      if (last)
        last.root.gateTicks = Math.min(
          last.root.gateTicks,
          note.startTick - last.root.startTick,
        );
      const root = {
        ...note,
        midi: note.midi,
        gateTicks: note.durationTicks,
        delaySeconds: 0,
      };
      output.push(root);
      last = { root, tail: note };
    }
  }
  return output;
}
