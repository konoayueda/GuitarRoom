"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  beatLabel,
  type Arrangement,
  type ArrangementBar,
} from "@/lib/arrangement";

type LyricsLayout = {
  bar: ArrangementBar;
  points: number[];
  x: (tick: number) => number;
  step: number;
  width: number;
  lineCount?: number;
};
export type LyricExtension = {
  verse: number;
  startTick?: number;
  endTick?: number;
  text?: string;
  offsetX?: number;
  offsetY?: number;
};
export type ScoreLyricsProps = LyricsLayout & {
  barNumber: number;
  top: number;
  meter?: Arrangement["meter"];
  rowHeights?: readonly number[];
  tickAt?: (x: number) => number;
  snapStep?: number;
  absoluteTickAt?: (clientX: number) => number;
  barStartTick?: number;
  extensions?: LyricExtension[];
  editing?: {
    locked: boolean;
    active?: boolean;
    mode?: "time" | "layout";
    selected?: { barId: string; tick: number; verse: number };
    onChange: (
      barId: string,
      tick: number,
      verse: number,
      text: string,
    ) => void;
    onBegin?: (barId: string, tick: number, verse: number) => void;
    onEnd?: () => void;
    onSelect?: (barId: string, tick: number, verse: number) => void;
    onMove?: (
      barId: string,
      verse: number,
      oldTick: number,
      newAbsoluteTick: number,
    ) => void;
    onLayout?: (
      barId: string,
      verse: number,
      tick: number,
      offsetX: number,
      offsetY: number,
    ) => void;
  };
};

const LINE_HEIGHT = 18;
const FONT_SIZE = 14;
const clamp = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

function textWidth(text: string) {
  return Array.from(text).reduce(
    (total, char) =>
      total + (/^[\u0020-\u007e]$/.test(char) ? FONT_SIZE * 0.55 : FONT_SIZE),
    0,
  );
}
function wrapLyric(text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(text)) {
    if (line && textWidth(line + char) > width) {
      lines.push(line);
      line = "";
    }
    line += char;
  }
  lines.push(line);
  return lines;
}
function lyricLayout(
  { bar, points, x, step, width, lineCount = 2 }: LyricsLayout,
  extraTicks: number[] = [],
) {
  const endTick = bar.events.reduce(
    (total, event) => total + event.durationTicks,
    0,
  );
  const lyrics = bar.lyrics ?? [];
  const count = Math.min(
    8,
    Math.max(1, lineCount, ...lyrics.map((lyric) => lyric.verse + 1)),
  );
  const ticks = [
    ...new Set([
      ...points,
      ...lyrics.map((lyric) => lyric.tick),
      ...extraTicks,
    ]),
  ]
    .filter((tick) => tick >= 0 && tick < endTick)
    .sort((a, b) => a - b);
  const centerAt = (tick: number) => Math.min(width - 12, x(tick) + step / 2);
  const verses = Array.from({ length: count }, (_, verse) => {
    const cells = ticks.map((tick) => {
      const lyric = lyrics.find(
        (lyric) => lyric.tick === tick && lyric.verse === verse,
      );
      const text = lyric?.text ?? "";
      const offsetX = lyric?.offsetX ?? 0,
        offsetY = lyric?.offsetY ?? 0;
      const center = centerAt(tick) + offsetX;
      const left = center - FONT_SIZE / 2;
      const nextLyric = lyrics
        .filter(
          (lyric) =>
            lyric.verse === verse && lyric.tick > tick && lyric.text.length > 0,
        )
        .sort((a, b) => a.tick - b.tick)[0];
      const availableWidth = Math.max(
        24,
        (nextLyric
          ? centerAt(nextLyric.tick) + (nextLyric.offsetX ?? 0)
          : width - 8) -
          left -
          4,
      );
      const lines = wrapLyric(text, availableWidth);
      const vocal =
        lyric?.anchorMode === "free"
          ? undefined
          : bar.vocalNotes?.find(
              (note) =>
                note.degree !== 0 &&
                note.tick === tick &&
                (!lyric?.vocalNoteId || note.id === lyric.vocalNoteId),
            );
      return {
        tick,
        text,
        left,
        center,
        offsetX,
        offsetY,
        availableWidth,
        lines,
        anchorMode: lyric?.anchorMode ?? "auto",
        vocalNoteId: vocal?.id,
        height: Math.max(32, lines.length * LINE_HEIGHT + 14),
        editWidth: Math.max(24, Math.min(availableWidth, textWidth(text) + 10)),
      };
    });
    return {
      verse,
      cells,
      height: Math.max(
        32,
        ...cells.map((cell) => cell.height + Math.max(0, cell.offsetY)),
      ),
    };
  });
  return {
    verses,
    height: 10 + verses.reduce((total, verse) => total + verse.height, 0),
  };
}
export function scoreLyricsRowHeights(props: LyricsLayout): number[] {
  return lyricLayout(props).verses.map((verse) => verse.height);
}
export function scoreLyricsHeight(props: LyricsLayout) {
  return lyricLayout(props).height;
}

