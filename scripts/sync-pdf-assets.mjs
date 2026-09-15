import { cp, mkdir } from "node:fs/promises";
const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const target = new URL("../public/pdf/", import.meta.url);
await mkdir(target, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(new URL(directory, source), new URL(directory, target), {
    recursive: true,
  });
}
await cp(
  new URL("build/pdf.worker.min.mjs", source),
  new URL("pdf.worker.min.mjs", target),
);
await cp(new URL("LICENSE", source), new URL("LICENSE", target));
console.log("PDF.js worker, resources and license synced.");
