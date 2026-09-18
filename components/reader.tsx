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
  Music2,
  Settings2,
  Check,
  Trash2,
  NotebookPen,
  ScanLine,
  X,
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
import { Choice } from "./room-controls";
import ScoreCanvas, { type ScoreCanvasHandle } from "./score-canvas";
import ArrangementEditor, {
  type ArrangementEditorHandle,
} from "./arrangement-editor";
import ArrangementReader from "./arrangement-reader";
import ScorePageStrip from "./score-page-strip";
import PerformanceReader from "./performance-reader";
import RecognitionReview, {
  type RecognitionProgress,
} from "./recognition-review";
import { recognizeTab } from "@/lib/tab-recognizer";
import type { RecognitionDraft, RecognitionRect } from "@/lib/recognition";
import { EMPTY_ARRANGEMENT, type Arrangement } from "@/lib/arrangement";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  onDelete,
  arrangementDraft,
  onArrangementDraft,
  recognitionDraft,
  onRecognitionDraft,
}: {
  score: Score;
  onPatch: Patch;
  onBack: () => void;
  onLab: () => void;
  onExport: (s: Score) => void;
  onDelete: () => void;
  recognitionDraft?: RecognitionDraft;
  onRecognitionDraft: (
    draft: RecognitionDraft | undefined,
    expectedId?: string,
  ) => void;
  arrangementDraft?: Arrangement;
  onArrangementDraft: (
    a: Arrangement | undefined,
    expected?: Arrangement,
  ) => void;
}) {
  const metronome = useMetronome();
  const [mode, setMode] = useState("score");
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
    [performing, setPerforming] = useState(false),
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
  const canvasRef = useRef<ScoreCanvasHandle>(null);
  const editorRef = useRef<ArrangementEditorHandle>(null);
  const recognitionJob = useRef<AbortController | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const appended = useRef(new Set<string>());
  const [cropMode, setCropMode] = useState(false);
  const [cropSelection, setCropSelection] = useState<RecognitionRect | null>(
    null,
  );
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  const [recognitionProgress, setRecognitionProgress] =
    useState<RecognitionProgress>();
  const [recognitionError, setRecognitionError] = useState<string>();
  useEffect(() => {
    return () => {
      recognitionJob.current?.abort();
      recognitionJob.current = null;
    };
  }, [page.id, page.rotation, mode]);
  function openRecognition() {
    metronome.stop();
    if (recognitionDraft) {
      setRecognitionError(undefined);
      setRecognitionProgress(undefined);
      setRecognitionOpen(true);
    } else beginCrop();
  }
  function beginCrop() {
    recognitionJob.current?.abort();
    recognitionJob.current = null;
    setRecognitionProgress(undefined);
    setRecognitionError(undefined);
    setRecognitionOpen(false);

    setMarking(false);
    setCropSelection(null);
    setMode("score");
    setCropMode(true);
  }
  function closeRecognition(open: boolean) {
    if (!open) {
      recognitionJob.current?.abort();
      recognitionJob.current = null;
      setRecognitionProgress(undefined);
      setRecognitionError(undefined);
    }
    setRecognitionOpen(open);
  }
  async function readCrop(rect: RecognitionRect) {
    const capture = canvasRef.current;
    if (!capture) return;
    recognitionJob.current?.abort();
    const job = new AbortController();
    recognitionJob.current = job;
    const meter = (arrangementDraft ?? score.arrangement ?? EMPTY_ARRANGEMENT)
      .meter;
    const sourcePage = page,
      pageNumber = index + 1;
    setCropMode(false);
    setCropSelection(null);
    setRecognitionError(undefined);
    setRecognitionOpen(true);
    setRecognitionProgress({ message: "正在提取高清原图片段…", value: 0.02 });
    try {
      const canvas = await capture.capture(rect, job.signal);
      const result = await recognizeTab(
        canvas,
        meter,
        job.signal,
        (message, value) => {
          if (!job.signal.aborted) setRecognitionProgress({ message, value });
        },
      );
      if (job.signal.aborted) return;
      onRecognitionDraft({
        id: crypto.randomUUID(),
        pageId: sourcePage.id,
        pageNumber,
        rotation: sourcePage.rotation,
        rect,
        image: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        meter,
        ...result,
      });
    } catch (error) {
      if (!job.signal.aborted)
        setRecognitionError(
          error instanceof Error
            ? error.message
            : "读取失败，请重新框选一个清晰片段。",
        );
    } finally {
      if (recognitionJob.current === job) {
        recognitionJob.current = null;
        setRecognitionProgress(undefined);
      }
    }
  }
  function finishCrop(e: React.PointerEvent<HTMLDivElement>) {
    if (!cropStart.current) return;
    const p = coords(e),
      a = cropStart.current;
    cropStart.current = null;
    const rect = {
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      w: Math.abs(p.x - a.x),
      h: Math.abs(p.y - a.y),
    };
    setCropSelection(null);
    if (rect.w < 0.08 || rect.h < 0.015) {
      toast.error("框选范围太小，请包含完整的六条弦线和左右小节线。");
      return;
    }
    void readCrop(rect);
  }
  function appendRecognition() {
    if (
      !recognitionDraft ||
      !editorRef.current ||
      appended.current.has(recognitionDraft.id)
    )
      return;
    try {
      editorRef.current.appendRecognition(recognitionDraft);
      appended.current.add(recognitionDraft.id);
      onRecognitionDraft(undefined, recognitionDraft.id);
      setRecognitionOpen(false);
      setMode("arrange");
      toast.success("已追加识别片段，可直接编辑、试听或撤销；记得保存编排。");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
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
      if (n < 0 || n >= score.pages.length || n === index) return;

      setReady(false);
      cropStart.current = null;
      setCropMode(false);
      setCropSelection(null);
      setIndex(n);
      if (scroll.current) scroll.current.scrollTop = 0;
      void persist({ lastPage: n, lastOpened: Date.now() }).catch(() => {});
    },
    [persist, score.pages.length, index],
  );
  useEffect(() => {
    if (mode !== "score") return;
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target as HTMLElement).closest("[role=tablist]")
      )
        return;
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
  }, [index, navigate, mode]);
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
    cropStart.current = null;
    setCropMode(false);
    setCropSelection(null);
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
  function openPerformance() {
    cropStart.current = null;
    setCropMode(false);
    setCropSelection(null);
    setMarking(false);
    metronome.stop();
    setPerforming(true);
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
        <button
          className="icon-button reader-delete"
          aria-label="删除当前曲谱"
          onClick={onDelete}
        >
          <Trash2 size={18} />
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
      <div className="reader-modebar">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            cropStart.current = null;
            setCropMode(false);
            setCropSelection(null);
            setMode(v);
          }}
        >
          <TabsList variant="line">
            <TabsTrigger value="score">原谱阅读</TabsTrigger>
            <TabsTrigger value="read">编排阅读</TabsTrigger>
            <TabsTrigger value="arrange">
              编排编辑
              {arrangementDraft ? (
                <i className="draft-dot" />
              ) : score.arrangement ? (
                <Check
                  size={13}
                  className="saved-arrangement-check"
                  aria-hidden="true"
                />
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <span>
          {mode === "arrange"
            ? "点选谱面，编辑并保存编排"
            : mode === "read"
              ? "完整谱面，专心练习"
              : "上传的图片 / PDF · 阅读与批注"}
        </span>
      </div>
      <div className={"reader-body " + (mode !== "score" ? "arranging" : "")}>
        <div className="reader-workspace">
          <div className="original-score-workspace">
            <div className="performance-entry">
              <div>
                <strong>放下鼠标，拿起吉他</strong>
                <span>整份原谱连续展开，倒计时后自动滚动</span>
              </div>
              <button className="button primary" onClick={openPerformance}>
                <Play size={17} />
                进入演奏阅读
              </button>
            </div>
            <ScorePageStrip
              pages={score.pages}
              index={index}
              onNavigate={navigate}
              canvasRef={canvasRef}
              ready={ready}
            />
            <div className="reader-tools">
              <div className="tool-group">
                <button
                  className={
                    "button " + (cropMode ? "primary" : "secondary-button")
                  }
                  disabled={!ready}
                  onClick={() =>
                    cropMode ? setCropMode(false) : openRecognition()
                  }
                >
                  <ScanLine size={15} />
                  {cropMode
                    ? "正在框选"
                    : recognitionDraft
                      ? "继续校对"
                      : "框选识别"}
                  {recognitionDraft && <i className="draft-dot" />}
                </button>
                <button
                  className={
                    "button " + (marking ? "primary" : "secondary-button")
                  }
                  disabled={!ready}
                  onClick={() => {
                    setCropMode(false);
                    setMarking((v) => !v);
                  }}
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
            {(arrangementDraft || score.arrangement) && !cropMode && (
              <div className="reader-version-notice" role="note">
                <NotebookPen size={19} aria-hidden="true" />
                <p>
                  <strong>
                    {arrangementDraft
                      ? "编排还有未保存的修改"
                      : "已有保存的编排"}
                  </strong>
                  <span>
                    {arrangementDraft
                      ? "当前显示上传原谱，返回编排即可继续编辑并保存。"
                      : "已保存的谱面可在「编排阅读」中完整查看与练习。"}
                  </span>
                </p>
                <button
                  className="button secondary-button"
                  onClick={() => {
                    cropStart.current = null;
                    setCropMode(false);
                    setCropSelection(null);

                    setMode(arrangementDraft ? "arrange" : "read");
                  }}
                >
                  {arrangementDraft ? "返回编排草稿" : "查看已保存编排"}
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            {cropMode && (
              <div className="recognition-crop-hint">
                <ScanLine size={17} />
                <p>
                  <strong>框选一行六线谱</strong>
                  <span>
                    包含六条弦线、左右小节线和上下留白，建议 1–4
                    小节。拍点需识别后核对。
                  </span>
                </p>
                <button
                  className="icon-button"
                  aria-label="取消框选识别"
                  onClick={() => setCropMode(false)}
                >
                  <X size={17} />
                </button>
              </div>
            )}
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
                  ref={canvasRef}
                  page={page}
                  onReady={() => setReady(true)}
                  onLoading={() => setReady(false)}
                />
                {ready && cropMode && (
                  <div
                    className="recognition-crop-layer"
                    aria-label="拖动框选六线谱识别区域"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      cropStart.current = coords(e);
                      setCropSelection(null);
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!cropStart.current) return;
                      const p = coords(e),
                        a = cropStart.current;
                      setCropSelection({
                        x: Math.min(a.x, p.x),
                        y: Math.min(a.y, p.y),
                        w: Math.abs(a.x - p.x),
                        h: Math.abs(a.y - p.y),
                      });
                    }}
                    onPointerUp={finishCrop}
                    onPointerCancel={() => {
                      cropStart.current = null;
                      setCropSelection(null);
                    }}
                  >
                    {cropSelection && (
                      <div
                        className="recognition-crop-rect"
                        style={{
                          left: cropSelection.x * 100 + "%",
                          top: cropSelection.y * 100 + "%",
                          width: cropSelection.w * 100 + "%",
                          height: cropSelection.h * 100 + "%",
                        }}
                      />
                    )}
                  </div>
                )}
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
              <button className="button primary" onClick={openPerformance}>
                <Play size={16} />
                演奏阅读 · 自动滚谱
              </button>
            </div>
          </div>
        </div>
        <div className="arrangement-reading-mount" hidden={mode !== "read"}>
          <ArrangementReader
            score={score}
            draft={arrangementDraft}
            active={mode === "read"}
            stopPlayback={metronome.running}
            onEdit={() => setMode("arrange")}
            onPlay={() => {
              metronome.stop();
            }}
          />
        </div>
        <div className="arrangement-mount" hidden={mode !== "arrange"}>
          <ArrangementEditor
            ref={editorRef}
            onRecognize={openRecognition}
            onRead={() => setMode("read")}
            stopPlayback={metronome.running}
            score={score}
            draft={arrangementDraft}
            onDraft={onArrangementDraft}
            active={mode === "arrange"}
            currentPageId={page.id}
            onPlay={() => {
              metronome.stop();
            }}
            onShowPage={(id) => {
              const n = score.pages.findIndex((p) => p.id === id);
              if (n >= 0) navigate(n);
              setMode("score");
            }}
            onSave={async (arrangement, base) => {
              await onPatch(score.id, (current) => {
                if (
                  JSON.stringify(current.arrangement ?? null) !==
                  JSON.stringify(base ?? null)
                )
                  throw new Error(
                    "这份编排已有新的修改，请先导出当前草稿，再刷新核对。",
                  );
                return { arrangement };
              });
            }}
          />
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
      {performing && (
        <PerformanceReader
          score={score}
          initialPage={index}
          onClose={(pageIndex) => {
            setPerforming(false);
            navigate(pageIndex);
          }}
        />
      )}
      <RecognitionReview
        open={recognitionOpen}
        onOpenChange={closeRecognition}
        draft={recognitionDraft}
        onChange={onRecognitionDraft}
        onAppend={appendRecognition}
        onReselect={beginCrop}
        onDiscard={() => {
          if (recognitionDraft)
            onRecognitionDraft(undefined, recognitionDraft.id);
          closeRecognition(false);
        }}
        progress={recognitionProgress}
        error={recognitionError}
      />
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
