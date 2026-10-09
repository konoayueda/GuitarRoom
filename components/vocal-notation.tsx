"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import {
  barTicks,
  durationLabel,
  type Arrangement,
  type ArrangementBar,
  type VocalNote,
} from "@/lib/arrangement";
import { tieRibbonPath } from "@/lib/tie-engraving";
import { rhythmShape, type RhythmShape } from "@/lib/notation";
import { rhythmExplanation, symbolHelp } from "@/lib/score-symbols";

export const VOCAL_LANE_HEIGHT = 104;
export const VOCAL_BASELINE = 48;
export const VOCAL_TIE_Y = 24;
/** Place the tie just above the highest octave dot, or the digit when no high dots exist. */
export function vocalTieY(note: Pick<VocalNote, "octave">) {
  return note.octave > 0 ? 14 - (note.octave - 1) * 7 : VOCAL_TIE_Y;
}

export type { VocalNote } from "@/lib/arrangement";

type VocalItem = { note: VocalNote; shape?: RhythmShape };

export type VocalEditing = {
  locked: boolean;
  active?: boolean;
  selected?: { barId: string; tick: number };
  tickAt: (px: number) => number;
  gridStep: number;
  onSelect: (barId: string, tick: number) => void;
  onKey: (
    event: KeyboardEvent<SVGGElement>,
    barId: string,
    tick: number,
  ) => void;
};

type Props = {
  bar: ArrangementBar;
  barNumber: number;
  meter: Arrangement["meter"];
  points: number[];
  x: (tick: number) => number;
  step: number;
  width: number;
  top: number;
  positionTick?: number;
  showLabel?: boolean;
  editing?: VocalEditing;
};

