import {
  EMPTY_ARRANGEMENT,
  type Arrangement,
  type VocalKey,
} from "./arrangement";

const keys: VocalKey[] = [
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
const roots: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Read an explicit score key only when initializing a new vocal part. */
export function scoreVocalKey(key: string): VocalKey {
  const text = key
    .trim()
    .replace(/\s+/g, "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/＝/g, "=");
  const match = /^(1=)?([A-Ga-g])([#b]?)(.*)$/.exec(text);
  if (!match) return "C";
  const [, explicitDo, root, accidental, suffix] = match;
  const major =
    suffix === "" ||
    suffix === "M" ||
    /^(maj(?:or)?|大调|大|调)$/i.test(suffix);
  const minor = suffix === "m" || /^(min(?:or)?|小调|小)$/i.test(suffix);
  if ((!major && !minor) || (explicitDo && suffix !== "")) return "C";
  const pitch =
    roots[root.toUpperCase()] +
    (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  // Jianpu's do is the relative major tonic: A minor uses 1 = C.
  return keys[(pitch + (minor ? 3 : 0) + 12) % 12];
}

export function initialArrangementForScore(key: string): Arrangement {
  return { ...EMPTY_ARRANGEMENT, vocalKey: scoreVocalKey(key) };
}
