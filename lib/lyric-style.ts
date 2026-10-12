export const DEFAULT_LYRIC_FONT_SIZE = 24;
export const MIN_LYRIC_FONT_SIZE = 16;
export const MAX_LYRIC_FONT_SIZE = 40;
// Print offsets are pixels, independent of the 96 musical ticks in a 4/4 bar.
// Allow placement across wide measures while keeping saved geometry bounded.
export const MAX_LYRIC_HORIZONTAL_OFFSET = 16384;

export function resolveLyricFontSize(value?: number): number {
  if (value === undefined || !Number.isFinite(value))
    return DEFAULT_LYRIC_FONT_SIZE;
  return Math.max(
    MIN_LYRIC_FONT_SIZE,
    Math.min(MAX_LYRIC_FONT_SIZE, Math.round(value)),
  );
}
