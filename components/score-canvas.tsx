"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import type { RecognitionRect } from "@/lib/recognition";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { pageUrl, type ScorePage } from "@/lib/models";

// Bound memory while keeping ordinary pages sharp on high-density screens.
function surfaceSize(width: number, aspect: number) {
  const height = width / aspect;
  const factor = Math.min(
    1,
    8192 / width,
    8192 / height,
    Math.sqrt(16_000_000 / (width * height)),
  );
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}
export type ScoreCanvasHandle = {
  thumbnail: (
    pageNumber: number,
    rotation: number,
    signal: AbortSignal,
  ) => Promise<string>;
  capture: (
    rect: RecognitionRect,
    signal: AbortSignal,
  ) => Promise<HTMLCanvasElement>;
};
export default function ScoreCanvas({
  page,
  onReady,
  onLoading,
  onError,
  ref,
}: {
  page: ScorePage;
  ref?: Ref<ScoreCanvasHandle>;
  onReady?: () => void;
  onLoading?: () => void;
  onError?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onReady, onLoading, onError });
  useEffect(() => {
    callbacks.current = { onReady, onLoading, onError };
  }, [onReady, onLoading, onError]);
  const pdfTask = useRef<PDFDocumentLoadingTask | null>(null);
  const releasePdf = useRef<(() => void) | null>(null);
  const painted = useRef("");
  const [paintedPage, setPaintedPage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [pixelWidth, setPixelWidth] = useState(0);
  const source = pageUrl(page);
  const pageKey = JSON.stringify([
    source,
    page.id,
    page.pdfPage,
    page.rotation,
    retry,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer: ReturnType<typeof setTimeout>;
    let resolution: MediaQueryList;
    const measure = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = canvas.getBoundingClientRect().width;
        if (width > 0)
          setPixelWidth(Math.ceil(width * (window.devicePixelRatio || 1)));
      }, 80);
    };
    const watchResolution = () => {
      resolution?.removeEventListener("change", watchResolution);
      resolution = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      resolution.addEventListener("change", watchResolution);
      measure();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener("resize", measure);
    watchResolution();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      resolution.removeEventListener("change", watchResolution);
      window.removeEventListener("resize", measure);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async capture(rect, signal) {
        if (
          rect.w <= 0 ||
          rect.h <= 0 ||
          rect.x < 0 ||
          rect.y < 0 ||
          rect.x + rect.w > 1.001 ||
          rect.y + rect.h > 1.001
        )
          throw new Error("框选范围无效，请重新框选。");
        signal.throwIfAborted();
        const result = document.createElement("canvas"),
          ctx = result.getContext("2d")!;
        if (page.type === "application/pdf") {
          const task = pdfTask.current;
          if (!task) throw new Error("请等曲谱显示完成，再开始框选。");
          const doc = await task.promise;
          signal.throwIfAborted();
          const pdfPage = await doc.getPage(page.pdfPage || 1);
          signal.throwIfAborted();
          const rotation = (pdfPage.rotate + page.rotation) % 360,
            base = pdfPage.getViewport({ scale: 1, rotation });
          const scale = Math.min(
            1800 / (base.width * rect.w),
            1400 / (base.height * rect.h),
          );
          const viewport = pdfPage.getViewport({ scale, rotation });
          result.width = Math.max(1, Math.ceil(viewport.width * rect.w));
          result.height = Math.max(1, Math.ceil(viewport.height * rect.h));
          const rendering = pdfPage.render({
            canvas: result,
            canvasContext: ctx,
            viewport,
            transform: [
              1,
              0,
              0,
              1,
              -rect.x * viewport.width,
              -rect.y * viewport.height,
            ],
          });
          const cancel = () => rendering.cancel();
          signal.addEventListener("abort", cancel, { once: true });
          try {
            await rendering.promise;
          } finally {
            signal.removeEventListener("abort", cancel);
          }
        } else {
          const image = new Image();
          image.src = source;
          await image.decode();
          signal.throwIfAborted();
          const sideways = page.rotation % 180 !== 0,
            bw = sideways ? image.naturalHeight : image.naturalWidth,
            bh = sideways ? image.naturalWidth : image.naturalHeight;
          const scale = Math.min(1800 / (bw * rect.w), 1400 / (bh * rect.h)),
            fw = bw * scale,
            fh = bh * scale;
          result.width = Math.max(1, Math.ceil(fw * rect.w));
          result.height = Math.max(1, Math.ceil(fh * rect.h));
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, result.width, result.height);
          ctx.translate(fw / 2 - rect.x * fw, fh / 2 - rect.y * fh);
          ctx.rotate((page.rotation * Math.PI) / 180);
          ctx.drawImage(
            image,
            (-image.naturalWidth * scale) / 2,
            (-image.naturalHeight * scale) / 2,
            image.naturalWidth * scale,
            image.naturalHeight * scale,
          );
        }
        signal.throwIfAborted();
        return result;
      },
      async thumbnail(pageNumber, rotation, signal) {
        signal.throwIfAborted();
        const task = pdfTask.current;
        if (!task) throw new Error("PDF 尚未就绪");
        const doc = await task.promise;
        signal.throwIfAborted();
        const pdfPage = await doc.getPage(pageNumber);
        signal.throwIfAborted();
        const base = pdfPage.getViewport({
          scale: 1,
          rotation: (pdfPage.rotate + rotation) % 360,
        });
        const viewport = pdfPage.getViewport({
          scale: Math.min(160 / base.width, 190 / base.height),
          rotation: (pdfPage.rotate + rotation) % 360,
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const rendering = pdfPage.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        const cancel = () => rendering.cancel();
        signal.addEventListener("abort", cancel, { once: true });
        try {
          await rendering.promise;
          signal.throwIfAborted();
          return canvas.toDataURL("image/jpeg", 0.8);
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      },
    }),
    [page.pdfPage, page.rotation, page.type, source],
  );

  // Resizing reuses the document and its downloaded pages.
  useEffect(
    () => () => {
      releasePdf.current?.();
      releasePdf.current = null;
      pdfTask.current = null;
    },
    [source, page.type, retry],
  );

  useEffect(() => {
    if (!pixelWidth) return;
    let stopped = false;
    let cancelRender = () => {};
    if (painted.current !== pageKey) {
      // Decoding and painting are an external asynchronous lifecycle.
      setLoading(true);
      callbacks.current.onLoading?.();
    }
    // Reset the result of the previous asynchronous render before retrying.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
    async function render() {
      // Paint offscreen so a cancelled PDF render cannot clear a newer frame.
      const buffer = document.createElement("canvas");
      const ctx = buffer.getContext("2d");
      if (!ctx) throw new Error("当前浏览器无法显示曲谱。");
      if (page.type === "application/pdf") {
        const { acquirePdf } = await import("@/lib/pdf");
        if (stopped) return;
        if (!pdfTask.current) {
          const lease = acquirePdf(source);
          pdfTask.current = lease.task;
          releasePdf.current = lease.release;
        }
        const doc = await pdfTask.current.promise;
        if (stopped) return;
        const pdfPage = await doc.getPage(page.pdfPage || 1);
        if (stopped) return;
        const rotation = (pdfPage.rotate + page.rotation) % 360;
        const base = pdfPage.getViewport({ scale: 1, rotation });
        const size = surfaceSize(pixelWidth, base.width / base.height);
        const viewport = pdfPage.getViewport({
          scale: size.width / base.width,
          rotation,
        });
        buffer.width = size.width;
        buffer.height = Math.ceil(viewport.height);
        const rendering = pdfPage.render({
          canvasContext: ctx,
          canvas: buffer,
          viewport,
        });
        cancelRender = () => rendering.cancel();
        await rendering.promise;
      } else {
        const image = new Image();
        image.src = source;
        await image.decode();
        if (stopped) return;
        const sideways = page.rotation % 180 !== 0;
        const aspect = sideways
          ? image.naturalHeight / image.naturalWidth
          : image.naturalWidth / image.naturalHeight;
        const size = surfaceSize(pixelWidth, aspect);
        buffer.width = size.width;
        buffer.height = size.height;
        const w = sideways ? size.height : size.width;
        const h = sideways ? size.width : size.height;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.translate(size.width / 2, size.height / 2);
        ctx.rotate((page.rotation * Math.PI) / 180);
        ctx.drawImage(image, -w / 2, -h / 2, w, h);
      }
      const canvas = canvasRef.current;
      if (stopped || !canvas) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.getContext("2d")!.drawImage(buffer, 0, 0);
      painted.current = pageKey;
      setPaintedPage(pageKey);
      setLoading(false);
      callbacks.current.onReady?.();
    }
    void render().catch(() => {
      if (!stopped) {
        callbacks.current.onLoading?.();
        setError("这页曲谱暂时无法显示，请重试或导出原文件。");
        setLoading(false);
        callbacks.current.onError?.();
      }
    });
    return () => {
      stopped = true;
      cancelRender();
    };
  }, [source, pageKey, page.pdfPage, page.rotation, page.type, pixelWidth]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="score-canvas"
        data-ready={!loading && !error && paintedPage === pageKey}
        style={{
          visibility:
            loading || error || paintedPage !== pageKey ? "hidden" : "visible",
        }}
        aria-label={
          page.name + (page.pdfPage ? " · 第 " + page.pdfPage + " 页" : "")
        }
      />
      {loading && (
        <div className="canvas-message" role="status">
          正在展开曲谱…
        </div>
      )}
      {error && (
        <div className="canvas-message error" role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>重新加载这一页</button>
        </div>
      )}
    </>
  );
}
