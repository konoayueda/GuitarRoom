"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  NotebookPen,
  Play,
  Square,
  Repeat2,
  ArrowDown,
  Pause,
  Check,
} from "lucide-react";
import { Choice } from "./room-controls";
import ArrangementPreview from "./arrangement-preview";
import { useArrangementPlayer } from "./arrangement-player";
import {
  EMPTY_ARRANGEMENT,
  arrangementSchema,
  arrangementProblems,
  listBars,
  type Arrangement,
} from "@/lib/arrangement";
import type { Score } from "@/lib/models";
import { toast } from "sonner";
export default function ArrangementReader({
  score,
  draft,
  active,
  onEdit,
  stopPlayback,
  onPlay,
}: {
  score: Score;
  draft?: Arrangement;
  active: boolean;
  onEdit: () => void;
  stopPlayback: boolean;
  onPlay: () => void;
}) {
  const value = draft ?? score.arrangement ?? EMPTY_ARRANGEMENT;
  const [zoom, setZoom] = useState("100"),
    [loop, setLoop] = useState(false),
    [scrolling, setScrolling] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const player = useArrangementPlayer(
    value,
    score.capo,
    active,
    undefined,
    loop,
    stopPlayback,
  );
  const invalid =
    arrangementProblems(value).length > 0 ||
    !arrangementSchema.safeParse(value).success;
  const count = listBars(value).length;
  useEffect(() => {
    if (!active || !scrolling || player.playing) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const el = area.current;
      if (el) {
        el.scrollTop += (now - last) * 0.024;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, scrolling, player.playing]);
  return (
    <div className="arrangement-reading-workspace">
      <div className="arrangement-reading-toolbar">
        <div className="arrangement-reading-status">
          <BookOpen size={18} />
          <strong>整份编排</strong>
          <span>{count} 小节</span>
          <span className={draft ? "unsaved-label" : "saved-label"}>
            {draft ? (
              "未保存预览"
            ) : score.arrangement ? (
              <>
                <Check size={13} />
                已保存
              </>
            ) : (
              "尚未编排"
            )}
          </span>
        </div>
        <div className="tool-group">
          <Choice
            label="编排阅读缩放"
            value={zoom}
            onChange={setZoom}
            options={["75", "100", "125", "150"].map((v) => ({
              value: v,
              label: v === "100" ? "适合宽度" : v + "%",
            }))}
          />
          <button className="button secondary-button" onClick={onEdit}>
            <NotebookPen size={15} />
            {count ? "继续编辑" : "开始编排"}
          </button>
        </div>
      </div>
      {draft && (
        <div className="arrangement-reading-draft">
          这里包含尚未保存的修改。回到编排编辑保存后，就可以随时打开练习。
        </div>
      )}
      <div className="arrangement-reading-scroll" ref={area}>
        {count ? (
          <div
            className="arrangement-reading-paper"
            style={{ width: zoom + "%", maxWidth: (900 * Number(zoom)) / 100 }}
          >
            <ArrangementPreview
              arrangement={value}
              title={score.title}
              capo={score.capo}
              position={player.position}
            />
          </div>
        ) : (
          <div className="empty-state">
            <BookOpen size={36} />
            <h3>你的整份编排会展示在这里</h3>
            <p>先从原谱识别片段，或手动添加音符与和弦。</p>
            <button className="button primary" onClick={onEdit}>
              开始编排
            </button>
          </div>
        )}
      </div>
      <div className="arrangement-reading-transport">
        <button
          className="button primary"
          disabled={!count || invalid}
          onClick={() => {
            if (player.playing) player.stop();
            else {
              setScrolling(false);
              onPlay();
              void player
                .play()
                .catch(() =>
                  toast.error("暂时无法启动试听，请检查浏览器声音设置。"),
                );
            }
          }}
        >
          {player.playing ? <Square size={15} /> : <Play size={15} />}{" "}
          {player.playing ? "停止整曲试听" : "试听整份编排"}
        </button>
        <button
          className={"button " + (loop ? "primary" : "secondary-button")}
          aria-pressed={loop}
          onClick={() => setLoop((v) => !v)}
        >
          <Repeat2 size={15} />
          循环
        </button>
        <button
          className="button secondary-button"
          disabled={!count || player.playing}
          aria-pressed={scrolling && active}
          onClick={() => setScrolling((v) => !v)}
        >
          {scrolling ? <Pause size={15} /> : <ArrowDown size={15} />}自动滚动
        </button>
        {invalid && count > 0 && <span>请先在编辑页补齐小节时值。</span>}
      </div>
    </div>
  );
}
