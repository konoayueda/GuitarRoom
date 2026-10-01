"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Music2 } from "lucide-react";
import {
  barTicks,
  barGridPoints,
  beatLabel,
  durationLabel,
  eventAttacks,
  writtenNotes,
  tieCandidate,
  type Arrangement,
  type ArrangementBar,
} from "@/lib/arrangement";
import { tieRibbonPath } from "@/lib/tie-engraving";
import { barRhythm } from "@/lib/notation";
import type { TickSpan } from "@/lib/score-editing";
import RhythmNotation from "./rhythm-notation";
import VocalNotation, { VOCAL_LANE_HEIGHT, vocalTieY } from "./vocal-notation";
import {
  lyricLineCount,
  writtenVocalNotes,
  lyricVocalNote,
} from "@/lib/vocal-score";
import ScoreChordDiagram from "./score-chord-diagram";
import ScoreSymbolHelp from "./score-symbol-help";
import ScoreLyrics, {
  scoreLyricsRowHeights,
  scoreLyricsHorizontalBounds,
  type LyricExtension,
} from "./score-lyrics";
import { symbolHelp, noteHelp } from "@/lib/score-symbols";
import type { PlaybackPosition } from "./arrangement-player";

export type ScoreSelection = {
  barId: string;
  eventId: string;
  tick?: number;
  stringIndex?: number;
};
export type ScoreEditing = {
  gridStep: number;
  selected: ScoreSelection;
  locked: boolean;
  onSelect: (selection: ScoreSelection, extend?: boolean) => void;
  range?: TickSpan;
  onKey: (event: KeyboardEvent<SVGGElement>, selection: ScoreSelection) => void;
  sectionHeading: (sectionId: string, index: number) => ReactNode;
  sectionEnd: (sectionId: string) => ReactNode;
  barTools: (barId: string) => ReactNode;
  inspector: (barId: string) => ReactNode;
  onLyricChange: (
    barId: string,
    tick: number,
    verse: number,
    text: string,
  ) => void;
  onLyricBegin: (barId: string, tick: number, verse: number) => void;
  lyricSelected?: { barId: string; tick: number; verse: number };
  onLyricSelect: (barId: string, tick: number, verse: number) => void;
  onLyricMove: (
    barId: string,
    verse: number,
    tick: number,
    absolute: number,
  ) => void;
  lyricActive?: boolean;
  lyricMode?: "time" | "layout";
  onLyricLayout?: (
    barId: string,
    verse: number,
    tick: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  vocalActive?: boolean;
  vocalSelected?: { barId: string; tick: number };
  onVocalSelect: (barId: string, tick: number) => void;
  onVocalKey: (
    event: KeyboardEvent<SVGGElement>,
    barId: string,
    tick: number,
  ) => void;
};
export default function ArrangementPreview({
  arrangement,
  title,
  capo,
  position,
  onSelect,
  editing,
}: {
  arrangement: Arrangement;
  title: string;
  capo: number;
  position?: PlaybackPosition | null;
  onSelect?: (barId: string, eventId: string) => void;
  editing?: ScoreEditing;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(960);
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setAvailableWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const soundingBar = position?.event.bar.bar.id;
  useEffect(() => {
    if (soundingBar && root.current?.getClientRects().length)
      root.current
        .querySelector(`[data-preview-bar="${CSS.escape(soundingBar)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [soundingBar]);
  const limit = barTicks(arrangement.meter);
  const written = writtenNotes(arrangement);
  const vocals = writtenVocalNotes(arrangement);
  const lines = lyricLineCount(arrangement);
  const showVocal = !!editing || vocals.length > 0;
  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string>();
  for (const n of written) {
    if (n.tieToNext) {
      const target = tieCandidate(written, n);
      if (target) {
        outgoing.set(
          n.eventId + ":" + n.offsetTick + ":" + n.stringIndex,
          target.barId,
        );
        incoming.set(
          target.eventId + ":" + target.offsetTick + ":" + target.stringIndex,
          n.barId,
        );
      }
    }
  }
  const sectionWidths = new Map(
    arrangement.sections.map((s) => [
      s.id,
      Math.max(
        editing ? 480 : 336,
        ...s.bars.map(
          (b) =>
            (barGridPoints(
              b,
              editing?.gridStep ?? 12,
              Math.max(
                limit,
                b.events.reduce((n, e) => n + e.durationTicks, 0),
              ),
              arrangement.pattern,
            ).length -
              1) *
              34 +
            42,
        ),
      ),
    ]),
  );
  const rowGap = editing ? 22 : 20,
    staffBottom = 54 + 5 * rowGap;
  const barNumbers = new Map(
    arrangement.sections
      .flatMap((s) => s.bars)
      .map((bar, i) => [bar.id, i + 1]),
  );
  const lyricExtensions = new Map<string, LyricExtension[]>();
  const orderedBars = arrangement.sections.flatMap((section) => section.bars);
  const allLyrics = orderedBars.flatMap((bar, index) =>
    (bar.lyrics ?? []).map((lyric) => ({
      bar,
      lyric,
      startTick: index * limit + lyric.tick,
    })),
  );
  for (const { bar, lyric, startTick } of allLyrics) {
    if (!lyric.endVocalNoteId || !lyricVocalNote(arrangement, bar.id, lyric))
      continue;
    const endNote = vocals.find((note) => note.id === lyric.endVocalNoteId);
    if (!endNote || endNote.startTick <= startTick) continue;
    const nextWord = allLyrics.find(
      (item) =>
        item.lyric.verse === lyric.verse &&
        item.startTick > startTick &&
        item.startTick <= endNote.startTick,
    );
    const endTick = nextWord ? nextWord.startTick : endNote.startTick;
    for (
      let i = Math.floor(startTick / limit);
      i <= Math.floor(endTick / limit);
      i++
    ) {
      const currentBar = orderedBars[i];
      if (!currentBar) continue;
      const start = i === Math.floor(startTick / limit);
      const segment: LyricExtension = {
        verse: lyric.verse,
        offsetY: lyric.offsetY,
        ...(start
          ? { startTick: lyric.tick, text: lyric.text, offsetX: lyric.offsetX }
          : {}),
        ...(i === Math.floor(endTick / limit)
          ? { endTick: endTick % limit }
          : {}),
      };
      lyricExtensions.set(currentBar.id, [
        ...(lyricExtensions.get(currentBar.id) ?? []),
        segment,
      ]);
    }
  }
  return (
    <div
      className={"tab-preview " + (editing ? "editable-score" : "")}
      ref={root}
      aria-label={editing ? "可视化编排谱面" : "编排阅读谱面"}
    >
      <header className="tab-preview-heading">
        <span className="eyebrow">
          {editing ? "SCORE EDITOR" : "ARRANGEMENT SCORE"}
        </span>
        <h2>{title}</h2>
        <div className="tab-preview-meta">
          <span>{arrangement.meter}</span>
          <span>♩ = {arrangement.bpm || "—"}</span>
          <span>{arrangement.pattern === "strum" ? "扫弦" : "分解和弦"}</span>
          <span>Capo {capo}</span>
          {showVocal && <span>唱音 1 = {arrangement.vocalKey ?? "C"}</span>}
        </div>
        <p>
          {editing
            ? "点击定位 · 吉他与唱音分别写谱 · 歌词可关联唱音或独立起唱 · 时间与排版分开调整"
            : "× 按和弦拨弦 · 数字指定品位（相对变调夹）· 悬停查看符号说明"}
        </p>
      </header>
      {!arrangement.sections.length ? (
        <div className="tab-preview-empty">
          <Music2 size={28} />
          <h3>让想练的片段，落在谱上</h3>
          <p>添加小节后，和弦与节奏会实时显示在这里。</p>
        </div>
      ) : (
        arrangement.sections.map((section, si) => {
          const minimumWidth = sectionWidths.get(section.id)!;
          const columns = Math.max(
            1,
            Math.min(4, Math.floor(availableWidth / minimumWidth)),
          );
          const measureWidth = Math.max(minimumWidth, availableWidth / columns);
          const layouts = section.bars.map((bar) =>
            layoutBar(bar, measureWidth, limit, arrangement, editing),
          );
          // A common harmony band keeps neighboring staves level, including dense changes.
          const chordSpace =
            Math.max(1, ...layouts.map((layout) => layout.chordRows)) * 104 -
            20;
          const systems = Array.from(
            { length: Math.ceil(section.bars.length / columns) },
            (_, row) => section.bars.slice(row * columns, (row + 1) * columns),
          );
          return (
            <section className="tab-preview-section" key={section.id}>
              {editing ? (
                editing.sectionHeading(section.id, si)
              ) : (
                <div className="tab-preview-section-heading">
                  <h3>
                    <span>{String.fromCharCode(65 + si)}</span>
                    {section.label || "未命名段落"}
                  </h3>
                  <span>播放 {section.repeat} 遍</span>
                </div>
              )}
              <div className="tab-score-systems">
                {systems.map((system, systemIndex) => {
                  const firstIndex = systemIndex * columns;
                  const systemLayouts = layouts.slice(
                    firstIndex,
                    firstIndex + system.length,
                  );
                  const vocalTop =
                    staffBottom +
                    Math.max(...systemLayouts.map((l) => l.rhythm.lanes)) * 44 +
                    66;
                  const lyricsTop =
                    vocalTop + (showVocal ? VOCAL_LANE_HEIGHT : 0);
                  const lyricRows = system.map((bar, i) =>
                    scoreLyricsRowHeights({
                      bar,
                      ...systemLayouts[i],
                      lineCount: lines,
                    }),
                  );
                  const rowHeights = Array.from({ length: lines }, (_, verse) =>
                    Math.max(...lyricRows.map((h) => h[verse] ?? 28)),
                  );
                  const lyricsHeight =
                    10 + rowHeights.reduce((sum, h) => sum + h, 0);
                  const systemWidth = measureWidth * system.length;
                  const lyricBounds = system.map((bar, i) => {
                    const bounds = scoreLyricsHorizontalBounds(
                      { bar, ...systemLayouts[i], lineCount: lines },
                      !!editing,
                    );
                    return {
                      left: i * measureWidth + bounds.left,
                      right: i * measureWidth + bounds.right,
                    };
                  });
                  const leftPadding = Math.max(
                    0,
                    Math.ceil(8 - Math.min(...lyricBounds.map((b) => b.left))),
                  );
                  const rightPadding = Math.max(
                    0,
                    Math.ceil(
                      Math.max(...lyricBounds.map((b) => b.right)) +
                        8 -
                        systemWidth,
                    ),
                  );
                  const drawingWidth = systemWidth + leftPadding + rightPadding;
                  const systemIds = new Set(system.map((bar) => bar.id));
                  return (
                    <div className="tab-score-system" key={system[0].id}>
                      <div className="tab-system-scroll">
                        <div
                          className="tab-system-headings"
                          style={{
                            width: systemWidth,
                            marginLeft: leftPadding,
                            gridTemplateColumns: `repeat(${system.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {system.map((bar) => (
                            <header
                              key={bar.id}
                              className={
                                editing?.selected.barId === bar.id
                                  ? "selected"
                                  : ""
                              }
                            >
                              <span>
                                {String(barNumbers.get(bar.id)).padStart(
                                  2,
                                  "0",
                                )}
                              </span>
                              {editing?.barTools(bar.id)}
                            </header>
                          ))}
                        </div>
                        <svg
                          className="tab-system-svg"
                          width={drawingWidth}
                          viewBox={`${-leftPadding} 0 ${drawingWidth} ${chordSpace + lyricsTop + lyricsHeight + 8}`}
                          role="group"
                          aria-label={`第 ${barNumbers.get(system[0].id)} 至 ${barNumbers.get(system.at(-1)!.id)} 小节连续谱行`}
                        >
                          {system.map((bar, localIndex) => {
                            const bi = firstIndex + localIndex;
                            const barNumber = barNumbers.get(bar.id)!;
                            const {
                              total,
                              points,
                              width,
                              step,
                              x,
                              rhythm,
                              diagrams,
                              tickAt,
                            } = layouts[bi];
                            const active = soundingBar === bar.id;
                            let offset = 0;
                            return (
                              <g
                                className={
                                  "tab-preview-bar " +
                                  (active ? "sounding " : "") +
                                  (editing?.selected.barId === bar.id
                                    ? "selected "
                                    : "") +
                                  (total !== limit ? "incomplete" : "")
                                }
                                key={bar.id}
                                data-preview-bar={bar.id}
                                transform={`translate(${localIndex * measureWidth} ${chordSpace})`}
                                role="group"
                                aria-label={`第 ${barNumber} 小节，${bar.events.map((e) => `${eventAttacks(e, arrangement.pattern).length ? (e.chord?.name ?? "单音") : "休止"}，${durationLabel(e.durationTicks)}`).join("；")}`}
                              >
                                <rect
                                  className="tab-measure-focus"
                                  x={localIndex === 0 ? 26 : 0}
                                  y="34"
                                  width={width - (localIndex === 0 ? 26 : 0)}
                                  height={staffBottom + 32}
                                />
                                {total !== limit && (
                                  <text
                                    className="tab-incomplete-label"
                                    x="30"
                                    y="28"
                                  >
                                    {total < limit
                                      ? `待补 ${(limit - total) / 24} 拍`
                                      : `超出 ${(total - limit) / 24} 拍`}
                                  </text>
                                )}
                                {total < limit && (
                                  <rect
                                    className="tab-unfilled"
                                    x={x(total)}
                                    y="40"
                                    width={x(limit) - x(total)}
                                    height={staffBottom - 32}
                                  />
                                )}
                                {total > limit && (
                                  <rect
                                    className="tab-overflow"
                                    x={x(limit)}
                                    y="40"
                                    width={x(total) - x(limit)}
                                    height={staffBottom - 32}
                                  />
                                )}
                                {active && (
                                  <rect
                                    className="tab-playhead"
                                    x={x(position!.tickInBar)}
                                    y="40"
                                    width={3}
                                    height={staffBottom - 32}
                                  />
                                )}
                                {editing?.range &&
                                  editing.range.start < barNumber * limit &&
                                  editing.range.end >
                                    (barNumber - 1) * limit && (
                                    <rect
                                      className="gp-range-highlight"
                                      data-selected-range="true"
                                      x={x(
                                        Math.max(
                                          0,
                                          editing.range.start -
                                            (barNumber - 1) * limit,
                                        ),
                                      )}
                                      y="40"
                                      width={
                                        x(
                                          Math.min(
                                            limit,
                                            editing.range.end -
                                              (barNumber - 1) * limit,
                                          ),
                                        ) -
                                        x(
                                          Math.max(
                                            0,
                                            editing.range.start -
                                              (barNumber - 1) * limit,
                                          ),
                                        )
                                      }
                                      height={
                                        staffBottom + rhythm.lanes * 44 - 20
                                      }
                                    />
                                  )}
                                {[0, 1, 2, 3, 4, 5].map((row) => (
                                  <g key={row}>
                                    {localIndex === 0 && (
                                      <text
                                        x="7"
                                        y={58 + row * rowGap}
                                        className="tab-string-label"
                                        {...symbolHelp(
                                          `第 ${row + 1} 弦`,
                                          row === 0
                                            ? "六线谱最上方是 1 弦，也就是最细的弦。"
                                            : "从上往下数第 " +
                                                (row + 1) +
                                                " 条线；最下方是最粗的 6 弦。",
                                          5,
                                        )}
                                      >
                                        {row + 1}
                                      </text>
                                    )}
                                    <line
                                      x1={localIndex === 0 ? 26 : 0}
                                      y1={54 + row * rowGap}
                                      x2={width}
                                      y2={54 + row * rowGap}
                                      className="tab-string"
                                    />
                                  </g>
                                ))}
                                {localIndex === 0 && (
                                  <line
                                    x1="26"
                                    y1="54"
                                    x2="26"
                                    y2={staffBottom}
                                    className="tab-barline"
                                    {...symbolHelp(
                                      "小节线",
                                      "分隔相邻小节；每小节的总时值由拍号决定。",
                                      3,
                                    )}
                                  />
                                )}
                                <line
                                  x1={width}
                                  y1="54"
                                  x2={width}
                                  y2={staffBottom}
                                  className="tab-barline"
                                  {...symbolHelp(
                                    "小节线",
                                    "分隔相邻小节；每小节的总时值由拍号决定。",
                                    3,
                                  )}
                                />
                                <RhythmNotation
                                  rhythm={rhythm}
                                  x={(tick) => x(tick) + step / 2}
                                  staffTop={54}
                                  rowGap={rowGap}
                                  staffStart={localIndex === 0 ? 26 : 0}
                                  staffEnd={width}
                                />
                                {editing &&
                                  points.slice(0, -1).map((tick) => (
                                    <text
                                      key={tick}
                                      className="tab-beat"
                                      {...symbolHelp(
                                        "拍位",
                                        beatLabel(tick, arrangement.meter) +
                                          "。" +
                                          (arrangement.meter === "6/8"
                                            ? "八分音符计数 1–6，每三个组成一组。"
                                            : "数字表示拍头，+ 表示半拍，· 表示更细的拍位。"),
                                        5,
                                      )}
                                      textAnchor="middle"
                                      x={x(tick) + step / 2}
                                      y={vocalTop - 15}
                                    >
                                      {arrangement.meter === "6/8"
                                        ? tick % 12 === 0
                                          ? tick / 12 + 1
                                          : "·"
                                        : tick % 24 === 0
                                          ? tick / 24 + 1
                                          : tick % 12 === 0
                                            ? "+"
                                            : "·"}
                                    </text>
                                  ))}
                                {bar.events.map((event) => {
                                  const start = offset;
                                  offset += event.durationTicks;
                                  const eventWidth =
                                    x(start + event.durationTicks) - x(start);
                                  const current =
                                    active &&
                                    position?.event.event.id === event.id;
                                  const notes = eventAttacks(
                                    event,
                                    arrangement.pattern,
                                    capo,
                                  );
                                  const stroke =
                                    event.stroke ??
                                    (arrangement.pattern === "strum"
                                      ? "down"
                                      : "pluck");
                                  const name =
                                    event.chord?.name ??
                                    (notes.length ? "单音" : "休止");
                                  const selected =
                                    editing?.selected.barId === bar.id &&
                                    editing.selected.eventId === event.id;
                                  return (
                                    <g
                                      key={event.id}
                                      data-preview-event={event.id}
                                      className={
                                        "tab-event " +
                                        (current ? "current " : "") +
                                        (selected ? "selected" : "")
                                      }
                                      role={
                                        editing
                                          ? "group"
                                          : onSelect
                                            ? "button"
                                            : undefined
                                      }
                                      tabIndex={onSelect ? 0 : undefined}
                                      aria-label={
                                        onSelect
                                          ? `编辑第 ${barNumber} 小节的 ${name}`
                                          : undefined
                                      }
                                      onClick={() => {
                                        if (editing && !editing.locked)
                                          editing.onSelect({
                                            barId: bar.id,
                                            eventId: event.id,
                                          });
                                        else onSelect?.(bar.id, event.id);
                                      }}
                                      onKeyDown={(e) => {
                                        if (
                                          onSelect &&
                                          (e.key === "Enter" || e.key === " ")
                                        ) {
                                          e.preventDefault();
                                          onSelect(bar.id, event.id);
                                        }
                                      }}
                                    >
                                      <rect
                                        className="tab-event-hit"
                                        x={x(start)}
                                        y="0"
                                        width={eventWidth}
                                        height="145"
                                      />
                                      {editing && (
                                        <g
                                          role="button"
                                          tabIndex={editing.locked ? -1 : 0}
                                          aria-disabled={editing.locked}
                                          aria-label={`编辑第 ${barNumber} 小节的 ${name}`}
                                          className="score-chord-target"
                                          onKeyDown={(e) => {
                                            if (
                                              !editing.locked &&
                                              (e.key === "Enter" ||
                                                e.key === " ")
                                            ) {
                                              e.preventDefault();
                                              editing.onSelect({
                                                barId: bar.id,
                                                eventId: event.id,
                                              });
                                            }
                                          }}
                                        >
                                          <rect
                                            x={x(start)}
                                            y="0"
                                            width={eventWidth}
                                            height="40"
                                            fill="transparent"
                                          />
                                        </g>
                                      )}
                                      {editing &&
                                        !event.chord &&
                                        eventWidth > 48 && (
                                          <text
                                            className="tab-add-chord"
                                            x={x(start) + 4}
                                            y="16"
                                          >
                                            和弦 +
                                          </text>
                                        )}
                                      {(stroke === "down" || stroke === "up") &&
                                        [
                                          ...new Set(
                                            notes.map((n) => n.offsetTick),
                                          ),
                                        ].map((tick) => {
                                          const strings = notes
                                            .filter(
                                              (n) => n.offsetTick === tick,
                                            )
                                            .map((n) => n.stringIndex);
                                          if (strings.length < 2) return null;
                                          const low =
                                              54 +
                                              (5 - Math.min(...strings)) *
                                                rowGap,
                                            high =
                                              54 +
                                              (5 - Math.max(...strings)) *
                                                rowGap;
                                          const from =
                                              stroke === "down" ? low : high,
                                            to = stroke === "down" ? high : low,
                                            px =
                                              x(start + tick) + step / 2 - 17,
                                            tail =
                                              to - Math.sign(to - from) * 6;
                                          return (
                                            <path
                                              key={tick}
                                              className="tab-strum-arrow"
                                              {...symbolHelp(
                                                stroke === "down"
                                                  ? "向下扫弦"
                                                  : "向上扫弦",
                                                (stroke === "down"
                                                  ? "从较粗的弦向较细的弦扫奏（6 → 1）。"
                                                  : "从较细的弦向较粗的弦扫奏（1 → 6）。") +
                                                  "只扫箭头覆盖且谱面标出的弦。",
                                                35,
                                              )}
                                              data-stroke={stroke}
                                              d={
                                                "M" +
                                                px +
                                                "," +
                                                from +
                                                "V" +
                                                to +
                                                "M" +
                                                (px - 3) +
                                                "," +
                                                tail +
                                                "L" +
                                                px +
                                                "," +
                                                to +
                                                "L" +
                                                (px + 3) +
                                                "," +
                                                tail
                                              }
                                            ></path>
                                          );
                                        })}
                                      {notes.map((note, ni) => (
                                        <g
                                          key={ni}
                                          className="tab-note"
                                          data-string={6 - note.stringIndex}
                                          data-fret={note.fret}
                                          data-marker={note.marker}
                                          data-tick={start + note.offsetTick}
                                          data-note-duration={
                                            note.durationTicks
                                          }
                                        >
                                          <rect
                                            {...noteHelp(
                                              note,
                                              event.chord?.name,
                                            )}
                                            x={
                                              x(start + note.offsetTick) +
                                              step / 2 -
                                              10
                                            }
                                            y={
                                              54 +
                                              (5 - note.stringIndex) * rowGap -
                                              9
                                            }
                                            width="20"
                                            height="17"
                                            rx="2"
                                          />
                                          <text
                                            x={
                                              x(start + note.offsetTick) +
                                              step / 2
                                            }
                                            y={
                                              54 +
                                              (5 - note.stringIndex) * rowGap +
                                              5
                                            }
                                            textAnchor="middle"
                                          >
                                            {note.marker === "cross"
                                              ? "×"
                                              : note.fret}
                                          </text>
                                          {note.tieToNext &&
                                            !(
                                              outgoing.get(
                                                event.id +
                                                  ":" +
                                                  note.offsetTick +
                                                  ":" +
                                                  note.stringIndex,
                                              ) !== bar.id &&
                                              systemIds.has(
                                                outgoing.get(
                                                  event.id +
                                                    ":" +
                                                    note.offsetTick +
                                                    ":" +
                                                    note.stringIndex,
                                                ) ?? "",
                                              )
                                            ) && (
                                              <TabTie
                                                from={
                                                  x(start + note.offsetTick) +
                                                  step / 2 +
                                                  3
                                                }
                                                to={Math.min(
                                                  width - 8,
                                                  x(
                                                    start +
                                                      note.offsetTick +
                                                      note.durationTicks,
                                                  ) +
                                                    step / 2 -
                                                    3,
                                                )}
                                                y={
                                                  54 +
                                                  (5 - note.stringIndex) *
                                                    rowGap
                                                }
                                                direction={
                                                  outgoing.get(
                                                    event.id +
                                                      ":" +
                                                      note.offsetTick +
                                                      ":" +
                                                      note.stringIndex,
                                                  ) === bar.id
                                                    ? "internal"
                                                    : "outgoing"
                                                }
                                                maxRise={rowGap - 13}
                                              />
                                            )}
                                          {incoming.has(
                                            event.id +
                                              ":" +
                                              note.offsetTick +
                                              ":" +
                                              note.stringIndex,
                                          ) &&
                                            incoming.get(
                                              event.id +
                                                ":" +
                                                note.offsetTick +
                                                ":" +
                                                note.stringIndex,
                                            ) !== bar.id &&
                                            !systemIds.has(
                                              incoming.get(
                                                event.id +
                                                  ":" +
                                                  note.offsetTick +
                                                  ":" +
                                                  note.stringIndex,
                                              ) ?? "",
                                            ) && (
                                              <TabTie
                                                from={26}
                                                to={
                                                  x(start + note.offsetTick) +
                                                  step / 2 -
                                                  3
                                                }
                                                y={
                                                  54 +
                                                  (5 - note.stringIndex) *
                                                    rowGap
                                                }
                                                direction="incoming"
                                                maxRise={rowGap - 13}
                                              />
                                            )}
                                        </g>
                                      ))}
                                      {editing &&
                                        points
                                          .filter(
                                            (t) =>
                                              t >= start &&
                                              t < start + event.durationTicks,
                                          )
                                          .map((t) => t - start)
                                          .map((tick) =>
                                            [5, 4, 3, 2, 1, 0].map(
                                              (stringIndex) => {
                                                const note = notes.find(
                                                  (n) =>
                                                    n.offsetTick === tick &&
                                                    n.stringIndex ===
                                                      stringIndex,
                                                );
                                                const picked =
                                                  selected &&
                                                  editing.selected.tick ===
                                                    tick &&
                                                  editing.selected
                                                    .stringIndex ===
                                                    stringIndex;
                                                const selection = {
                                                  barId: bar.id,
                                                  eventId: event.id,
                                                  tick,
                                                  stringIndex,
                                                };
                                                return (
                                                  <g
                                                    key={
                                                      tick + ":" + stringIndex
                                                    }
                                                    role="button"
                                                    tabIndex={
                                                      editing.locked
                                                        ? -1
                                                        : picked ||
                                                            (editing.selected
                                                              .tick ===
                                                              undefined &&
                                                              start === 0 &&
                                                              tick === 0 &&
                                                              stringIndex === 5)
                                                          ? 0
                                                          : -1
                                                    }
                                                    data-symbol-focus-only="true"
                                                    {...(note
                                                      ? noteHelp(
                                                          note,
                                                          event.chord?.name,
                                                        )
                                                      : {})}
                                                    data-note-cell={
                                                      bar.id +
                                                      ":" +
                                                      (start + tick) +
                                                      ":" +
                                                      stringIndex
                                                    }
                                                    aria-label={`第 ${barNumber} 小节 ${beatLabel(start + tick, arrangement.meter)} ${6 - stringIndex} 弦${note ? ` ${note.fret} 品` : " 空位"}`}
                                                    aria-disabled={
                                                      editing.locked
                                                    }
                                                    className={
                                                      "score-note-cell " +
                                                      (picked ? "picked" : "")
                                                    }
                                                    onFocus={() => {
                                                      if (
                                                        !editing.locked &&
                                                        !picked
                                                      )
                                                        editing.onSelect(
                                                          selection,
                                                        );
                                                    }}
                                                    onPointerDown={(e) =>
                                                      e.preventDefault()
                                                    }
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (!editing.locked) {
                                                        const target =
                                                          e.currentTarget;
                                                        editing.onSelect(
                                                          selection,
                                                          e.shiftKey,
                                                        );
                                                        requestAnimationFrame(
                                                          () =>
                                                            target.focus({
                                                              preventScroll: true,
                                                            }),
                                                        );
                                                      }
                                                    }}
                                                    onKeyDown={(e) => {
                                                      e.stopPropagation();
                                                      editing.onKey(
                                                        e,
                                                        selection,
                                                      );
                                                    }}
                                                  >
                                                    <rect
                                                      className="score-cell-hit"
                                                      x={x(start + tick)}
                                                      y={
                                                        54 +
                                                        (5 - stringIndex) *
                                                          rowGap -
                                                        rowGap / 2
                                                      }
                                                      width={step}
                                                      height={rowGap}
                                                    />
                                                    <rect
                                                      x={
                                                        x(start + tick) +
                                                        step / 2 -
                                                        12
                                                      }
                                                      y={
                                                        54 +
                                                        (5 - stringIndex) *
                                                          rowGap -
                                                        rowGap / 2
                                                      }
                                                      width="24"
                                                      height={rowGap}
                                                      rx="3"
                                                    />
                                                    {picked && !note && (
                                                      <text
                                                        x={
                                                          x(start + tick) +
                                                          step / 2
                                                        }
                                                        y={
                                                          59 +
                                                          (5 - stringIndex) *
                                                            rowGap
                                                        }
                                                        textAnchor="middle"
                                                      >
                                                        +
                                                      </text>
                                                    )}
                                                  </g>
                                                );
                                              },
                                            ),
                                          )}
                                    </g>
                                  );
                                })}
                                {diagrams.map((diagram) => (
                                  <g
                                    key={diagram.eventId}
                                    className="score-diagram-target"
                                    {...symbolHelp(
                                      "和弦指型 · " + diagram.chord.name,
                                      "竖线从左到右是 6 弦到 1 弦，横格是品位。黑点表示按弦，空心圈表示空弦，图上的 × 表示不弹。" +
                                        (editing ? "点击可编辑当前和弦。" : ""),
                                      5,
                                    )}
                                    role={editing ? "button" : undefined}
                                    tabIndex={
                                      editing && !editing.locked ? 0 : undefined
                                    }
                                    aria-label={
                                      (editing ? "编辑和弦 " : "和弦 ") +
                                      diagram.chord.name
                                    }
                                    aria-disabled={editing?.locked}
                                    onClick={() => {
                                      if (editing && !editing.locked)
                                        editing.onSelect({
                                          barId: bar.id,
                                          eventId: diagram.eventId,
                                        });
                                      else onSelect?.(bar.id, diagram.eventId);
                                    }}
                                    onKeyDown={(e) => {
                                      if (
                                        editing &&
                                        !editing.locked &&
                                        (e.key === "Enter" || e.key === " ")
                                      ) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        editing.onSelect({
                                          barId: bar.id,
                                          eventId: diagram.eventId,
                                        });
                                      }
                                    }}
                                  >
                                    <rect
                                      className="score-diagram-hit"
                                      x={diagram.left}
                                      y={-chordSpace + diagram.row * 104 + 6}
                                      width="84"
                                      height="96"
                                      fill="transparent"
                                    />
                                    <ScoreChordDiagram
                                      chord={diagram.chord}
                                      x={diagram.left}
                                      y={-chordSpace + diagram.row * 104 + 6}
                                    />
                                  </g>
                                ))}
                                {showVocal && (
                                  <VocalNotation
                                    bar={bar}
                                    barNumber={barNumber}
                                    meter={arrangement.meter}
                                    points={points}
                                    x={x}
                                    step={step}
                                    width={width}
                                    top={vocalTop}
                                    showLabel={localIndex === 0}
                                    positionTick={
                                      active ? position?.tickInBar : undefined
                                    }
                                    editing={
                                      editing
                                        ? {
                                            locked: editing.locked,
                                            active: editing.vocalActive,
                                            selected: editing.vocalSelected,
                                            tickAt,
                                            gridStep: 1,
                                            onSelect: editing.onVocalSelect,
                                            onKey: editing.onVocalKey,
                                          }
                                        : undefined
                                    }
                                  />
                                )}
                                <ScoreLyrics
                                  bar={bar}
                                  barNumber={barNumber}
                                  points={points}
                                  x={x}
                                  step={step}
                                  width={width}
                                  top={lyricsTop}
                                  rowHeights={rowHeights}
                                  lineCount={lines}
                                  extensions={lyricExtensions.get(bar.id)}
                                  barStartTick={(barNumber - 1) * limit}
                                  tickAt={tickAt}
                                  snapStep={1}
                                  absoluteTickAt={(clientX) => {
                                    const svg =
                                      root.current?.querySelector<SVGGElement>(
                                        '[data-preview-bar="' +
                                          CSS.escape(bar.id) +
                                          '"]',
                                      )?.ownerSVGElement;
                                    const matrix = svg?.getScreenCTM();
                                    if (!matrix) return (barNumber - 1) * limit;
                                    const point = new DOMPoint(
                                      clientX,
                                      0,
                                    ).matrixTransform(matrix.inverse());
                                    const index = Math.max(
                                      0,
                                      Math.min(
                                        system.length - 1,
                                        Math.floor(point.x / measureWidth),
                                      ),
                                    );
                                    return (
                                      (barNumbers.get(system[index].id)! - 1) *
                                        limit +
                                      systemLayouts[index].tickAt(
                                        point.x - index * measureWidth,
                                      )
                                    );
                                  }}
                                  meter={arrangement.meter}
                                  editing={
                                    editing
                                      ? {
                                          locked: editing.locked,
                                          active: editing.lyricActive,
                                          mode: editing.lyricMode,
                                          onLayout: editing.onLyricLayout,
                                          onChange: editing.onLyricChange,
                                          onBegin: editing.onLyricBegin,
                                          selected: editing.lyricSelected,
                                          onSelect: editing.onLyricSelect,
                                          onMove: editing.onLyricMove,
                                        }
                                      : undefined
                                  }
                                />
                              </g>
                            );
                          })}
                          {showVocal &&
                            vocals
                              .filter(
                                (note) =>
                                  note.tieToNext && systemIds.has(note.barId),
                              )
                              .map((note) => {
                                const target = vocals.find(
                                  (n) =>
                                    n.startTick ===
                                      note.startTick + note.durationTicks &&
                                    n.degree === note.degree &&
                                    n.octave === note.octave &&
                                    (n.accidental ?? 0) ===
                                      (note.accidental ?? 0),
                                );
                                if (!target || target.barId === note.barId)
                                  return null;
                                const sourceIndex = system.findIndex(
                                    (b) => b.id === note.barId,
                                  ),
                                  targetIndex = system.findIndex(
                                    (b) => b.id === target.barId,
                                  );
                                const from =
                                  sourceIndex * measureWidth +
                                  systemLayouts[sourceIndex].x(note.tick) +
                                  systemLayouts[sourceIndex].step / 2 +
                                  3;
                                const to =
                                  targetIndex >= 0
                                    ? targetIndex * measureWidth +
                                      systemLayouts[targetIndex].x(
                                        target.tick,
                                      ) +
                                      systemLayouts[targetIndex].step / 2 -
                                      3
                                    : systemWidth - 4;
                                const y =
                                  chordSpace + vocalTop + vocalTieY(note);
                                return (
                                  <path
                                    key={note.id}
                                    className="vocal-tie engraved-tie"
                                    data-vocal-tie={
                                      targetIndex >= 0
                                        ? "cross-bar"
                                        : "outgoing"
                                    }
                                    {...symbolHelp(
                                      "唱音延音",
                                      "同音延续，只唱一次；跨小节时持续到续音结束。",
                                      50,
                                    )}
                                    d={tieRibbonPath(
                                      from,
                                      to,
                                      y,
                                      10,
                                      targetIndex >= 0 ? "full" : "outgoing",
                                    )}
                                    fill="#171715"
                                    stroke="none"
                                  />
                                );
                              })}
                          {showVocal &&
                            vocals
                              .filter((note) => systemIds.has(note.barId))
                              .map((note) => {
                                const source = vocals.find(
                                  (n) =>
                                    n.tieToNext &&
                                    n.startTick + n.durationTicks ===
                                      note.startTick &&
                                    n.degree === note.degree &&
                                    n.octave === note.octave &&
                                    (n.accidental ?? 0) ===
                                      (note.accidental ?? 0),
                                );
                                if (!source || systemIds.has(source.barId))
                                  return null;
                                const index = system.findIndex(
                                    (b) => b.id === note.barId,
                                  ),
                                  from = index * measureWidth + 26,
                                  to =
                                    index * measureWidth +
                                    systemLayouts[index].x(note.tick) +
                                    systemLayouts[index].step / 2 -
                                    3,
                                  y = chordSpace + vocalTop + vocalTieY(note);
                                return (
                                  <path
                                    key={"incoming:" + note.id}
                                    className="vocal-tie engraved-tie"
                                    data-vocal-tie="incoming"
                                    {...symbolHelp(
                                      "唱音延音",
                                      "上一谱行同音在此继续保持。",
                                      50,
                                    )}
                                    d={tieRibbonPath(
                                      from,
                                      to,
                                      y,
                                      10,
                                      "incoming",
                                    )}
                                    fill="#171715"
                                    stroke="none"
                                  />
                                );
                              })}
                          {written
                            .filter(
                              (note) =>
                                note.tieToNext && systemIds.has(note.barId),
                            )
                            .map((note) => {
                              const target = tieCandidate(written, note);
                              if (
                                !target ||
                                target.barId === note.barId ||
                                !systemIds.has(target.barId)
                              )
                                return null;
                              const sourceIndex = system.findIndex(
                                (b) => b.id === note.barId,
                              );
                              const targetIndex = system.findIndex(
                                (b) => b.id === target.barId,
                              );
                              const sourceLayout = systemLayouts[sourceIndex],
                                targetLayout = systemLayouts[targetIndex];
                              return (
                                <TabTie
                                  key={
                                    note.eventId +
                                    ":" +
                                    note.offsetTick +
                                    ":" +
                                    note.stringIndex
                                  }
                                  from={
                                    sourceIndex * measureWidth +
                                    sourceLayout.x(note.startTick % limit) +
                                    sourceLayout.step / 2 +
                                    3
                                  }
                                  to={
                                    targetIndex * measureWidth +
                                    targetLayout.x(target.startTick % limit) +
                                    targetLayout.step / 2 -
                                    3
                                  }
                                  y={
                                    chordSpace +
                                    54 +
                                    (5 - note.stringIndex) * rowGap
                                  }
                                  direction="cross-bar"
                                  maxRise={rowGap - 13}
                                />
                              );
                            })}
                        </svg>
                      </div>
                      {systemWidth > availableWidth + 1 && (
                        <p className="tab-scroll-hint">
                          左右滑动当前谱行 · 上下浏览整份编排
                        </p>
                      )}
                    </div>
                  );
                })}
                {editing?.sectionEnd(section.id)}
              </div>
            </section>
          );
        })
      )}
      {!!arrangement.sections.length && (
        <footer className="tab-preview-legend">
          和弦图在上方 · 顶线为 1 弦 · × 随和弦 · 数字指定品位 · 单梁八分 /
          双梁十六分 · 括号 3 为三连音 · 长音横线表示继续保持
          <br />
          {arrangement.pattern === "strum"
            ? "竖排音符表示同拍拨弦；扫弦箭头按弦线方向排列，弧线连接的同音只拨一次。"
            : "按节奏依次拨弦；同起不同长的音分层标注时值，弧线连接的同音只拨一次。"}
        </footer>
      )}
      <ScoreSymbolHelp root={root} revision={arrangement} />
    </div>
  );
}

