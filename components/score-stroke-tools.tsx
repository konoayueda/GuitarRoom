"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";

export type ScoreStrokeToolsProps = {
  stroke: "pluck" | "down" | "up";
  onStroke: (stroke: "pluck" | "down" | "up") => void;
  locked: boolean;
  enabled: boolean;
  canChooseChord: boolean;
  chordName?: string;
  location: string;
  onChooseChord: () => void;
};

const options = [
  {
    stroke: "pluck",
    label: "同时拨弦",
    description: "同一拍上的音一起拨响，保留原有起音位置。",
  },
  {
    stroke: "down",
    label: "向下扫弦",
    description: "从较粗的 6 弦向较细的 1 弦依次扫奏。",
  },
  {
    stroke: "up",
    label: "向上扫弦",
    description: "从较细的 1 弦向较粗的 6 弦依次扫奏。",
  },
] as const;

function PluckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <path d={`M3 ${y}H21`} />
          <circle cx="12" cy={y} r="2.1" fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

export function ScoreStrokeTools({
  stroke,
  onStroke,
  locked,
  enabled,
  canChooseChord,
  chordName,
  location,
  onChooseChord,
}: ScoreStrokeToolsProps) {
  const hint = locked
    ? "停止试听或等待保存完成后可调整奏法。"
    : enabled
      ? "奏法应用于当前段已有音符；添加和弦不会自动生成拨弦。"
      : canChooseChord
        ? "先添加和弦，或选择已有音符的段落。"
        : "点击谱面，选择要调整的和弦段或音符。";

  return (
    <div
      className="score-stroke-tools"
      data-score-stroke-toolbar
      role="toolbar"
      aria-label="和弦奏法快捷栏"
    >
      <div className="score-stroke-bar">
        <div className="score-stroke-labels">
          <strong>当前段奏法</strong>
          <span className="score-stroke-location">
            <span className="score-stroke-chord-name">
              {chordName || (enabled ? "手写音符" : "未选和弦")}
            </span>
            {location && <span>{location}</span>}
          </span>
        </div>
        <div
          className="score-stroke-options"
          role="group"
          aria-label="选择当前段奏法"
        >
          {options.map((option) => (
            <button
              key={option.stroke}
              type="button"
              data-score-stroke-option={option.stroke}
              aria-label={option.label}
              aria-pressed={enabled && stroke === option.stroke}
              disabled={locked || !enabled}
              title={option.description}
              onClick={() => {
                if (!locked && enabled) onStroke(option.stroke);
              }}
            >
              {option.stroke === "pluck" ? (
                <PluckIcon />
              ) : option.stroke === "down" ? (
                <ArrowDown size={18} aria-hidden="true" />
              ) : (
                <ArrowUp size={18} aria-hidden="true" />
              )}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="score-stroke-choose-chord"
          disabled={locked || !canChooseChord}
          onClick={() => {
            if (!locked && canChooseChord) onChooseChord();
          }}
        >
          <Plus size={15} aria-hidden="true" />
          {chordName ? "更换和弦…" : "添加和弦…"}
        </button>
      </div>
      <p className="score-stroke-hint" role="status">
        {hint}
      </p>
    </div>
  );
}
