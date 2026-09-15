"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCw,
  PenLine,
  Eye,
  EyeOff,
  Download,
  Heart,
  Play,
  Pause,
  Music2,
  Settings2,
  Check,
  Trash2,
  NotebookPen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Choice } from "./room-controls";
import ScoreCanvas from "./score-canvas";
import { MetronomeControls, useMetronome } from "./metronome";
import {
  type Score,
  type ScorePatch,
  type Annotation,
  statusLabels,
} from "@/lib/models";
import { toast } from "sonner";
type Patch = (id: string, patch: ScorePatch) => Promise<Score>;
export default function Reader({
  score,
  onPatch,
  onBack,
  onLab,
  onExport,
}: {
  score: Score;
  onPatch: Patch;
  onBack: () => void;
  onLab: () => void;
  onExport: (s: Score) => void;
}) {
  const metronome = useMetronome();
  const [narrow, setNarrow] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:1000px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [index, setIndex] = useState(
      Math.min(score.lastPage, score.pages.length - 1),
    ),
    [zoom, setZoom] = useState("100"),
    [focus, setFocus] = useState(false),
    [marking, setMarking] = useState(false),
    [showNotes, setShowNotes] = useState(true),
    [draft, setDraft] = useState<Annotation | null>(null),
    [editing, setEditing] = useState(false),
    [meta, setMeta] = useState(score),
    [note, setNote] = useState(score.note),
    [saving, setSaving] = useState(false),
    [scrolling, setScrolling] = useState(false),
    [speed, setSpeed] = useState(25),
    [ready, setReady] = useState(false);
  const previousNote = useRef(score.note);
  useEffect(() => {
    const previous = previousNote.current;
    setNote((draft) => (draft === previous ? score.note : draft));
    previousNote.current = score.note;
  }, [score.note]);
  const scroll = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | null>(null),
    [selection, setSelection] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
  const page = score.pages[index] || score.pages[0];
  const annotations = score.annotations.filter((a) => a.pageId === page.id);
  const persist = useCallback(
    async (patch: ScorePatch) => {
      try {
        return await onPatch(score.id, patch);
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    [onPatch, score.id],
  );
  const navigate = useCallback(
    (n: number) => {
      if (n < 0 || n >= score.pages.length) return;
      setScrolling(false);
      setReady(false);
      setIndex(n);
      if (scroll.current) scroll.current.scrollTop = 0;
      void persist({ lastPage: n, lastOpened: Date.now() }).catch(() => {});
    },
    [persist, score.pages.length],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,[role=dialog],[role=combobox]",
        )
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(index + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(index - 1);
      }
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, navigate]);
  useEffect(() => {
    if (!scrolling) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const area = scroll.current;
      if (area) {
        area.scrollTop += ((now - last) * speed) / 1000;
        if (area.scrollTop + area.clientHeight >= area.scrollHeight - 1) {
          setScrolling(false);
          return;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, speed]);
  function coords(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = coords(e);
    setSelection({
      x: Math.min(start.current.x, p.x),
      y: Math.min(start.current.y, p.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    });
  }
  function finish(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = coords(e),
      a = start.current;
    start.current = null;
    setSelection(null);
    setDraft({
      id: crypto.randomUUID(),
      pageId: page.id,
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      w: Math.abs(a.x - p.x),
      h: Math.abs(a.y - p.y),
      text: "",
    });
  }
  async function saveAnnotation() {
    if (!draft?.text.trim()) return;
    setSaving(true);
    try {
      await persist((s) => ({
        annotations: [
          ...s.annotations.filter((a) => a.id !== draft.id),
          { ...draft, text: draft.text.trim() },
        ],
      }));
      setDraft(null);
      setMarking(false);
      toast.success("批注已保存");
    } catch {
    } finally {
      setSaving(false);
    }
  }
  async function rotate() {
    setReady(false);
    await persist((s) => {
      const pages = s.pages.map((p) =>
        p.id === page.id ? { ...p, rotation: (p.rotation + 90) % 360 } : p,
      );
      const notes = s.annotations.map((a) =>
        a.pageId === page.id
          ? { ...a, x: Math.max(0, 1 - a.y - a.h), y: a.x, w: a.h, h: a.w }
          : a,
      );
      return { pages, annotations: notes };
    }).catch(() => setReady(true));
  }
  function reorder(i: number, d: number) {
    const target = score.pages[i].id;
    void persist((s) => {
      const pages = [...s.pages];
      const at = pages.findIndex((p) => p.id === target);
      if (at + d < 0 || at + d >= pages.length) return {};
      [pages[at], pages[at + d]] = [pages[at + d], pages[at]];
      return { pages };
    }).catch(() => {});
  }
  const asideContent = (
    <>
      <div className="aside-heading">
        <span>这一次练习</span>
        <Choice
          label="练习状态"
          value={score.status}
          onChange={(v) =>
            void persist({ status: v as Score["status"] }).catch(() => {})
          }
          options={Object.entries(statusLabels).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <MetronomeControls compact metronome={metronome} />
      <div className="notes-panel">
        <h3>
          <PenLine size={15} />
          谱面批注 <span>{annotations.length}</span>
        </h3>
        {annotations.length ? (
          annotations.map((a, i) => (
            <button
              className="note-card"
              key={a.id}
              onClick={() => setDraft({ ...a })}
            >
              <span>{i + 1}</span>
              <p>{a.text}</p>
            </button>
          ))
        ) : (
          <p className="muted-text">圈出一处难点，记下适合自己的换指方法。</p>
        )}
        <h3 className="note-heading">练习笔记</h3>
        <textarea
          aria-label="练习笔记"
          value={note}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今天练到哪里？下次留意什么？"
        />
        <button
          className="button secondary-button full-width"
          disabled={note === score.note}
          onClick={() =>
            void persist({ note })
              .then(() => toast.success("笔记已保存"))
              .catch(() => {})
          }
        >
          <Check size={15} />
          保存笔记
        </button>
        <button className="lab-link" onClick={onLab}>
          <Music2 size={16} />
          打开和弦实验室
          <ChevronRight size={15} />
        </button>
      </div>
    </>
  );
  return (
    <section className={"reader " + (focus ? "reader-focus" : "")}>
      <div className="reader-header">
        <button
          className="icon-button"
          onClick={onBack}
          aria-label="返回曲谱库"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="reader-title">
          <h1>{score.title}</h1>
          <p>
            {score.artist || "我的曲谱"} · {score.key} 调 · Capo {score.capo}
          </p>
        </div>
        <button
          className={"icon-button " + (score.favorite ? "hearted" : "")}
          aria-label={score.favorite ? "取消收藏" : "收藏曲谱"}
          aria-pressed={score.favorite}
          onClick={() =>
            void persist({ favorite: !score.favorite }).catch(() => {})
          }
        >
          <Heart size={19} fill={score.favorite ? "currentColor" : "none"} />
        </button>
        <button
          className="icon-button"
          aria-label="编辑曲谱信息"
          onClick={() => {
            setMeta(score);
            setEditing(true);
          }}
        >
          <Settings2 size={19} />
        </button>
        {narrow && (
          <button
            className="icon-button"
            aria-label="练习笔记与节拍器"
            onClick={() => setToolsOpen(true)}
          >
            <NotebookPen size={19} />
          </button>
        )}
        <button
          className="icon-button"
          aria-label="导出这份曲谱"
          onClick={() => onExport(score)}
        >
          <Download size={19} />
        </button>
        <button
          className="icon-button"
          aria-label={focus ? "退出专注模式" : "专注模式"}
          onClick={() => setFocus((v) => !v)}
        >
          {focus ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
      </div>
      <div className="reader-body">
        <div className="reader-workspace">
          <div className="reader-tools">
            <div className="tool-group">
              <button
                className={
                  "button " + (marking ? "primary" : "secondary-button")
                }
                disabled={!ready}
                onClick={() => setMarking((v) => !v)}
              >
                <PenLine size={15} />
                {marking ? "在谱上拖动圈选" : "圈选批注"}
              </button>
              <button
                className="icon-button"
                aria-label={showNotes ? "隐藏批注" : "显示批注"}
                onClick={() => setShowNotes((v) => !v)}
              >
                {showNotes ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
              <button
                className="icon-button"
                aria-label="顺时针旋转页面"
                onClick={rotate}
              >
                <RotateCw size={17} />
              </button>
            </div>
            <Choice
              label="曲谱缩放"
              value={zoom}
              onChange={setZoom}
              options={["75", "100", "125", "150"].map((v) => ({
                value: v,
                label: v === "100" ? "适合宽度" : v + "%",
              }))}
            />
          </div>
          <div
            className={"sheet-scroll " + (marking ? "marking" : "")}
            ref={scroll}
          >
            <div
              className="sheet-paper"
              style={{
                width: zoom + "%",
                maxWidth: (900 * Number(zoom)) / 100,
              }}
            >
              <ScoreCanvas
                page={page}
                onReady={() => setReady(true)}
                onLoading={() => setReady(false)}
              />
              {ready && (
                <div
                  className="annotation-layer"
                  style={{
                    touchAction: marking ? "none" : "auto",
                    pointerEvents: marking || showNotes ? "auto" : "none",
                  }}
                  onPointerDown={(e) => {
                    if (!marking) return;
                    e.preventDefault();
                    start.current = coords(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onPointerCancel={() => {
                    start.current = null;
                    setSelection(null);
                  }}
                >
                  {showNotes &&
                    annotations.map((a, i) => (
                      <button
                        key={a.id}
                        aria-label={"批注 " + (i + 1) + "：" + a.text}
                        title={a.text}
                        className={
                          "annotation " +
                          (a.w > 0.015 && a.h > 0.015
                            ? "annotation-box"
                            : "annotation-pin")
                        }
                        style={{
                          left: a.x * 100 + "%",
                          top: a.y * 100 + "%",
                          width: a.w > 0.015 ? a.w * 100 + "%" : undefined,
                          height: a.h > 0.015 ? a.h * 100 + "%" : undefined,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setDraft({ ...a })}
                      >
                        <span>{i + 1}</span>
                      </button>
                    ))}
                  {selection && (
                    <div
                      className="annotation annotation-box"
                      style={{
                        left: selection.x * 100 + "%",
                        top: selection.y * 100 + "%",
                        width: selection.w * 100 + "%",
                        height: selection.h * 100 + "%",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="reader-bottom">
            <div className="tool-group">
              <button
                className="icon-button"
                disabled={index === 0}
                aria-label="上一页"
                onClick={() => navigate(index - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                第 {index + 1} / {score.pages.length} 页
              </span>
              <button
                className="icon-button"
                disabled={index >= score.pages.length - 1}
                aria-label="下一页"
                onClick={() => navigate(index + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="auto-scroll">
              <button
                className="button secondary-button"
                onClick={() => setScrolling((v) => !v)}
              >
                {scrolling ? <Pause size={14} /> : <Play size={14} />}自动滚动
              </button>
              <Slider
                aria-label="自动滚动速度"
                min={10}
                max={100}
                value={[speed]}
                onValueChange={(v) => setSpeed(v[0])}
              />
            </div>
          </div>
        </div>
        {narrow ? (
          <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
            <SheetContent className="mobile-practice-sheet">
              <SheetHeader>
                <SheetTitle>这一次练习</SheetTitle>
                <SheetDescription>
                  查看批注、记下进度，再跟着节拍练一遍。
                </SheetDescription>
              </SheetHeader>
              <div className="mobile-aside-content">{asideContent}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <aside className="reader-aside">{asideContent}</aside>
        )}
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(v) => {
          if (!v && !saving) setDraft(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>留下一条指法笔记</DialogTitle>
            <DialogDescription>
              第 {index + 1} 页 · 可以记录落指顺序、节奏或下次要注意的地方。
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="annotation-input"
            autoFocus
            aria-label="批注内容"
            maxLength={500}
            value={draft?.text || ""}
            onChange={(e) =>
              setDraft((a) => (a ? { ...a, text: e.target.value } : null))
            }
            placeholder="例如：食指先留在原位，无名指再移到下一位置。"
          />
          <div className="dialog-actions">
            {draft && score.annotations.some((a) => a.id === draft.id) && (
              <button
                className="button secondary-button danger"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await persist((s) => ({
                      annotations: s.annotations.filter(
                        (a) => a.id !== draft.id,
                      ),
                    }));
                    setDraft(null);
                    toast.success("已移除批注");
                  } catch {
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Trash2 size={15} />
                移除批注
              </button>
            )}
            <button
              className="button primary"
              onClick={saveAnnotation}
              disabled={saving || !draft?.text.trim()}
            >
              {saving ? "保存中…" : "保存批注"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="import-dialog">
          <DialogHeader>
            <DialogTitle>曲谱信息</DialogTitle>
            <DialogDescription>
              调整信息和页序，保留自己的整理方式。
            </DialogDescription>
          </DialogHeader>
          <div className="form-grid">
            <label>
              曲名
              <input
                value={meta.title}
                maxLength={100}
                onChange={(e) =>
                  setMeta((s) => ({ ...s, title: e.target.value }))
                }
              />
            </label>
            <label>
              歌手 / 作者
              <input
                value={meta.artist}
                maxLength={100}
                onChange={(e) =>
                  setMeta((s) => ({ ...s, artist: e.target.value }))
                }
              />
            </label>
            <label>
              调性
              <input
                value={meta.key}
                maxLength={12}
                onChange={(e) =>
                  setMeta((s) => ({ ...s, key: e.target.value }))
                }
              />
            </label>
            <label>
              变调夹
              <input
                type="number"
                min={0}
                max={12}
                value={meta.capo}
                onChange={(e) =>
                  setMeta((s) => ({ ...s, capo: Number(e.target.value) }))
                }
              />
            </label>
            <label className="span-two">
              标签
              <input
                value={meta.tags.join("，")}
                onChange={(e) =>
                  setMeta((s) => ({
                    ...s,
                    tags: e.target.value.split(/[,，]/),
                  }))
                }
              />
            </label>
          </div>
          <div className="page-order">
            {score.pages.map((p, i) => (
              <div className="file-row" key={p.id}>
                <span>
                  第 {i + 1} 页 · {p.name}
                </span>
                <button
                  className="icon-button"
                  aria-label={"上移页面" + (i + 1)}
                  disabled={i === 0}
                  onClick={() => reorder(i, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"下移页面" + (i + 1)}
                  disabled={i === score.pages.length - 1}
                  onClick={() => reorder(i, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="button primary"
            disabled={!meta.title.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await persist({
                  title: meta.title.trim(),
                  artist: meta.artist,
                  key: meta.key,
                  capo: meta.capo,
                  tags: meta.tags.map((t) => t.trim()).filter(Boolean),
                });
                setEditing(false);
                toast.success("曲谱信息已更新");
              } catch {
              } finally {
                setSaving(false);
              }
            }}
          >
            保存信息
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