function TabTie({
  from,
  to,
  y,
  direction,
  maxRise,
}: {
  from: number;
  to: number;
  y: number;
  direction: "incoming" | "outgoing" | "cross-bar" | "internal";
  maxRise: number;
}) {
  return (
    <path
      className="tab-tie engraved-tie"
      {...symbolHelp(
        "延音线",
        "连接相邻的同弦同品音符，合并它们的时值。只拨第一个音，后一个音继续保持。延音可跨过小节线；换行时两端的弧线继续相接。",
        50,
      )}
      data-tie={direction}
      data-note-y={y}
      d={tieRibbonPath(
        from,
        to,
        y - 11,
        maxRise,
        direction === "internal" || direction === "cross-bar"
          ? "full"
          : direction,
      )}
      fill="#171715"
      stroke="none"
    />
  );
}

function layoutBar(
  bar: ArrangementBar,
  width: number,
  limit: number,
  arrangement: Arrangement,
  editing?: ScoreEditing,
) {
  const total = bar.events.reduce((n, e) => n + e.durationTicks, 0);
  const ticks = Math.max(total, limit);
  const gridPoints = barGridPoints(
    bar,
    editing?.gridStep ?? 12,
    ticks,
    arrangement.pattern,
  );
  if (
    editing?.selected.barId === bar.id &&
    editing.selected.tick !== undefined
  ) {
    let offset = 0;
    for (const e of bar.events) {
      if (e.id === editing.selected.eventId) {
        gridPoints.push(offset + editing.selected.tick);
        break;
      }
      offset += e.durationTicks;
    }
  }
  if (editing?.vocalSelected?.barId === bar.id)
    gridPoints.push(editing.vocalSelected.tick);
  if (editing?.lyricSelected?.barId === bar.id)
    gridPoints.push(editing.lyricSelected.tick);
  const points = [...new Set(gridPoints)].sort((a, b) => a - b);
  const step = (width - 42) / (points.length - 1);
  const x = (tick: number) => {
    const end = points.findIndex((p) => p > tick);
    if (end < 0) return width - 12;
    if (end === 0) return 30;
    return (
      30 +
      (end - 1 + (tick - points[end - 1]) / (points[end] - points[end - 1])) *
        step
    );
  };
  const tickAt = (px: number) => {
    const position = Math.max(
      0,
      Math.min(points.length - 1, (px - 30 - step / 2) / step),
    );
    const index = Math.min(points.length - 2, Math.floor(position));
    return Math.max(
      0,
      Math.min(
        limit - 1,
        Math.round(
          points[index] +
            (position - index) * (points[index + 1] - points[index]),
        ),
      ),
    );
  };
  const rhythm = barRhythm(bar, arrangement.meter, arrangement.pattern);
  const chordRows: number[] = [];
  const diagrams: {
    eventId: string;
    chord: NonNullable<(typeof bar.events)[number]["chord"]>;
    left: number;
    row: number;
  }[] = [];
  let harmonyTick = 0,
    previousChord = "";
  for (const e of bar.events) {
    const signature = e.chord
      ? e.chord.name + ":" + e.chord.frets.join(",")
      : "";
    if (e.chord && signature !== previousChord) {
      const left = Math.max(
        20,
        Math.min(width - 90, x(harmonyTick) + step / 2 - 12),
      );
      let row = chordRows.findIndex((end) => end + 8 <= left);
      if (row < 0) row = chordRows.length;
      chordRows[row] = left + 84;
      diagrams.push({ eventId: e.id, chord: e.chord, left, row });
    }
    previousChord = signature;
    harmonyTick += e.durationTicks;
  }

  return {
    total,
    points,
    width,
    step,
    x,
    tickAt,
    rhythm,
    diagrams,
    chordRows: chordRows.length,
  };
}
