"use client";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  DEFAULT_LYRIC_FONT_SIZE,
  MAX_LYRIC_FONT_SIZE,
  MIN_LYRIC_FONT_SIZE,
  resolveLyricFontSize,
} from "@/lib/lyric-style";

export default function LyricFontSizeControl({
  value,
  onChange,
  disabled = false,
  title,
}: {
  value?: number;
  onChange: (size: number) => void;
  disabled?: boolean;
  title?: string;
}) {
  const size = resolveLyricFontSize(value);
  return (
    <div
      className="lyric-font-size-control"
      role="group"
      aria-label="歌词字号设置"
      title={title}
    >
      <span>歌词字号</span>
      <button
        className="icon-button"
        aria-label="缩小歌词字号"
        disabled={disabled || size <= MIN_LYRIC_FONT_SIZE}
        onClick={() => onChange(size - 1)}
      >
        <Minus size={14} />
      </button>
      <input
        key={size}
        aria-label="歌词字号"
        type="number"
        min={MIN_LYRIC_FONT_SIZE}
        max={MAX_LYRIC_FONT_SIZE}
        step="1"
        defaultValue={size}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (
            event.target.value &&
            Number.isInteger(next) &&
            next >= MIN_LYRIC_FONT_SIZE &&
            next <= MAX_LYRIC_FONT_SIZE
          ) {
            if (next !== size) onChange(next);
          } else event.target.value = String(size);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.value = String(size);
            event.currentTarget.blur();
          }
        }}
      />
      <button
        className="icon-button"
        aria-label="放大歌词字号"
        disabled={disabled || size >= MAX_LYRIC_FONT_SIZE}
        onClick={() => onChange(size + 1)}
      >
        <Plus size={14} />
      </button>
      <button
        className="icon-button"
        aria-label="恢复默认歌词字号"
        title="恢复默认字号 24"
        disabled={disabled || size === DEFAULT_LYRIC_FONT_SIZE}
        onClick={() => onChange(DEFAULT_LYRIC_FONT_SIZE)}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
