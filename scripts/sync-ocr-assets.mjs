import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const destination = "public/ocr";
await mkdir(path.join(destination, "core"), { recursive: true });
await mkdir(path.join(destination, "lang"), { recursive: true });
await cp(
  "scripts/ocr-worker-entry.js",
  path.join(destination, "worker-entry.js"),
);
await cp(
  "node_modules/tesseract.js/dist/worker.min.js",
  path.join(destination, "worker.min.js"),
);
for (const file of await readdir("node_modules/tesseract.js-core")) {
  if (file.endsWith(".wasm.js") || file.endsWith(".wasm"))
    await cp(
      path.join("node_modules/tesseract.js-core", file),
      path.join(destination, "core", file),
    );
}
await cp(
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  path.join(destination, "lang", "eng.traineddata.gz"),
);
await cp(
  "node_modules/tesseract.js/LICENSE.md",
  path.join(destination, "LICENSE-tesseract-js.txt"),
);
await cp(
  "node_modules/tesseract.js-core/LICENSE",
  path.join(destination, "LICENSE-tesseract-core.txt"),
);
await cp(
  "node_modules/tesseract.js-core/LICENSE",
  path.join(destination, "LICENSE-english-model.txt"),
);
const js = JSON.parse(
  await readFile("node_modules/tesseract.js/package.json", "utf8"),
);
const core = JSON.parse(
  await readFile("node_modules/tesseract.js-core/package.json", "utf8"),
);
await writeFile(
  path.join(destination, "NOTICE.txt"),
  `Tesseract.js ${js.version} and Tesseract.js-core ${core.version}: Apache License 2.0.\nEnglish traineddata: @tesseract.js-data/eng 1.0.0, 4.0.0_best_int; Apache License 2.0 (naptha/tessdata).\nUpstream: https://github.com/naptha/tesseract.js\nLanguage data: https://github.com/naptha/tessdata\nAll recognition assets are served from this application; no score images are uploaded for recognition.\n`,
);
console.log(
  `OCR worker, core ${core.version}, English model and licenses synchronized.`,
);
