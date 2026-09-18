"use client";
import { useEffect, useState, useRef, type RefObject } from "react";
import { ChevronLeft, ChevronRight, FileText, Images } from "lucide-react";
import type { ScorePage } from "@/lib/models";
import { pageUrl } from "@/lib/models";
import type { ScoreCanvasHandle } from "./score-canvas";
import { Choice } from "./room-controls";
export default function ScorePageStrip({
  pages,
  index,
  onNavigate,
  canvasRef,
  ready,
}: {
  pages: ScorePage[];
  index: number;
  onNavigate: (index: number) => void;
  canvasRef: RefObject<ScoreCanvasHandle | null>;
  ready: boolean;
}) {
  const [expanded, setExpanded] = useState(true),
    [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const cache = useRef<Record<string, string>>({});
  const group = Math.floor(index / 8),
    visible = pages.slice(group * 8, group * 8 + 8);
  useEffect(() => {
    if (!ready || !expanded) return;
    const abort = new AbortController();
    void (async () => {
      for (const p of pages.slice(group * 8, group * 8 + 8)) {
        const key = p.id + ":" + p.rotation;
        if (p.type !== "application/pdf" || cache.current[key]) continue;
        try {
          const url = await canvasRef.current?.thumbnail(
            p.pdfPage || 1,
            p.rotation,
            abort.signal,
          );
          if (url && !abort.signal.aborted) {
            cache.current[key] = url;
            setThumbnails((old) => ({ ...old, [key]: url }));
          }
        } catch {
          if (abort.signal.aborted) return;
        }
      }
    })();
    return () => abort.abort();
  }, [pages, group, ready, expanded, canvasRef]);
  if (pages.length < 2) return null;
  return (
    <div className="score-page-browser">
      <div className="score-page-navigation">
        <button
          className="page-overview-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Images size={16} />
          页面预览<span>共 {pages.length} 页</span>
        </button>
        <div className="tool-group">
          <button
            className="icon-button"
            disabled={!index}
            aria-label="查看上一页原谱"
            onClick={() => onNavigate(index - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <Choice
            label="跳转原谱页"
            value={String(index)}
            onChange={(v) => onNavigate(Number(v))}
            options={pages.map((_, i) => ({
              value: String(i),
              label: `第 ${i + 1} / ${pages.length} 页`,
            }))}
          />
          <button
            className="icon-button"
            disabled={index === pages.length - 1}
            aria-label="查看下一页原谱"
            onClick={() => onNavigate(index + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="score-page-thumbnails">
          {visible.map((p, i) => {
            const n = group * 8 + i,
              src =
                p.type === "application/pdf"
                  ? thumbnails[p.id + ":" + p.rotation]
                  : pageUrl(p);
            return (
              <button
                key={p.id}
                aria-label={`打开原谱第 ${n + 1} 页`}
                aria-current={index === n ? "page" : undefined}
                onClick={() => onNavigate(n)}
              >
                <span className="score-page-thumbnail">
                  {src ? ( // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`第 ${n + 1} 页预览`}
                      style={
                        p.type !== "application/pdf"
                          ? {
                              transform: `rotate(${p.rotation}deg) scale(${p.rotation % 180 !== 0 ? 0.75 : 1})`,
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <FileText size={25} />
                  )}
                </span>
                <span>第 {n + 1} 页</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
