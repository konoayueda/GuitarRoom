"use client";
import {
  analyseTabGeometry,
  recognitionBeatCount,
  chordLabelsForBar,
  type RecognizedBar,
  type RecognizedNote,
} from "./recognition";
import { type Arrangement } from "./arrangement";
import type { Worker } from "tesseract.js";

function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("识别已取消", "AbortError");
}
export async function recognizeTab(
  canvas: HTMLCanvasElement,
  meter: Arrangement["meter"],
  signal: AbortSignal,
  onProgress: (text: string, progress: number) => void,
) {
  cancelled(signal);
  onProgress("正在查找六条弦线和小节边界…", 0.05);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const geometry = analyseTabGeometry(
    context.getImageData(0, 0, canvas.width, canvas.height),
  );
  const { width, height, gap, lines, boundaries, glyphs, ink, gray } = geometry;
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  cancelled(signal);
  let worker: Worker | undefined;
  let released = false,
    channelReady = false;
  const channelId = "guitar-ocr-" + crypto.randomUUID();
  const channel = new BroadcastChannel(channelId);
  let rejectFailure: (error: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  const failure = () =>
    rejectFailure(
      new Error(
        "识别资源加载或运行失败，请检查网络后重新框选。如果反复失败，请刷新页面再试。",
      ),
    );
  const timeout = setTimeout(failure, 45000);
  channel.onmessage = (event) => {
    if (event.data?.type === "ready") {
      channelReady = true;
      if (released) {
        channel.postMessage("cancel");
        channel.close();
      }
    } else if (event.data?.type === "error") failure();
  };
  function release() {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    if (worker) void worker.terminate().catch(() => {});
    channel.postMessage("cancel");
    if (channelReady) channel.close();
    else setTimeout(() => channel.close(), 45000);
  }
  let rejectAbort: (error: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const stop = () => {
    rejectAbort(new DOMException("识别已取消", "AbortError"));
    release();
  };
  signal.addEventListener("abort", stop, { once: true });
  // Keep initialization failures observable even when the user cancels first.
  const creating = createWorker(
    "eng",
    OEM.LSTM_ONLY,
    {
      workerPath: "/ocr/worker-entry.js?channel=" + channelId,
      workerBlobURL: false,
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
      logger: () => {
        if (!worker && !signal.aborted)
          onProgress("正在准备识别，首次打开需要稍等…", 0.12);
      },
      errorHandler: failure,
    },
    {
      load_system_dawg: "0",
      load_freq_dawg: "0",
      load_number_dawg: "0",
      load_punc_dawg: "0",
    },
  );
  void creating
    .then((w) => {
      if (released || signal.aborted) void w.terminate().catch(() => {});
    })
    .catch(() => {});
  try {
    worker = await Promise.race([creating, aborted, failed]);
    clearTimeout(timeout);
    cancelled(signal);
    await Promise.race([
      worker.setParameters({
        tessedit_char_whitelist: "0123456789xX",
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
        user_defined_dpi: "300",
      }),
      aborted,
      failed,
    ]);
    cancelled(signal);
    const notes: RecognizedNote[] = [];
    for (let i = 0; i < glyphs.length; i++) {
      cancelled(signal);
      const box = glyphs[i],
        bw = box.x1 - box.x0 + 1,
        bh = box.y1 - box.y0 + 1;
      const source = document.createElement("canvas");
      source.width = bw;
      source.height = bh;
      const sc = source.getContext("2d")!,
        pixels = sc.createImageData(bw, bh);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const at = (y * bw + x) * 4,
            v = ink[(box.y0 + y) * width + box.x0 + x]
              ? gray[(box.y0 + y) * width + box.x0 + x]
              : 255;
          pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = v;
          pixels.data[at + 3] = 255;
        }
      sc.putImageData(pixels, 0, 0);
      const tile = document.createElement("canvas"),
        scale = 45 / bh;
      tile.width = Math.max(60, Math.round(bw * scale) + 28);
      tile.height = 73;
      const tc = tile.getContext("2d")!;
      tc.fillStyle = "#fff";
      tc.fillRect(0, 0, tile.width, tile.height);
      tc.drawImage(source, (tile.width - bw * scale) / 2, 14, bw * scale, 45);
      const result = await Promise.race([
        worker.recognize(tile, {}, { text: true, blocks: true }),
        aborted,
        failed,
      ]);
      cancelled(signal);
      const text = result.data.text.trim().replace(/\s/g, ""),
        symbols = (result.data.blocks ?? []).flatMap((b) =>
          b.paragraphs.flatMap((p) =>
            p.lines.flatMap((l) => l.words.flatMap((w) => w.symbols)),
          ),
        );
      const confidence = symbols.length
        ? Math.min(...symbols.map((s) => s.confidence))
        : result.data.confidence;
      const valid = /^\d{1,2}$/.test(text) && Number(text) <= 24;
      notes.push({
        id: crypto.randomUUID(),
        x: box.x0 / width,
        y: box.y0 / height,
        w: bw / width,
        h: bh / height,
        stringIndex: box.stringIndex,
        fret: valid ? Number(text) : null,
        ...(/^[xX]$/.test(text) ? { marker: "cross" as const } : {}),
        tick: null,
        confidence: Math.round(confidence || 0),
        reviewed: valid && confidence >= 80,
      });
      onProgress(
        `正在读取音符 ${i + 1} / ${glyphs.length}…`,
        0.2 + (0.65 * (i + 1)) / glyphs.length,
      );
    }
    const bars: RecognizedBar[] = boundaries.slice(0, -1).map((x, i) => ({
      id: crypto.randomUUID(),
      x: x / width,
      w: (boundaries[i + 1] - x) / width,
      chordName: "",
      notes: notes.filter(
        (n) =>
          n.x + n.w / 2 >= x / width &&
          n.x + n.w / 2 < boundaries[i + 1] / width,
      ),
      rhythmConfirmed: false,
      notesConfirmed: false,
    }));
    for (const bar of bars) {
      const centers: number[] = [];
      for (const n of [...bar.notes].sort(
        (a, b) => a.x + a.w / 2 - b.x - b.w / 2,
      )) {
        const center = n.x + n.w / 2;
        if (!centers.length || center - centers.at(-1)! > (gap * 0.7) / width)
          centers.push(center);
      }
      for (const n of bar.notes) {
        const center = n.x + n.w / 2;
        let nearest = 0;
        for (let i = 1; i < centers.length; i++)
          if (
            Math.abs(centers[i] - center) < Math.abs(centers[nearest] - center)
          )
            nearest = i;
        n.tick =
          centers.length <= recognitionBeatCount(meter)
            ? Math.floor(
                (nearest * recognitionBeatCount(meter)) / centers.length,
              )
            : null;
      }
      bar.notes.sort(
        (a, b) =>
          (a.tick ?? 99) - (b.tick ?? 99) || b.stringIndex - a.stringIndex,
      );
    }
    onProgress("正在核对小节上方的和弦标记…", 0.9);
    const top = Math.max(0, Math.floor(lines[0] - gap * 2.7)),
      bottom = Math.max(0, Math.floor(lines[0] - gap * 0.35));
    if (bottom - top >= 8) {
      const header = document.createElement("canvas");
      header.width = width;
      header.height = bottom - top + 20;
      const hc = header.getContext("2d")!;
      hc.fillStyle = "#fff";
      hc.fillRect(0, 0, header.width, header.height);
      hc.drawImage(
        canvas,
        0,
        top,
        width,
        bottom - top,
        0,
        10,
        width,
        bottom - top,
      );
      await Promise.race([
        worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGabcdefgMm0123456789#b+/()suj",
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        }),
        aborted,
        failed,
      ]);
      cancelled(signal);
      const result = await Promise.race([
        worker.recognize(header, {}, { text: true, blocks: true }),
        aborted,
        failed,
      ]);
      cancelled(signal);
      const words = (result.data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
      );
      for (const bar of bars)
        Object.assign(
          bar,
          chordLabelsForBar(
            bar,
            words.map((word) => ({
              text: word.text,
              x: (word.bbox.x0 + word.bbox.x1) / 2 / width,
            })),
          ),
        );
    }
    const warnings = [
      "拍点按音符列均匀排布，仅作为节奏草稿；请对照原谱确认，不能据此判断复杂时值。",
    ];
    if (bars.some((b) => b.chordChanges?.length))
      warnings.push(
        "检测到小节内换和弦，请逐项核对换和弦拍点；加入编排后会按这些拍点拆分。",
      );
    if (notes.some((n) => n.marker === "cross"))
      warnings.push(
        "× 按当前和弦拨对应弦；请在校正中选定原谱使用的和弦按法，数字则按标出的品位弹奏。",
      );
    if (notes.some((n) => !n.reviewed))
      warnings.push("有数字把握不足，已用橙色标出，请逐一核对。");
    if (bars.some((b) => !b.notes.length))
      warnings.push(
        "部分小节没有读到数字，请确认是否为空拍，或补入遗漏的音符。",
      );
    if (notes.some((n) => n.tick === null))
      warnings.push(
        "有小节超过当前拍号的八分拍点数量，请人工调整，加入编排后可用细分网格调整十六分音符和三连音。",
      );
    onProgress("片段已读出，接下来请对照校正。", 1);
    return { bars, warnings };
  } finally {
    signal.removeEventListener("abort", stop);
    release();
  }
}
