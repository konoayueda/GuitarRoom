"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider as SliderPrimitive } from "radix-ui";
import { Choice } from "./room-controls";
import ScoreCanvas from "./score-canvas";
import { pageUrl, type Score, type ScorePage } from "@/lib/models";

type Position = { pageId: string; fraction: number };
type Preferences = Position & { speed: number; zoom: string; delay: string };
type PageState = "loading" | "ready" | "error";
const preferenceKey = (id: string) => "xianjian:performance:" + id;
function loadPreferences(score: Score, initialPage: number): Preferences {
  const defaults = {
    pageId: score.pages[initialPage].id,
    fraction: 0,
    speed: 18,
    zoom: "100",
    delay: "3",
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(preferenceKey(score.id)) || "null",
    );
    if (!saved) return defaults;
    const hasPosition = score.pages.some((page) => page.id === saved.pageId);
    return {
      ...defaults,
      pageId: hasPosition ? saved.pageId : defaults.pageId,
      speed: Number.isFinite(saved.speed)
        ? Math.max(2, Math.min(90, saved.speed))
        : 18,
      zoom: ["75", "100", "125", "150"].includes(saved.zoom)
        ? saved.zoom
        : "100",
      delay: ["0", "3", "5"].includes(saved.delay) ? saved.delay : "3",
      fraction:
        hasPosition && Number.isFinite(saved.fraction)
          ? Math.max(0, Math.min(1, saved.fraction))
          : 0,
    };
  } catch {
    return defaults;
  }
}
function PerformancePage({
  page,
  index,
  aspect,
  root,
  onState,
}: {
  page: ScorePage;
  index: number;
  aspect: number;
  root: React.RefObject<HTMLDivElement | null>;
  onState: (id: string, state: PageState) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const target = ref.current;
    if (!target || !root.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      {
        root: root.current,
        rootMargin: "120% 0px",
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!near) onState(page.id, "loading");
  }, [near, onState, page.id]);
  return (
    <section
      ref={ref}
      className="performance-page"
      data-performance-page={page.id}
      aria-label={"原谱第 " + (index + 1) + " 页"}
    >
      <div className="performance-page-label">
        {String(index + 1).padStart(2, "0")} <span>原谱 · {page.name}</span>
      </div>
      <div className="performance-paper" style={{ aspectRatio: aspect }}>
        {near ? (
          <ScoreCanvas
            page={page}
            onLoading={() => onState(page.id, "loading")}
            onReady={() => onState(page.id, "ready")}
            onError={() => onState(page.id, "error")}
          />
        ) : (
          <div className="canvas-message">第 {index + 1} 页</div>
        )}
      </div>
    </section>
  );
}
export default function PerformanceReader({
  score,
  initialPage,
  onClose,
}: {
  score: Score;
  initialPage: number;
  onClose: (page: number) => void;
}) {
  const [preferences] = useState(() => loadPreferences(score, initialPage));
  const [speed, setSpeed] = useState(preferences.speed);
  const [zoom, setZoom] = useState(preferences.zoom);
  const [delay, setDelay] = useState(preferences.delay);
  const [aspects, setAspects] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [current, setCurrent] = useState(() =>
    score.pages.findIndex((page) => page.id === preferences.pageId),
  );
  const [startPage, setStartPage] = useState(current);
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [message, setMessage] = useState("选好起点，留几秒把双手放回琴上");
  const [wake, setWake] = useState("正在尝试保持屏幕常亮");
  const [fullscreen, setFullscreen] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const pageStates = useRef(new Map<string, PageState>());
  const position = useRef<Position>({
    pageId: preferences.pageId,
    fraction: preferences.fraction,
  });
  const restored = useRef(false);
  const ownedFullscreen = useRef(false);
  const recordState = useCallback((id: string, state: PageState) => {
    pageStates.current.set(id, state);
  }, []);
  const pause = useCallback((reason = "已暂停 · 可拖动谱面调整位置") => {
    setRunning(false);
    setCountdown(null);
    setMessage(reason);
  }, []);
  const getPages = useCallback(
    () =>
      Array.from(
        viewport.current?.querySelectorAll<HTMLElement>(
          "[data-performance-page]",
        ) ?? [],
      ),
    [],
  );
  const topOf = useCallback((page: HTMLElement) => {
    const area = viewport.current!;
    return (
      page.getBoundingClientRect().top -
      area.getBoundingClientRect().top +
      area.scrollTop
    );
  }, []);
  const seek = useCallback(
    (p: Position) => {
      const area = viewport.current,
        target = getPages().find(
          (el) => el.dataset.performancePage === p.pageId,
        );
      if (area && target)
        area.scrollTop = topOf(target) + p.fraction * target.offsetHeight;
    },
    [getPages, topOf],
  );
  const save = useRef(() => {});
  useEffect(() => {
    save.current = () => {
      try {
        localStorage.setItem(
          preferenceKey(score.id),
          JSON.stringify({ ...position.current, speed, zoom, delay }),
        );
      } catch {
        /* Device storage may be unavailable. */
      }
    };
    save.current();
  }, [score.id, speed, zoom, delay]);
  useEffect(() => {
    const flush = () => save.current();
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const leases = new Map<
      string,
      Awaited<ReturnType<(typeof import("@/lib/pdf"))["acquirePdf"]>>
    >();
    const images = new Set<HTMLImageElement>();
    async function prepare() {
      const ratios: number[] = [];
      for (const page of score.pages) {
        if (cancelled) return;
        if (page.type === "application/pdf") {
          const { acquirePdf } = await import("@/lib/pdf");
          if (cancelled) return;
          const url = pageUrl(page);
          if (!leases.has(url)) leases.set(url, acquirePdf(url));
          const document = await leases.get(url)!.task.promise;
          const pdfPage = await document.getPage(page.pdfPage || 1);
          const box = pdfPage.getViewport({
            scale: 1,
            rotation: (pdfPage.rotate + page.rotation) % 360,
          });
          ratios.push(box.width / box.height);
        } else {
          const image = new Image();
          images.add(image);
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("图片读取失败"));
            image.src = pageUrl(page);
          });
          ratios.push(
            page.rotation % 180
              ? image.naturalHeight / image.naturalWidth
              : image.naturalWidth / image.naturalHeight,
          );
          images.delete(image);
        }
        if (!cancelled) setLoaded(ratios.length);
      }
      if (!cancelled) setAspects(ratios);
    }
    void prepare().catch(() => {
      if (!cancelled)
        setLoadError("有页面暂时无法读取，请重试。原文件仍保留在曲谱库中。");
    });
    return () => {
      cancelled = true;
      leases.forEach((lease) => lease.release());
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      });
    };
  }, [score.pages, retry]);

  useEffect(() => {
    if (!aspects.length) return;
    const area = viewport.current!;
    if (!restored.current) {
      seek(position.current);
      restored.current = true;
    }
    let frame = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const pages = getPages();
      let index = 0;
      for (let i = 0; i < pages.length; i++) {
        if (topOf(pages[i]) <= area.scrollTop + 2) index = i;
        else break;
      }
      const target = pages[index];
      if (!target) return;
      position.current = {
        pageId: score.pages[index].id,
        fraction: Math.max(
          0,
          Math.min(1, (area.scrollTop - topOf(target)) / target.offsetHeight),
        ),
      };
      setCurrent(index);
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          save.current();
        }, 600);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    area.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      area.removeEventListener("scroll", onScroll);
    };
  }, [aspects, getPages, score.pages, seek, topOf]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        setRunning(true);
      } else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const toggle = useCallback(() => {
    if (running || countdown !== null) {
      pause();
      return;
    }
    if (!aspects.length) return;
    const area = viewport.current!;
    if (area.scrollHeight - area.clientHeight - area.scrollTop <= 1) {
      setMessage("已到谱尾 · 可回到起始页再练一次");
      return;
    }
    if (Number(delay)) setCountdown(Number(delay));
    else setRunning(true);
    setMessage("自动滚动中 · 空格暂停");
  }, [running, countdown, pause, aspects.length, delay]);

  useEffect(() => {
    if (!running) return;
    const area = viewport.current!;
    let frame = 0,
      last = performance.now(),
      preciseTop = area.scrollTop;
    let waiting = false;
    const tick = (now: number) => {
      const delta = Math.min(80, now - last);
      last = now;
      const next = preciseTop + (delta * speed) / 1000;
      const needed = getPages().filter((el) => {
        const top = topOf(el);
        return top < next + area.clientHeight && top + el.offsetHeight > next;
      });
      if (
        needed.some(
          (el) =>
            pageStates.current.get(el.dataset.performancePage!) === "error",
        )
      ) {
        pause("页面加载失败，重试这一页后再继续");
        return;
      }
      if (
        needed.some(
          (el) =>
            pageStates.current.get(el.dataset.performancePage!) !== "ready",
        )
      ) {
        if (!waiting) {
          setMessage("正在展开后续页面，准备好后继续滚动…");
          waiting = true;
        }
      } else {
        if (waiting) {
          setMessage("自动滚动中 · 空格暂停");
          waiting = false;
        }
        preciseTop = next;
        area.scrollTop = preciseTop;
        if (area.scrollTop >= area.scrollHeight - area.clientHeight - 1) {
          pause("已到谱尾 · 这一遍练习完成");
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, getPages, pause, topOf]);

  useEffect(() => {
    let disposed = false,
      sentinel: WakeLockSentinel | null = null;
    async function requestWake() {
      if (!navigator.wakeLock) {
        setWake("浏览器不支持常亮，请在设备设置中延长锁屏时间");
        return;
      }
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (disposed) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setWake("屏幕常亮中");
        lock.addEventListener("release", () => {
          if (!disposed) setWake("常亮已释放，请留意设备锁屏");
        });
      } catch {
        if (!disposed) setWake("未能保持常亮，请在设备设置中延长锁屏时间");
      }
    }
    const visibility = () => {
      if (document.hidden) {
        save.current();
        pause("已暂停 · 返回后从这里继续");
      } else if (!sentinel || sentinel.released) void requestWake();
    };
    void requestWake();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      void sentinel?.release();
    };
  }, [pause]);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    const resize = () => {
      pause("显示尺寸已变化 · 调整位置后继续");
      const p = { ...position.current };
      requestAnimationFrame(() => seek(p));
    };
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("resize", resize);
      if (ownedFullscreen.current && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, [pause, seek]);
  const step = useCallback(
    (direction: number) => {
      pause();
      const area = viewport.current;
      if (area) area.scrollTop += direction * area.clientHeight * 0.65;
    },
    [pause],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable=true],[role=combobox],[role=listbox],[role=slider],[role=menu]",
        )
      )
        return;
      if (event.code === "Space" && !target.closest("button")) {
        event.preventDefault();
        if (!event.repeat) toggle();
      } else if (
        ["PageDown", "ArrowDown", "ArrowRight"].includes(event.key) &&
        !target.closest("button")
      ) {
        event.preventDefault();
        if (!event.repeat) step(1);
      } else if (
        ["PageUp", "ArrowUp", "ArrowLeft"].includes(event.key) &&
        !target.closest("button")
      ) {
        event.preventDefault();
        if (!event.repeat) step(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, step]);
  function goTo(index: number) {
    setStartPage(index);
    pause("已定位 · 点击开始，准备演奏");
    seek({ pageId: score.pages[index].id, fraction: 0 });
    setCurrent(index);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        ownedFullscreen.current = true;
      }
    } catch {
      setMessage("浏览器未允许全屏，当前演奏视图仍可正常使用");
    }
  }
  function close() {
    save.current();
    onClose(current);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="performance-reader"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          viewport.current?.focus();
        }}
      >
        <header className="performance-header">
          <button
            className="icon-button"
            onClick={close}
            aria-label="退出演奏阅读"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="performance-title">
            <DialogTitle>{score.title}</DialogTitle>
            <DialogDescription>原谱演奏 · 连续阅读，无需翻页</DialogDescription>
          </div>
          <span className="performance-page-count">
            {current + 1} / {score.pages.length} 页
          </span>
          <button
            className="icon-button"
            aria-label={fullscreen ? "退出全屏" : "进入全屏"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </button>
        </header>
        <div className="performance-settings">
          <Choice
            label="演奏起始页"
            value={String(current)}
            onChange={(v) => goTo(Number(v))}
            options={score.pages.map((_, i) => ({
              value: String(i),
              label: "第 " + (i + 1) + " 页",
            }))}
          />
          <Choice
            label="演奏曲谱缩放"
            value={zoom}
            onChange={(v) => {
              pause("缩放已调整 · 点击继续演奏");
              const p = { ...position.current };
              setZoom(v);
              requestAnimationFrame(() => seek(p));
            }}
            options={[
              { value: "75", label: "75%" },
              { value: "100", label: "适合宽度" },
              { value: "125", label: "125%" },
              { value: "150", label: "150%" },
            ]}
          />
          <Choice
            label="开始倒计时"
            value={delay}
            onChange={(v) => {
              pause();
              setDelay(v);
            }}
            options={[
              { value: "0", label: "立即开始" },
              { value: "3", label: "准备 3 秒" },
              { value: "5", label: "准备 5 秒" },
            ]}
          />
          <span className="performance-wake">
            <Monitor size={14} />
            {wake}
          </span>
        </div>
        <div className="performance-stage">
          <div
            className="performance-scroll"
            ref={viewport}
            tabIndex={0}
            aria-label="连续原谱"
            onWheel={() => pause()}
            onPointerDown={() => pause()}
          >
            {loadError ? (
              <div className="performance-loading" role="alert">
                <p>{loadError}</p>
                <button
                  className="button secondary-button"
                  onClick={() => {
                    setLoadError("");
                    setLoaded(0);
                    setRetry((v) => v + 1);
                  }}
                >
                  重新加载原谱
                </button>
              </div>
            ) : !aspects.length ? (
              <div className="performance-loading" role="status">
                正在准备连续曲谱 · {loaded} / {score.pages.length} 页
              </div>
            ) : (
              <div
                className="performance-pages"
                style={{
                  width: zoom + "%",
                  maxWidth: (1280 * Number(zoom)) / 100,
                }}
              >
                {score.pages.map((p, i) => (
                  <PerformancePage
                    key={p.id}
                    page={p}
                    index={i}
                    aspect={aspects[i]}
                    root={viewport}
                    onState={recordState}
                  />
                ))}
                <div className="performance-end">
                  — 谱尾，慢慢收住最后一个音 —
                </div>
              </div>
            )}
          </div>
          {countdown !== null && (
            <div className="performance-countdown" role="status">
              <strong>{countdown}</strong>
              <span>准备演奏</span>
              <button
                className="button secondary-button"
                onClick={() => pause("已取消倒计时")}
              >
                取消
              </button>
            </div>
          )}
        </div>
        <footer className="performance-transport">
          <div className="performance-main-controls">
            <button
              className="button primary performance-play"
              disabled={!aspects.length || Boolean(loadError)}
              onClick={() => {
                toggle();
                viewport.current?.focus();
              }}
              aria-label={
                countdown !== null
                  ? "取消演奏倒计时"
                  : running
                    ? "暂停自动滚动"
                    : "开始自动滚动"
              }
            >
              {running || countdown !== null ? (
                <Pause size={18} />
              ) : (
                <Play size={18} />
              )}
              {countdown !== null
                ? "取消倒计时"
                : running
                  ? "暂停"
                  : "开始滚动"}
            </button>
            <button
              className="icon-button"
              disabled={!aspects.length}
              aria-label="回到起始页"
              onClick={() => goTo(startPage)}
            >
              <RotateCcw size={18} />
            </button>
            <div className="performance-speed">
              <span>
                滚动速度 <strong>{speed}</strong>
              </span>
              <SliderPrimitive.Root
                className="performance-speed-slider"
                min={2}
                max={90}
                step={1}
                value={[speed]}
                onValueChange={(v) => setSpeed(v[0])}
              >
                <SliderPrimitive.Track className="performance-speed-track">
                  <SliderPrimitive.Range className="performance-speed-range" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="performance-speed-thumb"
                  aria-label="演奏滚动速度"
                  aria-valuetext={speed + " 像素每秒"}
                />
              </SliderPrimitive.Root>
              <span>慢 → 快</span>
            </div>
            <div className="performance-step">
              <button
                className="icon-button"
                aria-label="向上移动半屏"
                onClick={() => step(-1)}
              >
                <ChevronUp size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="向下移动半屏"
                onClick={() => step(1)}
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>
          <div className="performance-status">
            <span role="status">{message}</span>
            <span>空格暂停 / 继续 · 方向键移谱 · 拖动即暂停</span>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
