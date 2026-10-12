"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { durationLabel } from "@/lib/arrangement";
import { rhythmShape } from "@/lib/notation";

const bases = [96, 48, 24, 12, 6, 3];

function VocalValue({ ticks }: { ticks: number }) {
  const beams = Math.max(0, Math.log2(24 / ticks));
  return (
    <svg viewBox="0 0 40 44" width="32" height="40" aria-hidden="true">
      <text x="14" y="27" fontFamily="serif" fontSize="28" fill="currentColor">
        1
      </text>
      {ticks >= 48 && (
        <path
          d={ticks === 96 ? "M25 20H29M31 20H35M37 20H40" : "M27 20H40"}
          stroke="currentColor"
          strokeWidth="1.6"
        />
      )}
      {Array.from({ length: beams }, (_, i) => (
        <path
          key={i}
          d={`M12 ${32 + i * 4}H29`}
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ))}
    </svg>
  );
}

export default function VocalRhythmTools({
  duration,
  onDuration,
  locked,
  canWrite,
  onRest,
  onTie,
  canTie,
  tied,
  onMove,
  location,
}: {
  duration: number;
  onDuration: (ticks: number) => void;
  locked: boolean;
  canWrite: boolean;
  onRest: () => void;
  onTie: () => void;
  canTie: boolean;
  tied: boolean;
  onMove: (direction: number) => void;
  location: string;
}) {
  const shape = rhythmShape(duration);
  const base = shape?.base ?? 12;
  const dotted =
    base * (shape?.dots === 0 ? 1.5 : shape?.dots === 1 ? 1.75 : 1);
  const triplet = shape?.triplet ? base : (base * 2) / 3;
  return (
    <div className="gp-note-tools" data-vocal-rhythm-toolbar>
      <div className="gp-tool-row" role="toolbar" aria-label="唱音节奏工具栏">
        <div
          className="gp-duration-group"
          role="group"
          aria-label="唱音基本时值"
        >
          {bases.map((ticks) => (
            <button
              key={ticks}
              aria-label={`唱音输入${durationLabel(ticks)}`}
              aria-pressed={base === ticks}
              title={durationLabel(ticks)}
              disabled={locked}
              onClick={() => onDuration(ticks)}
            >
              <VocalValue ticks={ticks} />
              <small>1/{96 / ticks}</small>
            </button>
          ))}
        </div>
        <div className="gp-modifiers" role="group" aria-label="唱音节奏修饰">
          <button
            aria-label="唱音附点（.）"
            aria-pressed={!!shape?.dots}
            disabled={locked || !Number.isInteger(dotted) || dotted > 96}
            onClick={() => onDuration(dotted)}
          >
            <strong>{shape?.dots === 2 ? "··" : "·"}</strong>
            <small>附点</small>
          </button>
          <button
            aria-label="唱音三连音（/）"
            aria-pressed={!!shape?.triplet}
            disabled={locked || triplet < 2 || triplet > 96}
            onClick={() => onDuration(triplet)}
          >
            <strong className="gp-triplet-icon">3</strong>
            <small>三连音</small>
          </button>
          <button
            aria-label="唱音休止（R）"
            disabled={locked || !canWrite}
            onClick={onRest}
          >
            <strong>0</strong>
            <small>休止</small>
          </button>
          <button
            aria-label="唱音延音（L）"
            aria-pressed={tied}
            disabled={locked || !canTie}
            onClick={onTie}
          >
            <strong>⌒</strong>
            <small>延音</small>
          </button>
        </div>
        <div
          className="gp-selection-tools"
          role="group"
          aria-label="唱音光标移动"
        >
          <button
            aria-label="前一个唱音拍位"
            disabled={locked}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="后一个唱音拍位"
            disabled={locked}
            onClick={() => onMove(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="gp-cursor-status" role="status">
        {location} · {durationLabel(duration)}
      </div>
    </div>
  );
}
