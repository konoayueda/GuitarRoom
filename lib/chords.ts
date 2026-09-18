export const TUNING = [40, 45, 50, 55, 59, 64];
export const NOTES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export type Chord = { name: string; frets: number[]; fingers: number[] };
export const CHORDS: Chord[] = [
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { name: "G", frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] },
  { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  { name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  { name: "A", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] },
  { name: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  { name: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  { name: "B7", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
  { name: "C", frets: [-1, 3, 5, 5, 5, 3], fingers: [0, 1, 2, 3, 4, 1] },
  { name: "Am", frets: [5, 7, 7, 5, 5, 5], fingers: [1, 3, 4, 1, 1, 1] },
  { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { name: "D", frets: [-1, 5, 7, 7, 7, 5], fingers: [0, 1, 2, 3, 4, 1] },
  { name: "Am7", frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  { name: "D7", frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  { name: "G7", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { name: "E7", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  { name: "A7", frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  { name: "Bm", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1] },
  { name: "Bm7", frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1] },
  { name: "F#m", frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1] },
  { name: "F#m7", frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1] },
  { name: "C#m", frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1] },
];
const TYPES = [
  { suffix: "", label: "大三和弦", intervals: [0, 4, 7] },
  { suffix: "m", label: "小三和弦", intervals: [0, 3, 7] },
  { suffix: "7", label: "属七和弦", intervals: [0, 4, 7, 10] },
  { suffix: "maj7", label: "大七和弦", intervals: [0, 4, 7, 11] },
  { suffix: "m7", label: "小七和弦", intervals: [0, 3, 7, 10] },
  { suffix: "sus2", label: "挂二和弦", intervals: [0, 2, 7] },
  { suffix: "sus4", label: "挂四和弦", intervals: [0, 5, 7] },
  { suffix: "dim", label: "减三和弦", intervals: [0, 3, 6] },
  { suffix: "aug", label: "增三和弦", intervals: [0, 4, 8] },
  { suffix: "5", label: "五度和弦", intervals: [0, 7] },
  { suffix: "6", label: "六和弦", intervals: [0, 4, 7, 9] },
  { suffix: "m6", label: "小六和弦", intervals: [0, 3, 7, 9] },
  { suffix: "add9", label: "加九和弦", intervals: [0, 2, 4, 7] },
];
export const midiNotes = (frets: number[], capo = 0) =>
  frets.flatMap((f, i) => (f < 0 ? [] : [TUNING[i] + f + capo]));
export function identify(frets: number[], capo = 0) {
  const midis = midiNotes(frets, capo);
  if (!midis.length) return [];
  const pcs = [...new Set(midis.map((m) => m % 12))],
    bass = Math.min(...midis) % 12;
  return NOTES.flatMap((note, root) =>
    TYPES.flatMap((t) => {
      const tones = t.intervals.map((n) => (root + n) % 12);
      if (tones.length !== pcs.length || !tones.every((n) => pcs.includes(n)))
        return [];
      return [
        {
          name: note + t.suffix + (bass === root ? "" : "/" + NOTES[bass]),
          label: t.label,
          root,
          bass,
          notes: tones.map((n) => NOTES[n]),
          intervals: t.intervals,
        },
      ];
    }),
  ).sort((a, b) => Number(b.root === bass) - Number(a.root === bass));
}
export function transition(from: Chord, to: Chord) {
  const held = to.frets.flatMap((f, i) =>
    f > 0 && f === from.frets[i] && to.fingers[i] === from.fingers[i]
      ? [{ finger: to.fingers[i], string: 6 - i, fret: f }]
      : [],
  );
  const moving = [1, 2, 3, 4].filter(
    (f) => to.fingers.includes(f) && !held.some((h) => h.finger === f),
  );
  return { held, moving };
}