/** Ink/editor bounds include visual offsets without changing musical positions. */
export function scoreLyricsHorizontalBounds(
  props: LyricsLayout,
  includeEditor = false,
): { left: number; right: number } {
  let left = 8,
    right = props.width - 8;
  for (const { cells } of lyricLayout(props).verses)
    for (const cell of cells) {
      if (!cell.text) continue;
      const centered =
        cell.lines.length === 1 && textWidth(cell.text) <= FONT_SIZE + 1;
      for (const line of cell.lines) {
        const width = textWidth(line);
        const start = centered ? cell.center - width / 2 : cell.left;
        left = Math.min(left, start);
        right = Math.max(right, start + width);
      }
      if (includeEditor) {
        left = Math.min(left, cell.center - 12);
        right = Math.max(
          right,
          cell.center - 12 + Math.max(36, cell.editWidth),
        );
      }
    }
  return { left, right };
}
type LyricCell = ReturnType<
  typeof lyricLayout
>["verses"][number]["cells"][number];
type DragState = {
  verse: number;
  tick: number;
  mode: "time" | "layout";
  clientX: number;
  clientY: number;
  anchorClientX: number;
  startAbsolute: number;
  nextAbsolute: number;
  startOffsetX: number;
  startOffsetY: number;
  nextOffsetX: number;
  nextOffsetY: number;
  offsetX: number;
  offsetY: number;
};

