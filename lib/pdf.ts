import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
export async function countPdf(file: File) {
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const count = doc.numPages;
  await task.destroy();
  return count;
}
export { pdfjs };
