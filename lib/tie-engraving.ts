/** Filled engraving contours: fine tips, a gently weighted middle and open system breaks. */
export type TieSegment = "full" | "incoming" | "outgoing";

export function tieRibbonPath(
  from: number,
  to: number,
  y: number,
  maxRise = 10,
  segment: TieSegment = "full",
) {
  const width = to - from;
  if (![from, to, y, maxRise].every(Number.isFinite) || width <= 0) return "";
  const rise = Math.min(
    maxRise,
    3.5 + Math.sqrt(width * (segment === "full" ? 1 : 2)) * 0.55,
    width * 0.24,
  );
  const weight = Math.min(1.7, rise * 0.38);
  const n = (value: number) => Number(value.toFixed(3));
  const point = (x: number, yy: number) => n(x) + " " + n(yy);
  if (segment === "outgoing") {
    return (
      "M" +
      point(from, y) +
      " C" +
      point(from + width * 0.42, y - rise * 0.78) +
      " " +
      point(to - width * 0.3, y - rise) +
      " " +
      point(to, y - rise) +
      " L" +
      point(to, y - rise + weight) +
      " C" +
      point(to - width * 0.3, y - rise + weight) +
      " " +
      point(from + width * 0.42, y - rise * 0.78 + weight) +
      " " +
      point(from, y) +
      " Z"
    );
  }
  if (segment === "incoming") {
    return (
      "M" +
      point(from, y - rise) +
      " C" +
      point(from + width * 0.3, y - rise) +
      " " +
      point(to - width * 0.42, y - rise * 0.78) +
      " " +
      point(to, y) +
      " C" +
      point(to - width * 0.42, y - rise * 0.78 + weight) +
      " " +
      point(from + width * 0.3, y - rise + weight) +
      " " +
      point(from, y - rise + weight) +
      " Z"
    );
  }
  const outer = y - (rise * 4) / 3,
    inner = outer + (weight * 4) / 3;
  return (
    "M" +
    point(from, y) +
    " C" +
    point(from + width * 0.24, outer) +
    " " +
    point(to - width * 0.24, outer) +
    " " +
    point(to, y) +
    " C" +
    point(to - width * 0.24, inner) +
    " " +
    point(from + width * 0.24, inner) +
    " " +
    point(from, y) +
    " Z"
  );
}
