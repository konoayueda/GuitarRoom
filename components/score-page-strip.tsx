"use client";
import { useEffect, useState, useRef, useId, type RefObject } from "react";
import { ChevronLeft, ChevronRight, FileText, Images } from "lucide-react";
import type { ScorePage } from "@/lib/models";
import { pageUrl } from "@/lib/models";
import type { ScoreCanvasHandle } from "./score-canvas";
import { Choice } from "./room-controls";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
export default function ScorePageStrip({
  pages,
  index,
  onNavigate,
  canvasRef,
  ready,
  active = true,
}: {
  pages: ScorePage[];
  index: number;
  onNavigate: (index: number) => void;
  canvasRef: RefObject<ScoreCanvasHandle | null>;
  ready: boolean;
  active?: boolean;
}) {
  const [expanded, setExpanded] = useState(false),
    [lastActive, setLastActive] = useState(active),
    [previewGroup, setPreviewGroup] = useState(0),
    [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const cache = useRef<Record<string, string>>({});
  const titleId = useId();
  const lastGroup = Math.max(0, Math.ceil(pages.length / 8) - 1),
    group = Math.min(previewGroup, lastGroup),
    visible = pages.slice(group * 8, group * 8 + 8);
  const navigate = (pageIndex: number) => {
    setExpanded(false);
    onNavigate(pageIndex);
  };
  if (lastActive !== active) {
    setLastActive(active);
    if (!active) setExpanded(false);
  }
  useEffect(() => {
    if (!ready || !expanded || !active) return;
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
  }, [pages, group, ready, expanded, active, canvasRef]);
  if (!pages.length) return null;
  return (
    <div className="score-page-browser compact">
      <div className="score-page-navigation">
        <div className="tool-group">
          <button
            className="icon-button"
            disabled={!index}
            aria-label="查看上一页原谱"
            onClick={() => navigate(index - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          {pages.length > 1 ? (
            <Choice
              label="跳转原谱页"
              value={String(index)}
              onChange={(v) => navigate(Number(v))}
              options={pages.map((_, i) => ({
                value: String(i),
                label: `第 ${i + 1} / ${pages.length} 页`,
              }))}
            />
          ) : (
            <span className="page-current">第 1 / 1 页</span>
          )}
          <button
            className="icon-button"
            disabled={index === pages.length - 1}
            aria-label="查看下一页原谱"
            onClick={() => navigate(index + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        {pages.length > 1 && (
          <Popover
            open={expanded && active}
            onOpenChange={(open) => {
              if (open) setPreviewGroup(Math.floor(index / 8));
              setExpanded(open);
            }}
          >
            <PopoverTrigger asChild>
              <button
                className="page-overview-toggle"
                aria-label="页面预览"
                title="展开原谱页面预览"
              >
                <Images size={16} />
                <span>页面预览</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="score-page-popover"
              align="start"
              sideOffset={8}
              aria-labelledby={titleId}
            >
              <div className="score-page-popover-heading">
                <h3 id={titleId}>页面预览</h3>
                <span>
                  共 {pages.length} 页 · 第 {group * 8 + 1}–
                  {Math.min(group * 8 + 8, pages.length)} 页
                </span>
                {lastGroup > 0 && (
                  <div className="tool-group">
                    <button
                      className="icon-button"
                      disabled={!group}
                      aria-label="预览上一组原谱页"
                      onClick={() => setPreviewGroup(group - 1)}
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={group === lastGroup}
                      aria-label="预览下一组原谱页"
                      onClick={() => setPreviewGroup(group + 1)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                )}
              </div>
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
                      onClick={() => navigate(n)}
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
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
