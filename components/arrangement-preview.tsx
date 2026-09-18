"use client";
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from "react";
import { Music2 } from "lucide-react";
import {
  barTicks,
  barGridPoints,
  beatLabel,
  durationLabel,
  rhythmSymbol,
  eventAttacks,
  writtenNotes,
  tieCandidate,
  type Arrangement,
} from "@/lib/arrangement";
import { barRhythm } from "@/lib/notation";
import RhythmNotation from "./rhythm-notation";
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
  onSelect: (selection: ScoreSelection) => void;
  onKey: (event: KeyboardEvent<SVGGElement>, selection: ScoreSelection) => void;
  sectionHeading: (sectionId: string, index: number) => ReactNode;
  sectionEnd: (sectionId: string) => ReactNode;
  barTools: (barId: string) => ReactNode;
  inspector: (barId: string) => ReactNode;
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
  const soundingBar = position?.event.bar.bar.id;
  useEffect(() => {
    if (soundingBar && root.current?.getClientRects().length)
      root.current
        .querySelector(`[data-preview-bar="${CSS.escape(soundingBar)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [soundingBar]);
  const limit = barTicks(arrangement.meter);
  const written = writtenNotes(arrangement);
  const incoming = new Map<string, string>();
  for (const n of written) {
    if (n.tieToNext) {
      const target = tieCandidate(written, n);
      if (target)
        incoming.set(
          target.eventId + ":" + target.offsetTick + ":" + target.stringIndex,
          n.barId,
        );
    }
  }
  const sectionWidths = new Map(
    arrangement.sections.map((s) => [
      s.id,
      Math.max(
        336,
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
  const rowGap = editing ? 24 : 20,
    staffBottom = 54 + 5 * rowGap;
  let number = 0;
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
        </div>
        <p>
          {editing
            ? "点和弦选按法 · X 按和弦拨弦 · 数字指定品位 · Delete 清除"
            : "× 按和弦拨弦 · 数字指定品位（相对变调夹）"}
        </p>
      </header>
      {!arrangement.sections.length ? (
        <div className="tab-preview-empty">
          <Music2 size={28} />
          <h3>让想练的片段，落在谱上</h3>
          <p>添加小节后，和弦与节奏会实时显示在这里。</p>
        </div>
      ) : (
        arrangement.sections.map((section, si) => (
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
            <div className="tab-preview-bars">
              {section.bars.map((bar) => {
                const barNumber = ++number;
                const total = bar.events.reduce(
                  (n, e) => n + e.durationTicks,
                  0,
                );
                const ticks = Math.max(total, limit);
                const points = barGridPoints(
                  bar,
                  editing?.gridStep ?? 12,
                  ticks,
                  arrangement.pattern,
                );
                const width = sectionWidths.get(section.id)!;
                const step = (width - 42) / (points.length - 1);
                const x = (tick: number) => {
                  const end = points.findIndex((p) => p > tick);
                  if (end < 0) return width - 12;
                  if (end === 0) return 30;
                  return (
                    30 +
                    (end -
                      1 +
                      (tick - points[end - 1]) /
                        (points[end] - points[end - 1])) *
                      step
                  );
                };
                const rhythm = barRhythm(
                  bar,
                  arrangement.meter,
                  arrangement.pattern,
                );
                const active = soundingBar === bar.id;
                let offset = 0;
                return (
                  <article
                    className={
                      "tab-preview-bar " +
                      (active ? "sounding " : "") +
                      (editing?.selected.barId === bar.id ? "selected " : "") +
                      (total !== limit ? "incomplete" : "")
                    }
                    key={bar.id}
                    data-preview-bar={bar.id}
                  >
                    <header>
                      <span>{String(barNumber).padStart(2, "0")}</span>
                      <span>
                        {total !== limit
                          ? total < limit
                            ? `待补 ${(limit - total) / 24} 拍`
                            : `超出 ${(total - limit) / 24} 拍`
                          : ""}
                      </span>
                      {editing?.barTools(bar.id)}
                    </header>
                    <div className="tab-preview-staff-scroll">
                      <svg
                        viewBox={`0 0 ${width} ${staffBottom + rhythm.lanes * 60 + 70}`}
                        style={{
                          minWidth: points.length > 13 ? width : undefined,
                        }}
                        role={editing || onSelect ? "group" : "img"}
                        aria-label={`第 ${barNumber} 小节，${bar.events.map((e) => `${eventAttacks(e, arrangement.pattern).length ? (e.chord?.name ?? "单音") : "休止"}，${durationLabel(e.durationTicks)}`).join("；")}`}
                      >
                        <title>
                          第 {barNumber} 小节 · {section.label}
                        </title>
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
                        {[0, 1, 2, 3, 4, 5].map((row) => (
                          <g key={row}>
                            <text
                              x="7"
                              y={58 + row * rowGap}
                              className="tab-string-label"
                            >
                              {row + 1}
                            </text>
                            <line
                              x1="26"
                              y1={54 + row * rowGap}
                              x2={width - 7}
                              y2={54 + row * rowGap}
                              className="tab-string"
                            />
                          </g>
                        ))}
                        <line
                          x1="26"
                          y1="54"
                          x2="26"
                          y2={staffBottom}
                          className="tab-barline"
                        />
                        <line
                          x1={width - 7}
                          y1="54"
                          x2={width - 7}
                          y2={staffBottom}
                          className="tab-barline"
                        />
                        {points.slice(0, -1).map((tick) => (
                          <text
                            key={tick}
                            className="tab-beat"
                            textAnchor="middle"
                            x={x(tick) + step / 2}
                            y={staffBottom + rhythm.lanes * 60 + 54}
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
                            active && position?.event.event.id === event.id;
                          const notes = eventAttacks(
                            event,
                            arrangement.pattern,
                            capo,
                          );
                          const name = notes.length
                            ? (event.chord?.name ?? "单音")
                            : "休止";
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
                              <title>
                                {name} · {durationLabel(event.durationTicks)}
                              </title>
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
                                      (e.key === "Enter" || e.key === " ")
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
                              <text
                                className="tab-chord"
                                x={x(start) + 3}
                                y="17"
                              >
                                {name.length >
                                Math.max(3, Math.floor(eventWidth / 8))
                                  ? name.slice(
                                      0,
                                      Math.max(
                                        2,
                                        Math.floor(eventWidth / 8) - 1,
                                      ),
                                    ) + "…"
                                  : name}
                              </text>
                              <path
                                className="tab-duration-line"
                                d={`M${x(start) + 4} 25v4h${eventWidth - 8}v-4`}
                              />
                              <text
                                className="tab-duration"
                                x={x(start) + eventWidth / 2}
                                y="39"
                                textAnchor="middle"
                              >
                                {rhythmSymbol(event.durationTicks)}
                              </text>
                              {!notes.length && (
                                <text
                                  className="tab-rest"
                                  x={x(start) + step / 2}
                                  y={54 + 2.5 * rowGap + 4}
                                  textAnchor="middle"
                                >
                                  休
                                </text>
                              )}
                              {(event.stroke === "down" ||
                                event.stroke === "up") &&
                                [
                                  ...new Set(notes.map((n) => n.offsetTick)),
                                ].map((tick) => {
                                  const strings = notes
                                    .filter((n) => n.offsetTick === tick)
                                    .map((n) => n.stringIndex);
                                  if (strings.length < 2) return null;
                                  const low =
                                      54 + (5 - Math.min(...strings)) * rowGap,
                                    high =
                                      54 + (5 - Math.max(...strings)) * rowGap;
                                  const from =
                                      event.stroke === "down" ? low : high,
                                    to = event.stroke === "down" ? high : low,
                                    px = x(start + tick) + step / 2 - 17,
                                    tail = to - Math.sign(to - from) * 6;
                                  return (
                                    <path
                                      key={tick}
                                      className="tab-strum-arrow"
                                      data-stroke={event.stroke}
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
                                    >
                                      <title>
                                        {event.stroke === "down"
                                          ? "向下扫弦：6 弦到 1 弦"
                                          : "向上扫弦：1 弦到 6 弦"}
                                      </title>
                                    </path>
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
                                  data-note-duration={note.durationTicks}
                                >
                                  <rect
                                    x={
                                      x(start + note.offsetTick) + step / 2 - 10
                                    }
                                    y={54 + (5 - note.stringIndex) * rowGap - 9}
                                    width="20"
                                    height="17"
                                    rx="2"
                                  />
                                  <text
                                    x={x(start + note.offsetTick) + step / 2}
                                    y={54 + (5 - note.stringIndex) * rowGap + 5}
                                    textAnchor="middle"
                                  >
                                    {note.marker === "cross" ? "×" : note.fret}
                                  </text>
                                  <title>
                                    {note.marker === "cross"
                                      ? note.fret >= 0
                                        ? "按和弦拨弦 · " + note.fret + " 品 · "
                                        : "请设置和弦按法 · "
                                      : ""}
                                    {durationLabel(note.durationTicks)}
                                    {note.tieToNext ? " · 延音连接" : ""}
                                  </title>
                                  <line
                                    className="tab-note-length"
                                    x1={
                                      x(start + note.offsetTick) + step / 2 + 5
                                    }
                                    x2={Math.min(
                                      width - 8,
                                      x(
                                        Math.min(
                                          ticks,
                                          start +
                                            note.offsetTick +
                                            note.durationTicks,
                                        ),
                                      ) +
                                        step / 2 -
                                        5,
                                    )}
                                    y1={
                                      54 + (5 - note.stringIndex) * rowGap + 8
                                    }
                                    y2={
                                      54 + (5 - note.stringIndex) * rowGap + 8
                                    }
                                  />
                                  {note.tieToNext && (
                                    <path
                                      className="tab-tie"
                                      data-tie="outgoing"
                                      d={
                                        "M" +
                                        (x(start + note.offsetTick) +
                                          step / 2 +
                                          6) +
                                        "," +
                                        (54 +
                                          (5 - note.stringIndex) * rowGap +
                                          8) +
                                        " Q" +
                                        ((x(start + note.offsetTick) +
                                          Math.min(
                                            width - 8,
                                            x(
                                              start +
                                                note.offsetTick +
                                                note.durationTicks,
                                            ),
                                          )) /
                                          2 +
                                          step / 2) +
                                        "," +
                                        (54 +
                                          (5 - note.stringIndex) * rowGap +
                                          22) +
                                        " " +
                                        Math.min(
                                          width - 8,
                                          x(
                                            start +
                                              note.offsetTick +
                                              note.durationTicks,
                                          ) +
                                            step / 2 -
                                            6,
                                        ) +
                                        "," +
                                        (54 +
                                          (5 - note.stringIndex) * rowGap +
                                          8)
                                      }
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
                                    ) !== bar.id && (
                                      <path
                                        className="tab-tie"
                                        data-tie="incoming"
                                        d={
                                          "M26," +
                                          (54 +
                                            (5 - note.stringIndex) * rowGap +
                                            10) +
                                          " Q34," +
                                          (54 +
                                            (5 - note.stringIndex) * rowGap +
                                            19) +
                                          " " +
                                          (x(start + note.offsetTick) +
                                            step / 2 -
                                            7) +
                                          "," +
                                          (54 +
                                            (5 - note.stringIndex) * rowGap +
                                            8)
                                        }
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
                                    [5, 4, 3, 2, 1, 0].map((stringIndex) => {
                                      const note = notes.find(
                                        (n) =>
                                          n.offsetTick === tick &&
                                          n.stringIndex === stringIndex,
                                      );
                                      const picked =
                                        selected &&
                                        editing.selected.tick === tick &&
                                        editing.selected.stringIndex ===
                                          stringIndex;
                                      const selection = {
                                        barId: bar.id,
                                        eventId: event.id,
                                        tick,
                                        stringIndex,
                                      };
                                      return (
                                        <g
                                          key={tick + ":" + stringIndex}
                                          role="button"
                                          tabIndex={
                                            editing.locked
                                              ? -1
                                              : picked ||
                                                  (editing.selected.tick ===
                                                    undefined &&
                                                    start === 0 &&
                                                    tick === 0 &&
                                                    stringIndex === 5)
                                                ? 0
                                                : -1
                                          }
                                          data-note-cell={
                                            bar.id +
                                            ":" +
                                            (start + tick) +
                                            ":" +
                                            stringIndex
                                          }
                                          aria-label={`第 ${barNumber} 小节 ${beatLabel(start + tick)} ${6 - stringIndex} 弦${note ? ` ${note.fret} 品` : " 空位"}`}
                                          aria-disabled={editing.locked}
                                          className={
                                            "score-note-cell " +
                                            (picked ? "picked" : "")
                                          }
                                          onFocus={() => {
                                            if (!editing.locked && !picked)
                                              editing.onSelect(selection);
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!editing.locked) {
                                              editing.onSelect(selection);
                                              e.currentTarget.focus();
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (!editing.locked) {
                                              e.stopPropagation();
                                              editing.onKey(e, selection);
                                            }
                                          }}
                                        >
                                          <rect
                                            className="score-cell-hit"
                                            x={x(start + tick)}
                                            y={
                                              54 +
                                              (5 - stringIndex) * rowGap -
                                              rowGap / 2
                                            }
                                            width={step}
                                            height={rowGap}
                                          />
                                          <rect
                                            x={x(start + tick) + step / 2 - 12}
                                            y={
                                              54 +
                                              (5 - stringIndex) * rowGap -
                                              rowGap / 2
                                            }
                                            width="24"
                                            height={rowGap}
                                            rx="3"
                                          />
                                          {picked && !note && (
                                            <text
                                              x={x(start + tick) + step / 2}
                                              y={
                                                59 + (5 - stringIndex) * rowGap
                                              }
                                              textAnchor="middle"
                                            >
                                              +
                                            </text>
                                          )}
                                        </g>
                                      );
                                    }),
                                  )}
                            </g>
                          );
                        })}
                        <RhythmNotation
                          rhythm={rhythm}
                          x={(tick) => x(tick) + step / 2}
                          top={staffBottom + 36}
                        />
                      </svg>
                    </div>
                    {points.length > 13 && (
                      <p className="tab-scroll-hint">左右滑动可查看完整小节</p>
                    )}
                    {editing?.inspector(bar.id)}
                  </article>
                );
              })}
              {editing?.sectionEnd(section.id)}
            </div>
          </section>
        ))
      )}
      {!!arrangement.sections.length && (
        <footer className="tab-preview-legend">
          顶线为 1 弦 · × 随和弦 · 数字指定品位 · 单梁八分 / 双梁十六分 · 括号 3
          为三连音
          <br />
          {arrangement.pattern === "strum"
            ? "竖排音符表示同拍拨弦；扫弦箭头按弦线方向排列，弧线连接的同音只拨一次。"
            : "按节奏依次拨弦；同起不同长的音分层标注时值，弧线连接的同音只拨一次。"}
        </footer>
      )}
    </div>
  );
}
