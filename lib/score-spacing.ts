export type SpacingSpan = { start: number; end: number };

/** Keep ordinary spacing, but space equal tuplet onsets evenly across extra grid points. */
export function scoreSpacing(
  grid: number[],
  spans: SpacingSpan[],
  width: number,
  limit: number,
) {
  const step = (width - 42) / (grid.length - 1);
  const basePosition = (tick: number) => {
    const end = grid.findIndex((point) => point > tick);
    if (end < 0) return (grid.length - 1) * step;
    if (end === 0) return 0;
    return (
      (end - 1 + (tick - grid[end - 1]) / (grid[end] - grid[end - 1])) * step
    );
  };
  const points = [
    ...new Set([...grid, ...spans.flatMap((span) => [span.start, span.end])]),
  ].sort((a, b) => a - b);
  const positions = points.map(basePosition);
  const merged: SpacingSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && span.start < previous.end)
      previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  for (const span of merged) {
    const first = points.indexOf(span.start),
      last = points.indexOf(span.end);
    if (first < 0 || last <= first) continue;
    const left = positions[first],
      distance = positions[last] - left;
    for (let i = first + 1; i < last; i++)
      positions[i] =
        left + ((points[i] - span.start) / (span.end - span.start)) * distance;
  }
  const x = (tick: number) => {
    const end = points.findIndex((point) => point > tick);
    if (end < 0) return width - 12;
    if (end === 0) return 30;
    return (
      30 +
      positions[end - 1] +
      ((tick - points[end - 1]) / (points[end] - points[end - 1])) *
        (positions[end] - positions[end - 1])
    );
  };
  const tickAt = (px: number) => {
    const position = Math.max(
      0,
      Math.min(positions.at(-1)!, px - 30 - step / 2),
    );
    const end = positions.findIndex((value) => value > position);
    const index = end < 0 ? points.length - 2 : Math.max(0, end - 1);
    return Math.max(
      0,
      Math.min(
        limit - 1,
        Math.round(
          points[index] +
            ((position - positions[index]) /
              (positions[index + 1] - positions[index])) *
              (points[index + 1] - points[index]),
        ),
      ),
    );
  };
  return { points, step, x, tickAt };
}