/** Jianpu is a separate vocal voice; its onsets do not depend on guitar attacks. */
export default function VocalNotation({
  bar,
  barNumber,
  meter,
  points,
  x,
  step,
  width,
  top,
  positionTick,
  showLabel = true,
  editing,
}: Props) {
  const limit = barTicks(meter);
  const items: VocalItem[] = [...(bar.vocalNotes ?? [])]
    .sort((a, b) => a.tick - b.tick)
    .map((note) => ({ note, shape: rhythmShape(note.durationTicks) }));
  const center = (tick: number) => x(tick) + step / 2;
  const underlineY = (level: number) => 70 + level * 6;
  const selectedTick =
    editing?.selected?.barId === bar.id ? editing.selected.tick : undefined;
  const cursorWidth = Math.min(30, Math.max(18, step));
  const groups = beamGroups(items, meter);
  const tuplets = tupletGroups(items);

  function select(event: MouseEvent<SVGGElement>, tick: number) {
    event.stopPropagation();
    if (!editing || editing.locked) return;
    editing.onSelect(bar.id, tick);
    event.currentTarget.focus({ preventScroll: true });
  }

  function selectPosition(event: MouseEvent<SVGGElement>) {
    event.stopPropagation();
    if (!editing || editing.locked) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const quantum = Math.max(1, editing.gridStep);
    const tick = Math.max(
      0,
      Math.min(
        limit - 1,
        Math.round(editing.tickAt(local.x) / quantum) * quantum,
      ),
    );
    editing.onSelect(bar.id, tick);
    const target = event.currentTarget;
    // React must first update the selected onset used by this target's focus handler.
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function key(event: KeyboardEvent<SVGGElement>, tick: number) {
    event.stopPropagation();
    if (!editing || editing.locked) return;
    editing.onKey(event, bar.id, tick);
  }

  return (
    <g
      className="vocal-notation"
      data-vocal-lane={bar.id}
      transform={`translate(0 ${top})`}
      aria-label={`第 ${barNumber} 小节唱音简谱`}
      fill="#171715"
    >
      {editing && editing.active !== false && (
        <g
          className="vocal-lane-hit"
          data-vocal-cell={`${bar.id}:${selectedTick ?? 0}`}
          role="button"
          tabIndex={editing.locked ? -1 : 0}
          aria-label={`第 ${barNumber} 小节唱音；点击任意拍位，输入 0 至 7`}
          aria-disabled={editing.locked}
          onFocus={() => {
            if (!editing.locked) editing.onSelect(bar.id, selectedTick ?? 0);
          }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={selectPosition}
          onKeyDown={(event) => key(event, selectedTick ?? 0)}
        >
          <rect
            x="26"
            y="0"
            width={Math.max(0, width - 34)}
            height={VOCAL_LANE_HEIGHT}
            fill="transparent"
          />
          {points
            .filter((tick) => tick < limit)
            .map((tick) => (
              <circle
                key={tick}
                cx={center(tick)}
                cy="88"
                r="1.2"
                fill="currentColor"
                opacity="0.12"
                pointerEvents="none"
              />
            ))}
        </g>
      )}
      {showLabel && (
        <text
          className="vocal-lane-label"
          x="8"
          y={VOCAL_BASELINE - 12}
          fontSize="10"
          fill="#8e8275"
          pointerEvents="none"
        >
          唱音
        </text>
      )}
      {selectedTick !== undefined && editing?.active !== false && (
        <rect
          className="vocal-cursor"
          data-vocal-cursor={selectedTick}
          x={center(selectedTick) - cursorWidth / 2}
          y="23"
          width={cursorWidth}
          height="60"
          rx="4"
          fill="#b4684a"
          fillOpacity="0.07"
          stroke="#b4684a"
          strokeWidth="1"
          pointerEvents="none"
        />
      )}
      {items.map(({ note, shape }, index) => {
        const px = center(note.tick);
        const next = items[index + 1]?.note;
        const tied =
          note.tieToNext &&
          next &&
          next.tick === note.tick + note.durationTicks &&
          samePitch(note, next);
        const sounding =
          positionTick !== undefined &&
          positionTick >= note.tick &&
          positionTick < note.tick + note.durationTicks;
        const help = vocalHelp(note);
        const holdOffsets =
          shape && !shape.triplet && shape.base >= 48
            ? Array.from(
                { length: shape.base / 24 - 1 },
                (_, j) => (j + 1) * 24,
              )
            : [];
        return (
          <g
            key={note.id}
            data-vocal-note={note.id}
            data-vocal-degree={note.degree}
            data-vocal-tick={note.tick}
            data-vocal-duration={note.durationTicks}
            className={sounding ? "vocal-note is-sounding" : "vocal-note"}
          >
            <g
              className="vocal-note-target"
              {...help}
              role={editing ? "button" : undefined}
              tabIndex={editing ? (editing.locked ? -1 : 0) : undefined}
              aria-label={`第 ${barNumber} 小节，${help["data-score-symbol"]}，${durationLabel(note.durationTicks)}`}
              aria-disabled={editing?.locked || undefined}
              aria-pressed={editing ? selectedTick === note.tick : undefined}
              onFocus={
                editing
                  ? () => {
                      if (!editing.locked) editing.onSelect(bar.id, note.tick);
                    }
                  : undefined
              }
              onPointerDown={
                editing ? (event) => event.preventDefault() : undefined
              }
              onClick={
                editing ? (event) => select(event, note.tick) : undefined
              }
              onKeyDown={editing ? (event) => key(event, note.tick) : undefined}
            >
              <rect
                className="vocal-note-hit"
                x={px - 12}
                y="22"
                width="24"
                height="42"
                fill="transparent"
              />
              <text
                className="vocal-digit"
                x={px}
                y={VOCAL_BASELINE}
                textAnchor="middle"
                fontFamily='"Times New Roman", serif'
                fontSize="32"
                fontWeight="700"
              >
                {note.degree}
              </text>
              {note.degree !== 0 &&
                note.accidental !== undefined &&
                note.accidental !== 0 && (
                  <text
                    {...symbolHelp(
                      note.accidental === 1 ? "升音" : "降音",
                      "在当前调号下，将这个唱音" +
                        (note.accidental === 1 ? "升高" : "降低") +
                        "半音。",
                      40,
                    )}
                    x={px - 17}
                    y={VOCAL_BASELINE - 2}
                    textAnchor="middle"
                    fontSize="19"
                  >
                    {note.accidental === 1 ? "♯" : "♭"}
                  </text>
                )}
              {note.degree !== 0 &&
                Array.from({ length: Math.abs(note.octave) }, (_, dot) => (
                  <circle
                    key={dot}
                    {...symbolHelp(
                      note.octave > 0 ? "高八度点" : "低八度点",
                      `唱音比中音${note.octave > 0 ? "高" : "低"} ${Math.abs(note.octave)} 个八度；点的数量表示八度距离。`,
                      45,
                    )}
                    cx={px}
                    cy={note.octave > 0 ? 20 - dot * 7 : 57 + dot * 6}
                    r="2.1"
                  />
                ))}
              {shape &&
                Array.from({ length: shape.dots }, (_, dot) => (
                  <circle
                    key={dot}
                    {...symbolHelp(
                      shape.dots === 2 ? "复附点唱音" : "附点唱音",
                      shape.dots === 2
                        ? "唱音时长为原时值的 1.75 倍。"
                        : "唱音时长为原时值的 1.5 倍。",
                      45,
                    )}
                    cx={px + 15 + dot * 6}
                    cy={VOCAL_BASELINE - 11}
                    r="2.1"
                  />
                ))}
            </g>
            {holdOffsets.map((offset) => (
              <line
                key={offset}
                className="vocal-hold"
                {...symbolHelp(
                  "唱音增时线",
                  "横线延长前一个唱音一拍，保持同一个音；二分音符一条，全音符三条。",
                  30,
                )}
                data-vocal-hold={note.tick + offset}
                x1={center(note.tick + offset) - 7}
                x2={center(note.tick + offset) + 7}
                y1={VOCAL_BASELINE - 11}
                y2={VOCAL_BASELINE - 11}
                stroke="#171715"
                strokeWidth="1.7"
              />
            ))}
            {!shape && (
              <text
                className="vocal-custom-duration"
                {...symbolHelp(
                  "自定义唱音时值",
                  rhythmExplanation(note.durationTicks),
                  20,
                )}
                x={px}
                y="86"
                fontSize="9"
                textAnchor="middle"
              >
                {durationLabel(note.durationTicks)}
              </text>
            )}
            {tied && (
              <path
                className="vocal-tie engraved-tie"
                {...symbolHelp(
                  "唱音延音线",
                  "连接相同音高，保持第一个唱音，后音继续延长；歌词通常只在第一个音下填写。",
                  50,
                )}
                data-vocal-tie="internal"
                d={tieRibbonPath(
                  px + 3,
                  center(next.tick) - 3,
                  vocalTieY(note),
                )}
                fill="#171715"
                stroke="none"
              />
            )}
          </g>
        );
      })}
      {groups.map((group, gi) => (
        <g key={gi} data-vocal-beam-group={gi}>
          {group.flatMap((item, index) =>
            Array.from({ length: item.shape!.beams }, (_, level) => {
              const next = group[index + 1];
              const previous = group[index - 1];
              const px = center(item.note.tick);
              const connectedNext = next && next.shape!.beams > level;
              const connectedPrevious =
                previous && previous.shape!.beams > level;
              if (!connectedNext && connectedPrevious) return null;
              const from = connectedPrevious ? px : px - 10;
              const to = connectedNext
                ? center(next.note.tick) +
                  (group[index + 2]?.shape!.beams > level ? 0 : 10)
                : px + 10;
              return (
                <line
                  key={index + ":" + level}
                  className="vocal-underline"
                  {...symbolHelp(
                    "唱音减时线",
                    "数字下方一条横线表示八分音符，两条表示十六分，三条表示三十二分；连线将同一拍内的节奏分组。",
                    35,
                  )}
                  data-vocal-underline={level + 1}
                  x1={from}
                  x2={to}
                  y1={underlineY(level)}
                  y2={underlineY(level)}
                  stroke="#171715"
                  strokeWidth="1.6"
                />
              );
            }),
          )}
        </g>
      ))}
      {tuplets.map((group, index) => {
        const from = center(group.items[0].note.tick) - 10;
        const to = center(group.items.at(-1)!.note.tick) + 10;
        const middle = (from + to) / 2;
        return (
          <g
            key={index}
            {...symbolHelp(
              group.complete ? "唱音三连音" : "唱音三连音时值",
              group.complete
                ? "三个等长唱音占通常两个的时间，组内可以有休止符。"
                : "3:2 表示这个唱音使用三连音时值；还未组成完整的三个音。",
              40,
            )}
            data-vocal-tuplet={group.complete ? "complete" : "partial"}
          >
            {group.complete && (
              <path
                d={`M${from} 90v4H${middle - 6}M${middle + 6} 94H${to}v-4`}
                fill="none"
                stroke="#171715"
                strokeWidth="1"
              />
            )}
            <text x={middle} y="98" textAnchor="middle" fontSize="10">
              {group.complete ? "3" : "3:2"}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function samePitch(a: VocalNote, b: VocalNote) {
  return (
    a.degree !== 0 &&
    a.degree === b.degree &&
    a.octave === b.octave &&
    (a.accidental ?? 0) === (b.accidental ?? 0)
  );
}

function vocalHelp(note: VocalNote) {
  const pitch =
    note.degree === 0
      ? "0 唱音休止"
      : `${note.degree} ${["", "do", "re", "mi", "fa", "sol", "la", "si"][note.degree]}`;
  const octave = note.octave
    ? `，${note.octave > 0 ? "高" : "低"} ${Math.abs(note.octave)} 个八度`
    : "";
  return symbolHelp(
    pitch,
    (note.degree === 0
      ? "这里暂不演唱。"
      : `演唱当前调号的第 ${note.degree} 级${octave}。`) +
      rhythmExplanation(note.durationTicks),
    30,
  );
}

function beamGroups(items: VocalItem[], meter: Arrangement["meter"]) {
  const groups: VocalItem[][] = [];
  let current: VocalItem[] = [];
  const pulse = meter === "6/8" ? 36 : 24;
  const tuplets = new Map<VocalItem, object>();
  for (const group of tupletGroups(items)) {
    group.items.forEach((item) => tuplets.set(item, group));
  }
  for (const item of items) {
    const previous = current.at(-1);
    const connected =
      previous &&
      item.shape &&
      item.shape.beams > 0 &&
      previous.note.tick + previous.note.durationTicks === item.note.tick &&
      previous.shape?.triplet === item.shape.triplet &&
      (item.shape.triplet
        ? tuplets.get(previous) === tuplets.get(item)
        : Math.floor(previous.note.tick / pulse) ===
          Math.floor(item.note.tick / pulse));
    if (!connected && current.length) {
      groups.push(current);
      current = [];
    }
    if (item.shape && item.shape.beams > 0) current.push(item);
  }
  if (current.length) groups.push(current);
  return groups;
}

function tupletGroups(items: VocalItem[]) {
  const groups: { items: VocalItem[]; complete: boolean }[] = [];
  const used = new Set<string>();
  for (const item of items) {
    if (!item.shape?.triplet || used.has(item.note.id)) continue;
    const three = [
      item,
      ...[1, 2].flatMap((offset) =>
        items.filter(
          (candidate) =>
            candidate.shape?.triplet &&
            !used.has(candidate.note.id) &&
            candidate.note.durationTicks === item.note.durationTicks &&
            candidate.note.tick ===
              item.note.tick + offset * item.note.durationTicks,
        ),
      ),
    ];
    const complete = three.length === 3;
    const group = complete ? three : [item];
    group.forEach(({ note }) => used.add(note.id));
    groups.push({ items: group, complete });
  }
  return groups;
}
