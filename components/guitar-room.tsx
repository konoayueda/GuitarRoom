"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Music2,
  Guitar,
  Heart,
  Plus,
  Search,
  ArrowUpRight,
  Play,
  ChevronRight,
  Download,
  AudioLines,
  FolderHeart,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import {
  DEMOS,
  normalizeScore,
  pageUrl,
  type Score,
  type ScorePatch,
  type ScoreLibrary,
} from "@/lib/models";
import { api, jsonBody, downloadBlob, Choice } from "./room-controls";
import ImportDialog from "./import-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import Reader from "./reader";
import type { RecognitionDraft } from "@/lib/recognition";
import type { Arrangement } from "@/lib/arrangement";
import ChordLab from "./chord-lab";
import Metronome from "./metronome";
import { CHORDS } from "@/lib/chords";
const palette = ["clay", "olive", "blue"];
function Staff({ demoId = 0 }: { demoId?: number }) {
  const names =
    demoId === 1
      ? ["C", "Am", "Dm", "G"]
      : demoId === 2
        ? ["Em", "C", "G", "D"]
        : ["C", "Am", "Fmaj7", "G"];
  return (
    <svg
      viewBox="0 0 440 130"
      className="staff"
      aria-label="原创分解和弦练习预览"
    >
      {[0, 1].map((row) => (
        <g key={row} transform={"translate(0," + row * 68 + ")"}>
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <line
              key={s}
              x1="16"
              y1={28 + s * 5}
              x2="424"
              y2={28 + s * 5}
              stroke="currentColor"
              strokeWidth=".6"
              opacity=".4"
            />
          ))}
          {names.map((ch, i) => {
            const frets = CHORDS.find((c) => c.name === ch)!.frets;
            const strings = [1, 3, 2, 3, 4, 3, 2, 3];
            return (
              <g key={ch}>
                <text
                  x={24 + i * 104}
                  y="17"
                  fontSize="12"
                  fill="currentColor"
                  fontFamily="Georgia"
                >
                  {ch}
                </text>
                <line
                  x1={16 + i * 104}
                  y1="28"
                  x2={16 + i * 104}
                  y2="53"
                  stroke="currentColor"
                  opacity=".4"
                />
                {strings.map((_, n) => {
                  let si = strings[(n + demoId) % 8];
                  if (frets[si] < 0) si = 2;
                  return (
                    <text
                      key={n}
                      x={23 + i * 104 + n * 12}
                      y={31 + (5 - si) * 5}
                      fill="currentColor"
                      fontSize="7"
                      stroke="var(--paper,#fcf8f0)"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {frets[si]}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
export default function GuitarRoom() {
  const [scores, setScores] = useState<Score[]>(DEMOS),
    [view, setView] = useState("library"),
    [active, setActive] = useState<string | null>(null),
    [importing, setImporting] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [exporting, setExporting] = useState(false);
  const [arrangementDrafts, setArrangementDrafts] = useState<
    Record<string, Arrangement>
  >({});
  const [recognitionDrafts, setRecognitionDrafts] = useState<
    Record<string, RecognitionDraft>
  >({});
  useEffect(() => {
    if (
      !Object.keys(arrangementDrafts).length &&
      !Object.keys(recognitionDrafts).length
    )
      return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [arrangementDrafts, recognitionDrafts]);
  const [deleteTarget, setDeleteTarget] = useState<Score | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const deletingIds = useRef(new Set<string>());
  const confirmedDeletedIds = useRef(new Set<string>());
  const ref = useRef(scores),
    persisted = useRef(new Set<string>()),
    queue = useRef<Promise<unknown>>(Promise.resolve());
  const load = useCallback(async () => {
    setLoading(true);
    const startingVersions = new Map(
      ref.current.map((s) => [s.id, s.updatedAt]),
    );
    try {
      const library = await api<ScoreLibrary | Score[]>("/api/scores");
      const data = (Array.isArray(library) ? library : library.scores).map(
        normalizeScore,
      );
      const dismissed = Array.isArray(library) ? [] : library.dismissedDemoIds;
      // A delayed list response must not roll back completed saves or imports.
      const merged = new Map(data.map((s) => [s.id, s]));
      for (const local of ref.current) {
        const remote = merged.get(local.id);
        if (
          remote
            ? local.updatedAt > remote.updatedAt
            : persisted.current.has(local.id) &&
              startingVersions.get(local.id) !== local.updatedAt
        )
          merged.set(local.id, local);
      }
      persisted.current = new Set(merged.keys());
      const all = [
        ...merged.values(),
        ...DEMOS.filter(
          (s) => !persisted.current.has(s.id) && !dismissed.includes(s.id),
        ),
      ];
      const visible = all.filter((s) => !confirmedDeletedIds.current.has(s.id));
      ref.current = visible;
      setScores(visible);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // This effect initializes the personal room from its storage API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const update = useCallback(
    (id: string, change: ScorePatch): Promise<Score> => {
      if (deletingIds.current.has(id))
        return Promise.reject(new Error("曲谱正在删除，请稍候。"));
      const task = queue.current
        .catch(() => {})
        .then(async () => {
          let current = ref.current.find((s) => s.id === id);
          if (!current) throw new Error("找不到曲谱。");
          if (!persisted.current.has(id) && current.demoId !== undefined) {
            current = await api<Score>("/api/scores", {
              method: "POST",
              ...jsonBody({ demoId: current.demoId }),
            });
            persisted.current.add(id);
            ref.current = ref.current.map((s) => (s.id === id ? current! : s));
            setScores(ref.current);
          }
          const patch = typeof change === "function" ? change(current) : change;
          const normalized = {
            ...patch,
            expectedUpdatedAt: current.updatedAt,
            ...(patch.pages
              ? {
                  pages: patch.pages.map((p) => ({
                    id: p.id,
                    rotation: p.rotation,
                  })),
                }
              : {}),
          };
          const result = normalizeScore(
            await api<Score>("/api/scores/" + id, {
              method: "PATCH",
              ...jsonBody(normalized),
            }),
          );
          ref.current = ref.current.map((s) => (s.id === id ? result : s));
          setScores(ref.current);
          return result;
        });
      queue.current = task;
      return task;
    },
    [],
  );
  function requestDelete(score: Score) {
    setDeleteError("");
    setDeleteTarget(score);
  }
  async function removeScore() {
    if (!deleteTarget || deletingIds.current.has(deleteTarget.id)) return;
    const id = deleteTarget.id;
    deletingIds.current.add(id);
    setDeleting(true);
    setDeleteError("");
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        const current = ref.current.find((s) => s.id === id);
        if (!current) throw new Error("找不到曲谱，请刷新曲谱库。");
        const result = await api<{ deleted: boolean; cleanupPending: boolean }>(
          "/api/scores/" + id,
          {
            method: "DELETE",
            ...jsonBody({ expectedUpdatedAt: current.updatedAt }),
          },
        );
        confirmedDeletedIds.current.add(id);
        ref.current = ref.current.filter((s) => s.id !== id);
        setScores(ref.current);
        persisted.current.delete(id);
        setArrangementDrafts((old) => {
          const next = { ...old };
          delete next[id];
          return next;
        });
        setRecognitionDrafts((old) => {
          const next = { ...old };
          delete next[id];
          return next;
        });
        if (active === id) {
          setActive(null);
          setView("library");
        }
        setDeleteTarget(null);
        if (result.cleanupPending)
          toast.warning("曲谱已移除，原文件暂未清理；再次打开曲谱库时会重试。");
        else toast.success("曲谱及其原文件、笔记和编排已删除");
      });
    queue.current = task;
    try {
      await task;
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      deletingIds.current.delete(id);
      setDeleting(false);
    }
  }
  function openScore(score: Score) {
    setActive(score.id);
    setView("reader");
    window.scrollTo(0, 0);
    void update(score.id, { lastOpened: Date.now() }).catch((e) =>
      toast.error(e.message),
    );
  }
  const actions = useRef({ openScore });
  useEffect(() => {
    actions.current = { openScore };
  });
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: unknown,
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    const tools = [
      {
        name: "list_scores",
        title: "列出我的曲谱",
        description: "读取曲谱库中的曲名、标识和练习状态。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input: unknown) {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw new Error("Expected an empty object");
          return ref.current.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            favorite: s.favorite,
            pages: s.pages.length,
          }));
        },
      },
      {
        name: "open_score_reader",
        title: "打开曲谱阅读器",
        description: "按标识打开已有曲谱，并更新最近打开时间。",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input: unknown) {
          if (
            !input ||
            typeof input !== "object" ||
            Object.keys(input).length !== 1 ||
            !("id" in input) ||
            typeof input.id !== "string"
          )
            throw new Error("Expected a score id");
          const score = ref.current.find((s) => s.id === input.id);
          if (!score) throw new Error("Score not found");
          actions.current.openScore(score);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { id: score.id, title: score.title, view: "reader" };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: abort.signal }),
        ).catch(console.warn);
      } catch (e) {
        console.warn(e);
      }
    }
    return () => abort.abort();
  }, []);
  async function backup(selection: Score[]) {
    setExporting(true);
    const tid = toast.loading("正在整理原谱和笔记…");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const manifests = [];
      for (const s of selection) {
        const files: Record<string, string> = {};
        for (const p of s.pages) {
          const identity = p.fileId || p.id;
          if (files[identity]) continue;
          const name = p.name.replace(/[\\/:*?"<>|]/g, "_");
          const path =
            s.id + "/" + identity + "-" + name + (p.fileId ? "" : ".svg");
          const response = await fetch(pageUrl(p));
          if (!response.ok)
            throw new Error("未能读取 " + s.title + " 的原文件，请稍后重试。");
          zip.file(path, await response.blob());
          files[identity] = path;
        }
        manifests.push({ ...s, backupFiles: files });
      }
      zip.file(
        "曲谱与笔记.json",
        JSON.stringify(
          {
            format: "xianjian-backup",
            version: 1,
            exportedAt: new Date().toISOString(),
            scores: manifests,
          },
          null,
          2,
        ),
      );
      zip.file(
        "阅读说明.txt",
        "备份包含原始曲谱、页序、旋转、标签、批注和笔记。JSON 记录整理信息，原谱可直接打开或重新导入。",
      );
      downloadBlob(
        await zip.generateAsync({ type: "blob", compression: "STORE" }),
        "弦间-" +
          (selection.length === 1 ? selection[0].title : "曲谱库") +
          "-备份.zip",
      );
      toast.success("备份已导出", { id: tid });
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    } finally {
      setExporting(false);
    }
  }
  const selected = scores.find((s) => s.id === active);
  const recent = [...scores].sort((a, b) => b.lastOpened - a.lastOpened)[0];
  const visible = scores
    .filter(
      (s) =>
        (view !== "favorites" || s.favorite) &&
        (filter === "all" || s.status === filter) &&
        [s.title, s.artist, ...s.tags]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "zh-CN")
        : sort === "added"
          ? b.createdAt - a.createdAt
          : b.lastOpened - a.lastOpened || b.createdAt - a.createdAt,
    );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "230px" } as React.CSSProperties}
    >
      <Sidebar className="room-sidebar">
        <SidebarHeader className="brand">
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>
          <div>
            <strong>弦间</strong>
            <span>GUITAR ROOM</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="nav-content">
          <div className="nav-label">我的练习室</div>
          <SidebarMenu>
            {[
              { icon: BookOpen, label: "我的曲谱", id: "library" },
              { icon: Guitar, label: "和弦实验室", id: "lab" },
              { icon: Heart, label: "我的收藏", id: "favorites" },
            ].map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton
                  isActive={
                    view === n.id || (n.id === "library" && view === "reader")
                  }
                  className="nav-button"
                  onClick={() => {
                    setView(n.id);
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  <n.icon size={19} />
                  <span>{n.label}</span>
                  {n.id === "library" && (
                    <span className="nav-count">
                      {String(scores.length).padStart(2, "0")}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <Music2 size={19} />
            <p>
              每天一点，
              <br />
              让喜欢的旋律更熟悉。
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter className="sidebar-footer">
          <div className="avatar">我</div>
          <div>
            <strong>我的吉他琴房</strong>
            <span>曲谱与笔记，妥善收藏</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="room-main">
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-trigger" />
            <span>我的练习室</span>
            <ChevronRight size={14} />
            <strong>
              {view === "lab"
                ? "和弦实验室"
                : view === "reader"
                  ? "练习台"
                  : view === "favorites"
                    ? "我的收藏"
                    : "曲谱库"}
            </strong>
          </div>
          <span className="top-note">
            <span className="tiny-string" />
            让练习，慢慢成为日常
          </span>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void load()}>
              <RefreshCw size={15} />
              重试
            </button>
          </div>
        )}
        {view === "reader" && selected ? (
          <Reader
            key={selected.id}
            score={selected}
            onPatch={update}
            onBack={() => setView("library")}
            onLab={() => setView("lab")}
            onExport={(s) => void backup([s])}
            onDelete={() => requestDelete(selected)}
            recognitionDraft={recognitionDrafts[selected.id]}
            onRecognitionDraft={(draft, expectedId) =>
              setRecognitionDrafts((old) => {
                if (expectedId && old[selected.id]?.id !== expectedId)
                  return old;
                const next = { ...old };
                if (draft) next[selected.id] = draft;
                else delete next[selected.id];
                return next;
              })
            }
            arrangementDraft={arrangementDrafts[selected.id]}
            onArrangementDraft={(draft, expected) =>
              setArrangementDrafts((old) => {
                if (
                  expected &&
                  JSON.stringify(old[selected.id]) !== JSON.stringify(expected)
                )
                  return old;
                const next = { ...old };
                if (draft) next[selected.id] = draft;
                else delete next[selected.id];
                return next;
              })
            }
          />
        ) : view === "lab" ? (
          <ChordLab
            onBackToScore={selected ? () => setView("reader") : undefined}
          />
        ) : (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR MUSIC, YOUR PACE</div>
                <h1>
                  {view === "favorites" ? "我的收藏" : "我的曲谱"}
                  <span className="title-dot">.</span>
                </h1>
                <p>
                  {view === "favorites"
                    ? "想反复弹起的旋律，都留在这里。"
                    : "收好喜欢的旋律，在这里慢慢练习。"}
                </p>
              </div>
              <button
                className="button primary"
                disabled={loading}
                onClick={() => setImporting(true)}
              >
                <Plus size={18} />
                导入曲谱
              </button>
            </div>
            {view !== "favorites" && recent && (
              <section className="welcome-grid">
                <div className="practice-feature">
                  <div className="feature-copy">
                    <span className="small-label">
                      {recent.lastOpened
                        ? "继续上次练习"
                        : "今日练习 · 原创示范"}
                    </span>
                    <h2>{recent.title}</h2>
                    <p>
                      {recent.demoId !== undefined
                        ? "从四个开放和弦，找回手指的节奏。"
                        : recent.artist || "接着上次的位置，再练一小段。"}
                    </p>
                    <div className="feature-tags">
                      <span>{recent.key} 调</span>
                      <span>Capo {recent.capo}</span>
                      <span>{recent.pages.length} 页曲谱</span>
                    </div>
                    <button
                      className="button light"
                      disabled={loading}
                      onClick={() => openScore(recent)}
                    >
                      <Play size={16} fill="currentColor" />
                      {recent.lastOpened ? "继续练习" : "打开练习谱"}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="feature-score">
                    <div className="paper-heading">
                      <span>MY PRACTICE NOTES</span>
                      <Music2 size={18} />
                    </div>
                    <h3>{recent.title}</h3>
                    <p>
                      {recent.demoId !== undefined
                        ? "Original guitar study"
                        : "My guitar score"}
                    </p>
                    {recent.demoId !== undefined ? (
                      <Staff demoId={recent.demoId} />
                    ) : (
                      <div className="feature-file">
                        <FileText size={48} />
                        <span>{recent.pages.length} 页 · 我的练习谱</span>
                      </div>
                    )}
                    <div className="paper-foot">六弦之间，自有节奏。</div>
                  </div>
                </div>
                <Metronome />
              </section>
            )}
            <div className="library-toolbar">
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList variant="line" className="filter-tabs">
                  <TabsTrigger value="all">
                    全部曲谱{" "}
                    <span>
                      {
                        scores.filter((s) => view !== "favorites" || s.favorite)
                          .length
                      }
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="practicing">正在练习</TabsTrigger>
                  <TabsTrigger value="mastered">已掌握</TabsTrigger>
                </TabsList>
              </Tabs>
              <label className="search-box">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索曲名、标签…"
                  aria-label="搜索曲谱"
                />
              </label>
            </div>
            <div className="collection-heading">
              <span>
                {loading ? "正在读取曲谱库…" : visible.length + " 份曲谱"}
              </span>
              <Choice
                label="曲谱排序"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "recent", label: "最近练习" },
                  { value: "added", label: "最近添加" },
                  { value: "title", label: "曲名排序" },
                ]}
              />
            </div>
            <section className="score-grid">
              {visible.map((s, i) => (
                <article className="score-card" key={s.id}>
                  <button
                    className={"score-cover " + palette[(s.demoId ?? i) % 3]}
                    disabled={loading}
                    onClick={() => openScore(s)}
                    aria-label={"打开" + s.title}
                  >
                    {s.demoId !== undefined ? (
                      <>
                        <div className="cover-top">
                          <span>弦间 · 练习手记</span>
                          <span>0{s.demoId + 1}</span>
                        </div>
                        <h3>{s.title}</h3>
                        <span className="cover-sub">{s.tags[0]}</span>
                        <Staff demoId={s.demoId} />
                        <span className="cover-label">
                          ORIGINAL GUITAR STUDY
                        </span>
                      </>
                    ) : s.pages[0]?.type !== "application/pdf" ? (
                      <>
                        {/* Protected originals use the current signed-in request. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="uploaded-cover"
                          src={pageUrl(s.pages[0])}
                          alt={s.title + "封面"}
                        />
                        <span className="file-badge">
                          图片谱 · {s.pages.length} 页
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="cover-top">
                          <span>我的曲谱</span>
                          <FileText size={17} />
                        </div>
                        <h3>{s.title}</h3>
                        <span className="cover-sub">
                          {s.artist || "PDF 曲谱"}
                        </span>
                        <div className="pdf-cover-icon">
                          <FileText size={43} />
                          <span>{s.pages.length} PAGES</span>
                        </div>
                        <span className="cover-label">
                          PERSONAL GUITAR COLLECTION
                        </span>
                      </>
                    )}
                  </button>
                  <div className="score-info">
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.artist || "我的曲谱"}</p>
                    </div>
                    <button
                      className={"icon-button " + (s.favorite ? "hearted" : "")}
                      aria-label={(s.favorite ? "取消收藏" : "收藏") + s.title}
                      aria-pressed={s.favorite}
                      onClick={() =>
                        void update(s.id, { favorite: !s.favorite }).catch(
                          (e) => toast.error(e.message),
                        )
                      }
                    >
                      <Heart
                        size={19}
                        fill={s.favorite ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <div className="score-delete-row">
                    <button
                      className="score-delete-button"
                      disabled={loading || deleting}
                      onClick={() => requestDelete(s)}
                      aria-label={"删除曲谱：" + s.title}
                    >
                      <Trash2 size={14} />
                      删除曲谱
                    </button>
                  </div>
                  <div className="score-meta">
                    <span>
                      {s.status === "practicing" ? (
                        <>
                          <span className="practice-dot" />
                          正在练习
                        </>
                      ) : s.status === "mastered" ? (
                        "已掌握"
                      ) : s.demoId !== undefined ? (
                        <>
                          <Music2 size={13} />
                          原创示范谱
                        </>
                      ) : (
                        s.tags[0] || "想练"
                      )}
                    </span>
                    <span>
                      {s.key} 调 · {s.pages.length} 页
                    </span>
                  </div>
                </article>
              ))}
            </section>
            {!visible.length && (
              <div className="empty-state">
                <FolderHeart size={35} />
                <h3>
                  {query
                    ? "还没有找到这份曲谱"
                    : view === "favorites"
                      ? "把喜欢的谱子留下"
                      : "这里还没有曲谱"}
                </h3>
                <p>
                  {query
                    ? "试试曲名、作者或标签。"
                    : view === "favorites"
                      ? "点击曲谱旁的爱心，就会收进这里。"
                      : "导入一份曲谱，或更换筛选条件。"}
                </p>
                <button
                  className="button secondary-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    if (view === "favorites") setView("library");
                  }}
                >
                  查看全部曲谱
                </button>
              </div>
            )}
            <div className="library-foot">
              <span>
                <FolderHeart size={16} />
                原谱与笔记，留在自己的琴房。
              </span>
              <button
                disabled={exporting || !scores.length}
                onClick={() => void backup(scores)}
              >
                <Download size={14} />
                {exporting ? "正在导出…" : "导出备份"}
              </button>
            </div>
          </div>
        )}
      </main>
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={(s) => {
          persisted.current.add(s.id);
          ref.current = [s, ...ref.current];
          setScores(ref.current);
          setFilter("all");
          setQuery("");
          setView("library");
        }}
      />
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              这份曲谱的原文件、批注、练习笔记和编排将一并删除，无法撤销。
              {deleteTarget &&
              (arrangementDrafts[deleteTarget.id] ||
                recognitionDrafts[deleteTarget.id])
                ? "未保存的编排和识别草稿也会删除。"
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>保留曲谱</AlertDialogCancel>
            <AlertDialogAction
              className="delete-confirm-button"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void removeScore();
              }}
            >
              {deleting ? "正在删除…" : "确认删除曲谱"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}
