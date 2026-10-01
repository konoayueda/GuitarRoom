"use client";
import {
  Plus,
  Trash2,
  Undo2,
  Redo2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Choice } from "./room-controls";
import { RHYTHMS, durationLabel, type Arrangement } from "@/lib/arrangement";
import type { ArrangementVocalNote, ArrangementLyric } from "@/lib/arrangement";

export default function VocalTools({
  lane,
  locked,
  bars,
  barId,
  tick,
  meter,
  lineCount,
  verse,
  onVerse,
  onAddLine,
  onDeleteLine,
  onPosition,
  onNudge,
  lyricMode,
  onLyricMode,
  lyricAnchor,
  onLyricAnchor,
  lyric,
  lyricBound,
  onLyricLayout,
  lyricEndOptions,
  onLyricExtend,
  vocal,
  vocalDuration,
  onDuration,
  onPitch,
  onFocus,
  onDelete,
  onTie,
  vocalKey,
  onKey,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  lane: "vocal" | "lyrics";
  locked: boolean;
  bars: { id: string; number: number }[];
  barId: string;
  tick: number;
  meter: Arrangement["meter"];
  lineCount: number;
  verse: number;
  onVerse: (v: number) => void;
  onAddLine: () => void;
  onDeleteLine: () => void;
  onPosition: (barId: string, tick: number) => void;
  onNudge: (delta: number) => void;
  lyricMode: "time" | "layout";
  onLyricMode: (mode: "time" | "layout") => void;
  lyricAnchor: "auto" | "free";
  onLyricAnchor: (mode: "auto" | "free") => void;
  lyric?: ArrangementLyric;
  lyricBound: boolean;
  onLyricLayout: (x: number, y: number) => void;
  lyricEndOptions: { value: string; label: string }[];
  onLyricExtend: (id?: string) => void;
  vocal?: ArrangementVocalNote;
  vocalDuration: number;
  onDuration: (n: number) => void;
  onPitch: (
    patch: Partial<
      Pick<ArrangementVocalNote, "degree" | "octave" | "accidental">
    >,
  ) => void;
  onFocus: () => void;
  onDelete: () => void;
  onTie: () => void;
  vocalKey: string;
  onKey: (v: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const unit = meter === "6/8" ? 12 : 24,
    beat = 1 + tick / unit,
    max = meter === "4/4" ? 5 : meter === "6/8" ? 7 : 4;
  const closeMenu =
    lane === "vocal"
      ? (event: Event) => {
          event.preventDefault();
          onFocus();
        }
      : undefined;
  const layout = lane === "lyrics" && lyricMode === "layout";
  function offsetInput(axis: "X" | "Y") {
    const current =
      axis === "X" ? (lyric?.offsetX ?? 0) : (lyric?.offsetY ?? 0);
    const limit = axis === "X" ? 96 : 24;
    return (
      <label>
        {axis === "X" ? "水平偏移" : "垂直偏移"}
        <input
          aria-label={axis === "X" ? "歌词水平偏移" : "歌词垂直偏移"}
          type="number"
          min={-limit}
          max={limit}
          step="1"
          disabled={locked || !lyric}
          key={barId + ":" + tick + ":" + verse + ":" + axis + ":" + current}
          defaultValue={current}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (
              e.target.value &&
              Number.isFinite(n) &&
              n >= -limit &&
              n <= limit
            )
              onLyricLayout(
                axis === "X" ? n : (lyric?.offsetX ?? 0),
                axis === "Y" ? n : (lyric?.offsetY ?? 0),
              );
            else e.target.value = String(current);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </label>
    );
  }
  return (
    <div
      className="vocal-tools"
      role="toolbar"
      aria-label={lane === "vocal" ? "唱音编辑工具栏" : "歌词编辑工具栏"}
    >
      <div className="vocal-tool-row">
        {lane === "lyrics" && (
          <div
            className="lyric-mode-switch"
            role="group"
            aria-label="歌词编辑方式"
          >
            <button
              className="button secondary-button"
              aria-label="调整起唱"
              aria-pressed={lyricMode === "time"}
              disabled={locked}
              onClick={() => onLyricMode("time")}
            >
              调整起唱
            </button>
            <button
              className="button secondary-button"
              aria-label="调整排版"
              aria-pressed={lyricMode === "layout"}
              disabled={locked}
              onClick={() => onLyricMode("layout")}
            >
              调整排版
            </button>
          </div>
        )}
        {layout ? (
          <>
            {offsetInput("X")}
            {offsetInput("Y")}
            <button
              className="button secondary-button"
              aria-label="重置歌词排版"
              disabled={locked || !lyric}
              onClick={() => onLyricLayout(0, 0)}
            >
              重置排版
            </button>
          </>
        ) : (
          <>
            <label>
              小节
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label={lane === "vocal" ? "唱音所在小节" : "歌词所在小节"}
                value={barId}
                options={bars.map((b) => ({
                  value: b.id,
                  label: "第 " + b.number + " 小节",
                }))}
                onChange={(v) => onPosition(v, tick)}
              />
            </label>
            <label>
              起唱拍位
              <input
                aria-label={lane === "vocal" ? "唱音起唱拍位" : "歌词起唱拍位"}
                type="number"
                min="1"
                max={max - 1 / unit}
                step={1 / unit}
                disabled={locked || !barId}
                key={barId + ":" + tick + ":" + lane + ":" + verse}
                defaultValue={Number(beat.toFixed(4))}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value && Number.isFinite(n) && n >= 1 && n < max)
                    onPosition(barId, Math.round((n - 1) * unit));
                  else e.target.value = String(Number(beat.toFixed(4)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            </label>
            <button
              className="button secondary-button"
              disabled={locked || !barId}
              aria-label="提前半拍"
              onClick={() => onNudge(-unit / 2)}
            >
              <ChevronLeft size={14} />
              提前半拍
            </button>
            <button
              className="button secondary-button"
              disabled={locked || !barId}
              aria-label="延后半拍"
              onClick={() => onNudge(unit / 2)}
            >
              延后半拍
              <ChevronRight size={14} />
            </button>
          </>
        )}
        <div className="vocal-tool-history">
          <button
            className="icon-button"
            disabled={locked || !canUndo}
            aria-label="撤销编排修改"
            onClick={onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            disabled={locked || !canRedo}
            aria-label="重做编排修改"
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>
      <div className="vocal-tool-row">
        {lane === "vocal" ? (
          <>
            <label>
              调号
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="唱音调号"
                value={vocalKey}
                onChange={onKey}
                options={[
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
                ].map((v) => ({ value: v, label: "1 = " + v }))}
              />
            </label>
            <label>
              音级
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="唱音音级"
                value={String(vocal?.degree ?? 1)}
                onChange={(v) => onPitch({ degree: Number(v) })}
                options={Array.from({ length: 8 }, (_, i) => ({
                  value: String(i),
                  label:
                    i === 0
                      ? "0 · 休止"
                      : i +
                        " · " +
                        ["", "do", "re", "mi", "fa", "sol", "la", "si"][i],
                }))}
              />
            </label>
            <label>
              八度
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="唱音八度"
                value={String(vocal?.octave ?? 0)}
                onChange={(v) => onPitch({ octave: Number(v) })}
                options={[-2, -1, 0, 1, 2].map((v) => ({
                  value: String(v),
                  label:
                    v === 0
                      ? "中音"
                      : v > 0
                        ? "高 " + v + " 个八度"
                        : "低 " + -v + " 个八度",
                }))}
              />
            </label>
            <label>
              升降
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="唱音升降号"
                value={String(vocal?.accidental ?? 0)}
                onChange={(v) =>
                  onPitch({ accidental: Number(v) as -1 | 0 | 1 })
                }
                options={[
                  { value: "0", label: "原音" },
                  { value: "1", label: "♯ 升半音" },
                  { value: "-1", label: "♭ 降半音" },
                ]}
              />
            </label>
            <label>
              时值
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="唱音时值"
                value={String(vocalDuration)}
                onChange={(v) => onDuration(Number(v))}
                options={[
                  ...RHYTHMS.map((r) => ({
                    value: String(r.ticks),
                    label: r.label,
                  })),
                  ...(!RHYTHMS.some((r) => r.ticks === vocalDuration)
                    ? [
                        {
                          value: String(vocalDuration),
                          label: durationLabel(vocalDuration),
                        },
                      ]
                    : []),
                ]}
              />
            </label>
            <button
              className="button primary"
              disabled={locked || !barId}
              aria-label="写入唱音"
              onClick={() => onPitch({})}
            >
              <Plus size={15} />
              写入唱音
            </button>
            <button
              className="button secondary-button"
              disabled={locked || !vocal || vocal.degree === 0}
              aria-label="唱音延音连接"
              aria-pressed={!!vocal?.tieToNext}
              onClick={onTie}
            >
              ⌒ 延音
            </button>
            <button
              className="icon-button"
              disabled={locked || !vocal}
              aria-label="删除唱音"
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </button>
          </>
        ) : (
          <>
            <label>
              定位方式
              <Choice
                disabled={locked}
                label="歌词定位方式"
                value={lyricAnchor}
                onChange={(v) => onLyricAnchor(v as "auto" | "free")}
                options={[
                  { value: "auto", label: "跟随唱音" },
                  { value: "free", label: "独立起唱" },
                ]}
              />
            </label>
            <label>
              延唱至
              <Choice
                disabled={locked || !lyricBound}
                label="歌词延唱至"
                value={
                  lyric?.endVocalNoteId
                    ? "note:" + lyric.endVocalNoteId
                    : "none"
                }
                onChange={(v) =>
                  onLyricExtend(v === "none" ? undefined : v.slice(5))
                }
                options={[
                  { value: "none", label: "单个唱音" },
                  ...lyricEndOptions,
                ]}
              />
            </label>
            <label>
              歌词行
              <Choice
                onCloseAutoFocus={closeMenu}
                disabled={locked}
                label="选择歌词行"
                value={String(verse)}
                onChange={(v) => onVerse(Number(v))}
                options={Array.from({ length: lineCount }, (_, i) => ({
                  value: String(i),
                  label: "第 " + (i + 1) + " 行",
                }))}
              />
            </label>
            <button
              className="button secondary-button"
              disabled={locked || lineCount >= 8}
              aria-label="添加歌词行"
              onClick={onAddLine}
            >
              <Plus size={15} />
              添加歌词行
            </button>
            <button
              className="button secondary-button"
              disabled={locked || lineCount <= 1}
              aria-label="删除当前歌词行"
              onClick={onDeleteLine}
            >
              <Trash2 size={15} />
              删除本行
            </button>
            <button
              className="icon-button"
              disabled={locked || !lyric}
              aria-label="删除当前歌词"
              onClick={onDelete}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
      <p>
        {lane === "vocal"
          ? "点击唱音行定位，输入 1–7 写音高，0 写休止；← → 换位置，↑ ↓ 换八度，L 延音。音下单线是八分，双线是十六分。"
          : layout
            ? "拖动歌词小柄或用方向键调整文字排版，起唱时间保持不变。水平、垂直偏移可重置；Tab 接着填，Enter 换行。"
            : lyricBound
              ? "当前歌词跟随唱音。调整起唱会同时移动唱音和关联歌词；选择延唱末音可标记一字多音。Tab 接着填，Enter 换行。"
              : lyricAnchor === "auto"
                ? "点击当前歌词行填写，歌词会跟随同拍唱音；可以先写词再补唱音。拖动小柄调整起唱，Tab 接着填，Enter 换行。"
                : "当前歌词独立起唱，可放在拍内任意时刻，移动唱音不会带动它。拖动小柄调整起唱，Tab 接着填，Enter 换行。"}
      </p>
    </div>
  );
}
