"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { pageUrl, type ScorePage } from "@/lib/models";

export default function ScoreCanvas({
  page,
  onReady,
  onLoading,
}: {
  page: ScorePage;
  onReady?: () => void;
  onLoading?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onReady, onLoading });
  useEffect(() => {
    callbacks.current = { onReady, onLoading };
  }, [onReady, onLoading]);
  const pdfTask = useRef<PDFDocumentLoadingTask | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const source = pageUrl(page);

  // Keep the PDF document across page turns; release it when leaving this file.
  useEffect(
    () => () => {
      void pdfTask.current?.destroy();
      pdfTask.current = null;
    },
    [source, page.type, retry],
  );

  useEffect(() => {
    let stopped = false;
    let cancelRender = () => {};
    // Canvas decoding and painting are an external asynchronous lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    callbacks.current.onLoading?.();
    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器无法显示曲谱。");
      if (page.type === "application/pdf") {
        const { pdfjs } = await import("@/lib/pdf");
        if (stopped) return;
        pdfTask.current ??= pdfjs.getDocument({
          url: source,
          cMapUrl: "/pdf/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf/standard_fonts/",
          wasmUrl: "/pdf/wasm/",
        });
        const doc = await pdfTask.current.promise;
        if (stopped) return;
        const pdfPage = await doc.getPage(page.pdfPage || 1);
        if (stopped) return;
        const viewport = pdfPage.getViewport({
          scale: 1.4,
          rotation: (pdfPage.rotate + page.rotation) % 360,
        });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const rendering = pdfPage.render({
          canvasContext: ctx,
          canvas,
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
        const factor = Math.min(
          1,
          1800 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const w = image.naturalWidth * factor,
          h = image.naturalHeight * factor;
        canvas.width = sideways ? h : w;
        canvas.height = sideways ? w : h;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((page.rotation * Math.PI) / 180);
        ctx.drawImage(image, -w / 2, -h / 2, w, h);
      }
      if (!stopped) {
        setLoading(false);
        callbacks.current.onReady?.();
      }
    }
    void render().catch(() => {
      if (!stopped) {
        setError("这页曲谱暂时无法显示，请重试或导出原文件。");
        setLoading(false);
      }
    });
    return () => {
      stopped = true;
      cancelRender();
    };
  }, [source, page.id, page.pdfPage, page.rotation, page.type, retry]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="score-canvas"
        style={{ visibility: loading || error ? "hidden" : "visible" }}
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
