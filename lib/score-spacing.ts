export type SpacingSpan = { start: number; end: number };
export type SpacingOptions = { proportional?: boolean };

/** Paper spacing follows engraving points; proportional editing follows musical time. */
export function scoreSpacing(
  grid: number[],
  spans: SpacingSpan[],
  width: number,
  limit: number,
  options?: SpacingOptions,
) {
  if (options?.proportional) {
    const usableLimit = Number.isFinite(limit) && limit > 0 ? limit : 1;
    const ticks = grid.filter((tick) => Number.isFinite(tick) && tick >= 0);
    const timeline = Math.max(usableLimit, ...ticks);
    const points = [
      ...new Set([
        0,
        timeline,
        ...ticks,
        ...spans
          .flatMap((span) => [span.start, span.end])
          .filter(
            (tick) => Number.isFinite(tick) && tick >= 0 && tick <= timeline,
          ),
      ]),
    ].sort((a, b) => a - b);
    // Glyph padding stays fixed when new editable points are added.
    const step = 24;
    const safeWidth = Number.isFinite(width) ? Math.max(61, width) : 480;
    const contentWidth = safeWidth - 60;
    const centerAt = (tick: number) => 42 + (contentWidth * tick) / timeline;
    const x = (tick: number) => centerAt(tick) - step / 2;
    const tickAt = (px: number) =>
      Math.max(
        0,
        Math.min(
          usableLimit - 1,
          Math.round(((px - 42) * timeline) / contentWidth),
        ),
      );
    const editablePoints = points.filter((tick) => tick < usableLimit);
    const cellBounds = (tick: number) => {
      if (!Number.isFinite(tick) || tick < 0 || tick >= usableLimit)
        return { x: safeWidth - 8, width: 0 };
      const next = editablePoints.findIndex((point) => point >= tick);
      const exact = next >= 0 && editablePoints[next] === tick;
      const previous =
        next < 0 ? editablePoints.at(-1) : editablePoints[next - 1];
      const following =
        next < 0 ? undefined : editablePoints[next + (exact ? 1 : 0)];
      const center = centerAt(tick);
      const clamp = (px: number) => Math.max(26, Math.min(safeWidth - 8, px));
      const left = clamp(
        previous === undefined ? 26 : (centerAt(previous) + center) / 2,
      );
      const right = clamp(
        following === undefined
          ? safeWidth - 8
          : (center + centerAt(following)) / 2,
      );
      return { x: left, width: Math.max(0, right - left) };
    };
    return { points, step, x, tickAt, cellBounds };
  }
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
  const cellBounds = (tick: number) => ({ x: x(tick), width: step });
  return { points, step, x, tickAt, cellBounds };
}

/** Reserve space for written attacks without depending on transient editing grid points. */
export function minimumEditorMeasureWidth(
  onsetsByVoice: readonly (readonly number[])[],
  ticks: number,
) {
  const timeline = Number.isFinite(ticks) && ticks > 0 ? ticks : 24;
  let density = 1;
  for (const voice of onsetsByVoice) {
    const buckets = new Map<number, number>();
    for (const onset of new Set(voice)) {
      if (!Number.isFinite(onset) || onset < 0 || onset >= timeline) continue;
      const bucket = Math.floor(onset / 24);
      const count = (buckets.get(bucket) ?? 0) + 1;
      buckets.set(bucket, count);
      density = Math.max(density, count);
    }
  }
  return Math.max(480, Math.ceil((timeline / 24) * density * 34 + 60));
}
