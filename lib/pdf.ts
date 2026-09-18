import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
export async function countPdf(file: File) {
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    return doc.numPages;
  } finally {
    await task.destroy();
  }
}
export { pdfjs };

// Share a document across the original reader and nearby performance canvases.
type PdfEntry = {
  task: ReturnType<typeof pdfjs.getDocument>;
  users: number;
  timer?: ReturnType<typeof setTimeout>;
};
const documents = new Map<string, PdfEntry>();
export function acquirePdf(url: string) {
  let entry = documents.get(url);
  if (!entry) {
    entry = {
      task: pdfjs.getDocument({
        url,
        cMapUrl: "/pdf/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf/standard_fonts/",
        wasmUrl: "/pdf/wasm/",
      }),
      users: 0,
    };
    documents.set(url, entry);
    const created = entry;
    void entry.task.promise.catch(() => {
      if (documents.get(url) === created) documents.delete(url);
    });
  }
  clearTimeout(entry.timer);
  entry.users++;
  const retained = entry;
  let released = false;
  return {
    task: retained.task,
    release() {
      if (released) return;
      released = true;
      if (--retained.users === 0)
        retained.timer = setTimeout(() => {
          if (documents.get(url) === retained) documents.delete(url);
          void retained.task.destroy().catch(() => {});
        }, 1500);
    },
  };
}
