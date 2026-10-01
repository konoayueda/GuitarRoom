"use client";
import {
  Copy,
  ClipboardPaste,
  Scissors,
  Undo2,
  Redo2,
  Keyboard,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { durationLabel } from "@/lib/arrangement";
import { rhythmShape } from "@/lib/notation";
const bases = [96, 48, 24, 12, 6, 3];
function NoteIcon({ ticks }: { ticks: number }) {
  const flags = Math.max(0, Math.log2(24 / ticks));
  return (
    <svg viewBox="0 0 26 32" width="26" height="32" aria-hidden="true">
      <ellipse
        cx="9"
        cy="24"
        rx="5"
        ry="3.5"
        transform="rotate(-22 9 24)"
        fill={ticks >= 48 ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {ticks < 96 && (
        <path
          d="M13.5 24V4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      )}
      {Array.from({ length: flags }, (_, i) => (
        <path
          key={i}
          d={`M13.5 ${4 + i * 5} Q24 ${9 + i * 5} 18 ${17 + i * 4}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ))}
    </svg>
  );
}
export default function ScoreNoteTools({
  duration,
  onDuration,
  locked,
  onRest,
  onTie,
  tied,
  canTie,
  tieHint,
  onPreviousTie,
  previousTied,
  onCopy,
  onCut,
  onPaste,
  canCopy,
  canPaste,
  onAnchor,
  selecting,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onMove,
  onProperties,
  properties,
  location,
  onHelp,
  help,
}: {
  duration: number;
  onDuration: (n: number) => void;
  locked: boolean;
  onRest: () => void;
  onTie: () => void;
  tied: boolean;
  canTie: boolean;
  tieHint: string;
  onPreviousTie: () => void;
  previousTied: boolean;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  canCopy: boolean;
  canPaste: boolean;
  onAnchor: () => void;
  selecting: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onMove: (n: number) => void;
  onProperties: () => void;
  properties: boolean;
  location: string;
  onHelp: () => void;
  help: boolean;
}) {
  const shape = rhythmShape(duration),
    base = shape?.base ?? 12;
  const dotted =
      base * (shape?.dots === 0 ? 1.5 : shape?.dots === 1 ? 1.75 : 1),
    triplet = shape?.triplet ? base : (base * 2) / 3;
  return (
    <div className="gp-note-tools">
      <div className="gp-tool-row" role="toolbar" aria-label="音符与时值工具栏">
        <div className="gp-duration-group" role="group" aria-label="基本时值">
          {bases.map((n) => (
            <button
              key={n}
              title={durationLabel(n)}
              aria-label={"输入" + durationLabel(n)}
              aria-pressed={base === n}
              disabled={locked}
              onClick={() => onDuration(n)}
            >
              <NoteIcon ticks={n} />
              <small>1/{96 / n}</small>
            </button>
          ))}
        </div>
        <div className="gp-modifiers" role="group" aria-label="时值修饰">
          <button
            disabled={locked || !Number.isInteger(dotted) || dotted > 96}
            aria-label="附点（.）"
            title="附点 / 复附点（.）"
            aria-pressed={!!shape?.dots}
            onClick={() => onDuration(dotted)}
          >
            <strong>{shape?.dots === 2 ? "··" : "·"}</strong>
            <small>附点</small>
          </button>
          <button
            disabled={locked || triplet < 2 || triplet > 96}
            aria-label="三连音（/）"
            title="三连音（/）"
            aria-pressed={!!shape?.triplet}
            onClick={() => onDuration(triplet)}
          >
            <strong className="gp-triplet-icon">3</strong>
            <small>三连音</small>
          </button>
          <button
            disabled={locked || !canCopy}
            aria-label="当前拍位休止（R）"
            title="清空当前时值内的所有弦（R）"
            onClick={onRest}
          >
            <strong>𝄽</strong>
            <small>休止</small>
          </button>
          <button
            disabled={locked || !canTie}
            aria-label="延音连接（L）"
            title={tieHint + "（L）"}
            aria-pressed={tied}
            onClick={onTie}
          >
            <strong>⌒</strong>
            <small>延音</small>
          </button>
          <button
            disabled={locked || !canTie}
            aria-label="接到前音（Shift+L）"
            title="将当前音接到前一个同弦同品音（Shift+L）"
            aria-pressed={previousTied}
            onClick={onPreviousTie}
          >
            <strong>←⌒</strong>
            <small>接前音</small>
          </button>
        </div>
        <div className="gp-selection-tools" role="group" aria-label="片段编辑">
          <button
            disabled={locked || !canCopy}
            onClick={onAnchor}
            aria-pressed={selecting}
            title="设为选区起点，再点击终点或按方向键"
          >
            {selecting ? "取消选区" : "选择片段"}
          </button>
          <button
            disabled={locked || !canCopy}
            onClick={onCopy}
            aria-label="复制选区"
            title="复制音符、和弦与节奏（Ctrl+C）"
          >
            <Copy size={17} />
          </button>
          <button
            disabled={locked || !canCopy}
            onClick={onCut}
            aria-label="剪切选区"
            title="剪切选区，后续音符保持原位（Ctrl+X）"
          >
            <Scissors size={17} />
          </button>
          <button
            disabled={locked || !canPaste}
            onClick={onPaste}
            aria-label="覆盖粘贴片段"
            title="从光标覆盖相同时长，包含和弦（Ctrl+V）"
          >
            <ClipboardPaste size={17} />
          </button>
          <button
            disabled={locked || !canUndo}
            onClick={onUndo}
            aria-label="撤销编排修改"
            title="撤销（Ctrl+Z）"
          >
            <Undo2 size={17} />
          </button>
          <button
            disabled={locked || !canRedo}
            onClick={onRedo}
            aria-label="重做编排修改"
            title="重做（Ctrl+Shift+Z）"
          >
            <Redo2 size={17} />
          </button>
        </div>
      </div>
      <div className="gp-cursor-status">
        <span aria-live="polite">{location}</span>
        <strong>{durationLabel(duration)}</strong>
        <div>
          <button
            disabled={locked || !canCopy}
            onClick={() => onMove(-1)}
            aria-label="上一拍位"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            disabled={locked || !canCopy}
            onClick={() => onMove(1)}
            aria-label="下一拍位"
          >
            <ChevronRight size={17} />
          </button>
          <button
            onClick={onProperties}
            aria-label="显示音符属性"
            aria-expanded={properties}
          >
            <SlidersHorizontal size={16} />
            <span>属性</span>
          </button>
          <button
            onClick={onHelp}
            aria-label="显示编排快捷键"
            aria-expanded={help}
          >
            <Keyboard size={17} />
          </button>
        </div>
      </div>
      {help && (
        <div className="gp-shortcuts">
          <span>
            <kbd>0–9</kbd> 品位 · <kbd>X</kbd> 按和弦
          </span>
          <span>
            <kbd>← →</kbd> 换拍 · <kbd>↑ ↓</kbd> 换弦
          </span>
          <span>
            <kbd>+</kbd> 缩短 · <kbd>−</kbd> 延长
          </span>
          <span>
            <kbd>.</kbd> 附点 · <kbd>/</kbd> 三连音
          </span>
          <span>
            <kbd>R</kbd> 休止 · <kbd>L</kbd> 延音 · <kbd>Shift+L</kbd> 接前音
          </span>
          <span>
            <kbd>Shift+←/→</kbd> 选区
          </span>
          <span>
            <kbd>Ctrl/Cmd+C / X / V</kbd> 复制 / 剪切 / 覆盖粘贴
          </span>
          <span>
            <kbd>Space</kbd> 试听 · <kbd>Ctrl/Cmd+S</kbd> 保存
          </span>
          <p>
            点击只移动光标；在同一拍上下换弦可写和音。延音连接后面的同音；后面没有同音时会补上续音，支持跨小节。粘贴会覆盖目标范围，并保留片段的和弦、奏法与休止。
          </p>
        </div>
      )}
    </div>
  );
}