export default function ScoreLyrics({
  bar,
  barNumber,
  points,
  x,
  step,
  width,
  lineCount = 2,
  top,
  meter = "4/4",
  rowHeights,
  tickAt,
  snapStep = 1,
  absoluteTickAt,
  barStartTick,
  extensions = [],
  editing,
}: ScoreLyricsProps) {
  const root = useRef<SVGGElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<Record<number, number>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const keyFor = (tick: number, verse: number) =>
    bar.id + ":" + tick + ":" + verse;
  const selected =
    editing?.selected?.barId === bar.id ? editing.selected : undefined;
  const activeVerse =
    editing?.active === false
      ? undefined
      : focused
        ? Number(focused.split(":").at(-1))
        : (editing?.selected?.verse ?? 0);
  const { verses } = lyricLayout({ bar, points, x, step, width, lineCount }, [
    ...Object.values(temporary),
    ...(selected ? [selected.tick] : []),
  ]);
  const heights = verses.map(({ height }, index) =>
    Math.max(height, rowHeights?.[index] ?? 0),
  );
  const endTick = bar.events.reduce(
    (total, event) => total + event.durationTicks,
    0,
  );
  const snap = (tick: number) =>
    clamp(
      Math.round(tick / Math.max(1, snapStep)) * Math.max(1, snapStep),
      0,
      endTick - 1,
    );
  const centerAt = (tick: number) => Math.min(width - 12, x(tick) + step / 2);
  const localTick = (position: number) => {
    if (tickAt) return snap(tickAt(position));
    let lower = 0,
      upper = endTick - 1;
    while (lower < upper) {
      const mid = Math.floor((lower + upper) / 2);
      if (centerAt(mid) < position) lower = mid + 1;
      else upper = mid;
    }
    const previous = Math.max(0, lower - 1);
    return snap(
      Math.abs(centerAt(previous) - position) <
        Math.abs(centerAt(lower) - position)
        ? previous
        : lower,
    );
  };
  const localPoint = (clientX: number, clientY: number) => {
    const matrix = root.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      : null;
  };
  const focusAt = (verse: number, tick: number) => {
    if (!editing || editing.locked) return;
    const nextTick = snap(tick);
    pendingFocus.current = keyFor(nextTick, verse);
    setTemporary((previous) => ({ ...previous, [verse]: nextTick }));
    setFocused(keyFor(nextTick, verse));
    editing.onSelect?.(bar.id, nextTick, verse);
  };
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const input = root.current?.querySelector<HTMLTextAreaElement>(
      '[data-lyric-cell="' + CSS.escape(pending) + '"]',
    );
    if (input) {
      pendingFocus.current = null;
      input.focus({ preventScroll: true });
    }
  }, [focused, temporary, editing?.active, editing?.selected?.verse]);

  const onKey = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    tick: number,
    verse: number,
  ) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    const scoreRoot = event.currentTarget.closest(".tab-preview");
    if (!scoreRoot) return;
    if (event.key === "Tab") {
      const cells = Array.from(
        scoreRoot.querySelectorAll<HTMLTextAreaElement>(
          'textarea[data-lyric-verse="' + verse + '"]:not(:disabled)',
        ),
      );
      const next =
        cells[cells.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      focusAt((verse + 1) % verses.length, tick);
    } else if (event.key === "Escape") event.currentTarget.blur();
  };
  const startDrag = (
    event: PointerEvent<SVGGElement>,
    cell: LyricCell,
    verse: number,
  ) => {
    const mode = editing?.mode ?? "time";
    if (
      !editing ||
      editing.locked ||
      (mode === "layout"
        ? !editing.onLayout
        : !editing.onMove || !absoluteTickAt)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const matrix = root.current?.getScreenCTM();
    const visualAnchor = new DOMPoint(cell.center, 0).matrixTransform(
      matrix ?? new DOMMatrix(),
    );
    const musicalAnchor = new DOMPoint(
      cell.center - cell.offsetX,
      0,
    ).matrixTransform(matrix ?? new DOMMatrix());
    const anchorClientX =
      bounds.x + bounds.width / 2 - (visualAnchor.x - musicalAnchor.x);
    const startAbsolute =
      barStartTick === undefined
        ? (absoluteTickAt?.(anchorClientX) ?? cell.tick)
        : barStartTick + cell.tick;
    const next: DragState = {
      tick: cell.tick,
      verse,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      anchorClientX,
      startAbsolute,
      nextAbsolute: startAbsolute,
      startOffsetX: cell.offsetX,
      startOffsetY: cell.offsetY,
      nextOffsetX: cell.offsetX,
      nextOffsetY: cell.offsetY,
      offsetX: 0,
      offsetY: 0,
    };
    dragRef.current = next;
    setDrag(next);
    const activeInput = document.activeElement;
    if (
      activeInput instanceof HTMLTextAreaElement &&
      root.current?.contains(activeInput)
    )
      activeInput.blur();
    setFocused(null);
    event.currentTarget.focus({ preventScroll: true });
    editing.onSelect?.(bar.id, cell.tick, verse);
  };
  const moveDrag = (event: PointerEvent<SVGGElement>) => {
    const previous = dragRef.current;
    if (!previous) return;
    event.preventDefault();
    event.stopPropagation();
    const startPoint = localPoint(previous.clientX, previous.clientY),
      point = localPoint(event.clientX, event.clientY);
    const dx = startPoint && point ? point.x - startPoint.x : 0,
      dy = startPoint && point ? point.y - startPoint.y : 0;
    const next = { ...previous };
    if (previous.mode === "layout") {
      next.nextOffsetX = clamp(Math.round(previous.startOffsetX + dx), -96, 96);
      next.nextOffsetY = clamp(Math.round(previous.startOffsetY + dy), -24, 24);
      next.offsetX = next.nextOffsetX - previous.startOffsetX;
      next.offsetY = next.nextOffsetY - previous.startOffsetY;
    } else {
      next.offsetX = dx;
      if (absoluteTickAt)
        next.nextAbsolute =
          Math.round(
            absoluteTickAt(
              previous.anchorClientX + event.clientX - previous.clientX,
            ) / Math.max(1, snapStep),
          ) * Math.max(1, snapStep);
    }
    dragRef.current = next;
    setDrag(next);
  };
  const endDrag = (event: PointerEvent<SVGGElement>, cancel = false) => {
    const previous = dragRef.current;
    if (!previous) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancel) return;
    if (previous.mode === "layout") {
      if (
        previous.nextOffsetX !== previous.startOffsetX ||
        previous.nextOffsetY !== previous.startOffsetY
      )
        editing?.onLayout?.(
          bar.id,
          previous.verse,
          previous.tick,
          previous.nextOffsetX,
          previous.nextOffsetY,
        );
    } else if (previous.nextAbsolute !== previous.startAbsolute)
      editing?.onMove?.(
        bar.id,
        previous.verse,
        previous.tick,
        previous.nextAbsolute,
      );
    const scoreRoot = event.currentTarget.closest(".tab-preview");
    const previousKey = keyFor(previous.tick, previous.verse);
    const targetBar =
      previous.mode === "time"
        ? scoreRoot
            ?.querySelectorAll("[data-preview-bar]")
            [Math.floor(previous.nextAbsolute / endTick)]?.getAttribute(
              "data-preview-bar",
            )
        : undefined;
    const targetKey = targetBar
      ? targetBar +
        ":" +
        (previous.nextAbsolute % endTick) +
        ":" +
        previous.verse
      : previousKey;
    requestAnimationFrame(() => {
      const target =
        scoreRoot?.querySelector<SVGGElement>(
          '[data-lyric-drag="' + CSS.escape(targetKey) + '"]',
        ) ??
        scoreRoot?.querySelector<SVGGElement>(
          '[data-lyric-drag="' + CSS.escape(previousKey) + '"]',
        );
      target?.focus({ preventScroll: true });
    });
  };
  const moveKey = (
    event: KeyboardEvent<SVGGElement>,
    cell: LyricCell,
    verse: number,
  ) => {
    event.stopPropagation();
    const mode = editing?.mode ?? "time";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (
      !editing ||
      editing.locked ||
      (!horizontal && !(mode === "layout" && vertical))
    )
      return;
    event.preventDefault();
    const previousKey = keyFor(cell.tick, verse),
      scoreRoot = event.currentTarget.closest(".tab-preview");
    let targetKey = previousKey;
    if (mode === "layout")
      editing.onLayout?.(
        bar.id,
        verse,
        cell.tick,
        clamp(
          cell.offsetX +
            (horizontal ? (event.key === "ArrowRight" ? 1 : -1) : 0),
          -96,
          96,
        ),
        clamp(
          cell.offsetY + (vertical ? (event.key === "ArrowDown" ? 1 : -1) : 0),
          -24,
          24,
        ),
      );
    else if (absoluteTickAt && editing.onMove) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const matrix = root.current?.getScreenCTM();
      const offset = matrix ? cell.offsetX * matrix.a : 0;
      const start =
        barStartTick === undefined
          ? absoluteTickAt(bounds.x + bounds.width / 2 - offset)
          : barStartTick + cell.tick;
      const next =
        start + (event.key === "ArrowRight" ? 1 : -1) * Math.max(1, snapStep);
      const targetBar = scoreRoot
        ?.querySelectorAll("[data-preview-bar]")
        [Math.floor(next / endTick)]?.getAttribute("data-preview-bar");
      if (targetBar)
        targetKey = targetBar + ":" + (next % endTick) + ":" + verse;
      editing.onMove(bar.id, verse, cell.tick, next);
    }
    requestAnimationFrame(() => {
      const target =
        scoreRoot?.querySelector<SVGGElement>(
          '[data-lyric-drag="' + CSS.escape(targetKey) + '"]',
        ) ??
        scoreRoot?.querySelector<SVGGElement>(
          '[data-lyric-drag="' + CSS.escape(previousKey) + '"]',
        );
      target?.focus({ preventScroll: true });
    });
  };
  const canMove =
    editing?.mode === "layout"
      ? !!editing.onLayout
      : !!editing?.onMove && !!absoluteTickAt;

  return (
    <g
      ref={root}
      className="tab-lyrics-space score-lyrics"
      data-lyrics-space="true"
      aria-label="歌词"
      transform={"translate(0 " + top + ")"}
    >
      {verses.map(({ verse, cells }) => {
        const height = heights[verse],
          y =
            5 +
            heights.slice(0, verse).reduce((total, value) => total + value, 0);
        const showEmpty = !!editing && activeVerse === verse;
        const activeCell =
          editing && !editing.locked
            ? cells.find((cell) => focused === keyFor(cell.tick, verse))
            : undefined;
        return (
          <g
            key={verse}
            className="score-lyric-verse"
            data-lyric-row={verse + 1}
            data-lyric-row-active={showEmpty || undefined}
          >
            {showEmpty && (
              <>
                <rect
                  className="score-lyric-timeline"
                  data-lyric-timeline={bar.id + ":" + verse}
                  x={26}
                  y={y}
                  width={Math.max(0, width - 34)}
                  height={height}
                  fill="transparent"
                  role="button"
                  tabIndex={editing.locked ? -1 : 0}
                  aria-label={
                    "第 " +
                    barNumber +
                    " 小节，第 " +
                    (verse + 1) +
                    " 行歌词时间轴，点击选择起唱位置"
                  }
                  aria-disabled={editing.locked}
                  onPointerDown={(event) => {
                    if (editing.locked) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const point = localPoint(event.clientX, event.clientY);
                    if (point) focusAt(verse, localTick(point.x));
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusAt(
                        verse,
                        selected?.verse === verse ? selected.tick : 0,
                      );
                    }
                  }}
                />
                <line
                  className="score-lyric-guide"
                  x1={26}
                  x2={width - 8}
                  y1={y + height - 3}
                  y2={y + height - 3}
                />
              </>
            )}
            {editing && (
              <text className="score-lyric-verse-label" x={12} y={y + 18}>
                {verse + 1}
              </text>
            )}
            {cells
              .filter((cell) => cell.text || showEmpty)
              .map((cell) => {
                const active =
                  !!editing &&
                  !editing.locked &&
                  focused === keyFor(cell.tick, verse);
                const picked =
                  editing?.active !== false &&
                  selected?.tick === cell.tick &&
                  selected.verse === verse;
                const obscured =
                  !cell.text &&
                  cells.some(
                    (other) =>
                      other.text &&
                      other.tick < cell.tick &&
                      other.left + textWidth(other.lines[0]) > cell.center - 10,
                  );
                const centered =
                  cell.lines.length === 1 &&
                  textWidth(cell.text) <= FONT_SIZE + 1;
                const moving = drag?.tick === cell.tick && drag.verse === verse;
                const dx = moving ? drag.offsetX : 0,
                  dy = moving ? drag.offsetY : 0;
                return (
                  <g
                    key={cell.tick}
                    data-lyric-text={cell.text || undefined}
                    data-lyric-tick={cell.tick}
                    data-lyric-anchor={cell.anchorMode}
                    data-lyric-vocal={cell.vocalNoteId}
                    data-lyric-offset-x={cell.offsetX}
                    data-lyric-offset-y={cell.offsetY}
                    className={
                      "score-lyric-onset" + (picked ? " is-selected" : "")
                    }
                    transform={
                      dx || dy ? "translate(" + dx + " " + dy + ")" : undefined
                    }
                  >
                    {editing && picked && !active && (
                      <rect
                        className="score-lyric-selection"
                        x={cell.center - 12}
                        y={y + cell.offsetY}
                        width={Math.max(24, cell.editWidth)}
                        height={cell.height - 5}
                        rx={3}
                        fill="#b8804812"
                        stroke="#b8804870"
                      />
                    )}
                    {!active && (cell.text || (showEmpty && !obscured)) && (
                      <text
                        className={
                          cell.text
                            ? "score-lyric-text"
                            : "score-lyric-placeholder"
                        }
                        x={centered || !cell.text ? cell.center : cell.left}
                        y={y + 18 + cell.offsetY}
                        textAnchor={centered || !cell.text ? "middle" : "start"}
                        xmlSpace="preserve"
                      >
                        {cell.text
                          ? cell.lines.map((line, index) => (
                              <tspan
                                key={index}
                                x={centered ? cell.center : cell.left}
                                dy={index === 0 ? 0 : LINE_HEIGHT}
                              >
                                {line}
                              </tspan>
                            ))
                          : "·"}
                      </text>
                    )}
                  </g>
                );
              })}
            {extensions
              .filter((extension) => extension.verse === verse)
              .map((extension, index) => {
                const cell = cells.find(
                  (cell) => cell.tick === extension.startTick,
                );
                const movingDrag =
                  drag &&
                  drag.tick === extension.startTick &&
                  drag.verse === verse
                    ? drag
                    : undefined;
                const offsetX =
                    (extension.offsetX ?? cell?.offsetX ?? 0) +
                    (movingDrag?.offsetX ?? 0),
                  offsetY =
                    (extension.offsetY ?? cell?.offsetY ?? 0) +
                    (movingDrag?.offsetY ?? 0);
                const text = extension.text ?? cell?.lines[0] ?? "";
                const extent = textWidth(text);
                const from =
                  extension.startTick === undefined
                    ? 26
                    : centerAt(extension.startTick) +
                      offsetX +
                      (extent <= FONT_SIZE + 1
                        ? extent / 2
                        : extent - FONT_SIZE / 2) +
                      5;
                const to =
                  extension.endTick === undefined
                    ? width - 8
                    : centerAt(extension.endTick) - 3;
                if (to <= from) return null;
                return (
                  <line
                    key={index}
                    className="score-lyric-extension"
                    data-lyric-extension={bar.id + ":" + verse + ":" + index}
                    data-lyric-extension-start={extension.startTick}
                    data-lyric-extension-end={extension.endTick}
                    x1={from}
                    x2={to}
                    y1={y + 22 + offsetY}
                    y2={y + 22 + offsetY}
                    stroke="#393128"
                    strokeWidth={1.1}
                    pointerEvents="none"
                  />
                );
              })}
            {editing &&
              cells
                .filter((cell) => cell.text || showEmpty)
                .map((cell) => {
                  const active =
                    !editing.locked && focused === keyFor(cell.tick, verse);
                  const inputWidth = active
                    ? Math.max(36, cell.editWidth)
                    : cell.text
                      ? cell.editWidth
                      : 24;
                  const inputLeft = cell.center - 12;
                  return (
                    <foreignObject
                      key={cell.tick}
                      x={inputLeft}
                      y={y + cell.offsetY}
                      width={inputWidth}
                      height={cell.height - 5}
                      className={
                        "score-lyric-field" + (active ? " is-focused" : "")
                      }
                      style={{
                        pointerEvents:
                          !active &&
                          activeCell &&
                          inputLeft <
                            activeCell.center -
                              12 +
                              Math.max(36, activeCell.editWidth) &&
                          inputLeft + inputWidth > activeCell.center - 12
                            ? "none"
                            : "auto",
                      }}
                    >
                      <textarea
                        className="score-lyric-input"
                        data-lyric-cell={keyFor(cell.tick, verse)}
                        data-lyric-verse={verse}
                        aria-label={
                          "第 " +
                          barNumber +
                          " 小节，第 " +
                          (verse + 1) +
                          " 行歌词，" +
                          beatLabel(cell.tick, meter)
                        }
                        title={
                          cell.text ||
                          "点击填写歌词；Tab 移至下一位置，Enter 切换歌词行"
                        }
                        value={cell.text}
                        maxLength={120}
                        disabled={editing.locked}
                        rows={1}
                        spellCheck={false}
                        style={{ opacity: active ? 1 : 0 }}
                        onFocus={() => {
                          setFocused(keyFor(cell.tick, verse));
                          editing.onSelect?.(bar.id, cell.tick, verse);
                          editing.onBegin?.(bar.id, cell.tick, verse);
                        }}
                        onBlur={() => {
                          setFocused((previous) =>
                            previous === keyFor(cell.tick, verse)
                              ? null
                              : previous,
                          );
                          editing.onEnd?.();
                        }}
                        onChange={(event) =>
                          editing.onChange(
                            bar.id,
                            cell.tick,
                            verse,
                            event.target.value.replace(/[\r\n]+/g, " "),
                          )
                        }
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (event.button === 2 && !active)
                            event.preventDefault();
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => onKey(event, cell.tick, verse)}
                        onKeyUp={(event) => event.stopPropagation()}
                      />
                    </foreignObject>
                  );
                })}
            {editing &&
              canMove &&
              cells
                .filter(
                  (cell) =>
                    cell.text &&
                    editing.active !== false &&
                    (focused === keyFor(cell.tick, verse) ||
                      (selected?.tick === cell.tick &&
                        selected.verse === verse) ||
                      (drag?.tick === cell.tick && drag.verse === verse)),
                )
                .map((cell) => {
                  const moving =
                    drag?.tick === cell.tick && drag.verse === verse;
                  return (
                    <g
                      key={"move-" + cell.tick}
                      className="score-lyric-drag-handle"
                      data-lyric-drag={keyFor(cell.tick, verse)}
                      data-lyric-drag-mode={editing.mode ?? "time"}
                      transform={
                        "translate(" +
                        (cell.center + (moving ? drag.offsetX : 0)) +
                        " " +
                        (y +
                          cell.height -
                          7 +
                          cell.offsetY +
                          (moving ? drag.offsetY : 0)) +
                        ")"
                      }
                      role="button"
                      tabIndex={editing.locked ? -1 : 0}
                      aria-label={
                        (editing.mode === "layout"
                          ? "排版移动第 "
                          : "移动第 ") +
                        (verse + 1) +
                        " 行歌词“" +
                        cell.text +
                        "”，方向键" +
                        (editing.mode === "layout"
                          ? "调整显示位置"
                          : "微调起唱位置")
                      }
                      aria-disabled={editing.locked}
                      onPointerDown={(event) => startDrag(event, cell, verse)}
                      onPointerMove={moveDrag}
                      onPointerUp={(event) => endDrag(event)}
                      onPointerCancel={(event) => endDrag(event, true)}
                      onLostPointerCapture={() => {
                        dragRef.current = null;
                        setDrag(null);
                      }}
                      onKeyDown={(event) => moveKey(event, cell, verse)}
                    >
                      <rect
                        x={-9}
                        y={-5}
                        width={18}
                        height={10}
                        rx={4}
                        fill="#f4ebdd"
                        stroke="#b98157"
                      />
                      <path
                        d={
                          editing.mode === "layout"
                            ? "M-4 0H4M0-3V3M-4 0L-2-2M-4 0L-2 2M4 0L2-2M4 0L2 2M0-3L-2-1M0-3L2-1M0 3L-2 1M0 3L2 1"
                            : "M -5 0 H 5 M -5 0 L -2 -2 M -5 0 L -2 2 M 5 0 L 2 -2 M 5 0 L 2 2"
                        }
                        fill="none"
                        stroke="#9b663f"
                        strokeWidth={1}
                      />
                    </g>
                  );
                })}
          </g>
        );
      })}
    </g>
  );
}
