import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a value.`);
  return value;
}
const known = new Set([
  "--skip-build",
  "--replace",
  "--no-zip",
  "--node",
  "--node-license",
  "--vc-runtime-dir",
  "--help",
]);
for (let index = 0; index < args.length; index++) {
  if (!known.has(args[index]))
    throw new Error(`Unknown option: ${args[index]}`);
  if (["--node", "--node-license", "--vc-runtime-dir"].includes(args[index]))
    index++;
}
if (args.includes("--help")) {
  console.log(
    "Build the Windows x64 offline package: node scripts/package-local.mjs [--skip-build] [--replace] [--no-zip] [--node path] [--node-license path] [--vc-runtime-dir path]",
  );
  process.exit(0);
}
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error(
    "Build this package on Windows x64, with its installed Windows runtime dependencies.",
  );
const pkg = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const outputRoot = path.join(root, "outputs");
const name = `GuitarRoom-${pkg.version}-windows-x64`;
const destination = path.join(outputRoot, name);
const marker = ".guitar-room-package";
await fs.mkdir(outputRoot, { recursive: true });
async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
if (await exists(destination)) {
  if (!args.includes("--replace"))
    throw new Error(
      `${destination} already exists. Stop its local app, then use --replace to rebuild this generated package.`,
    );
  const resolvedOutput = await fs.realpath(outputRoot);
  const resolvedDestination = await fs.realpath(destination);
  const isGenerated = await fs
    .readFile(path.join(destination, marker), "utf8")
    .catch(() => "");
  if (
    path.dirname(resolvedDestination) !== resolvedOutput ||
    isGenerated !== "GuitarRoom generated application package\n"
  )
    throw new Error(
      "Refusing to replace a directory outside generated outputs.",
    );
  await fs.rm(resolvedDestination, { recursive: true, force: true });
}
function runNode(script, parameters = []) {
  const result = spawnSync(process.execPath, [script, ...parameters], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(script)} failed (${result.status ?? result.error.message}).`,
    );
}
if (!args.includes("--skip-build")) {
  runNode(path.join(root, "node_modules/typescript/bin/tsc"), ["--noEmit"]);
  runNode(path.join(root, "scripts/run-framework.mjs"), ["build"]);
}
for (const file of [
  "dist/server/wrangler.json",
  "dist/server/index.js",
  "dist/client/pdf/pdf.worker.min.mjs",
  "scripts/local-app.mjs",
]) {
  if (!(await exists(path.join(root, file))))
    throw new Error(`Missing build input: ${file}`);
}
const runtimeNode = path.resolve(option("--node") ?? process.execPath);
const nodeCheck = spawnSync(
  runtimeNode,
  [
    "-p",
    "JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})",
  ],
  { encoding: "utf8", windowsHide: true },
);
if (nodeCheck.error || nodeCheck.status !== 0)
  throw new Error("Could not inspect the embedded Node executable.");
const nodeInfo = JSON.parse(nodeCheck.stdout.trim());
if (
  nodeInfo.platform !== "win32" ||
  nodeInfo.arch !== "x64" ||
  Number(nodeInfo.version.split(".")[0]) < 22
)
  throw new Error(
    "The embedded runtime must be Node.js 22.13+ for Windows x64.",
  );
if (
  nodeInfo.version.startsWith("22.") &&
  Number(nodeInfo.version.split(".")[1]) < 13
)
  throw new Error("Node.js 22.13+ is required.");
const nodeLicense = path.resolve(
  option("--node-license") ??
    path.join(root, `licenses/node-v${nodeInfo.version}-LICENSE.txt`),
);
if (!(await exists(nodeLicense)))
  throw new Error(
    `Provide the official LICENSE matching Node.js ${nodeInfo.version} using --node-license. Packaging never downloads it automatically.`,
  );
const licenseContent = await fs.readFile(nodeLicense, "utf8");
if (!licenseContent.includes("Node.js is licensed for use as follows:"))
  throw new Error("Invalid Node.js LICENSE.");
await fs.mkdir(destination, { recursive: true });
await fs.writeFile(
  path.join(destination, marker),
  "GuitarRoom generated application package\n",
);
console.log(`Preparing ${name}...`);
for (const relative of ["dist/server", "dist/client", "drizzle"]) {
  await fs.cp(path.join(root, relative), path.join(destination, relative), {
    recursive: true,
  });
}
await fs.mkdir(path.join(destination, "runtime"), { recursive: true });
await fs.copyFile(runtimeNode, path.join(destination, "runtime/node.exe"));
await fs.copyFile(nodeLicense, path.join(destination, "runtime/LICENSE.txt"));
await fs.mkdir(path.join(destination, "scripts"), { recursive: true });
// Copy only the launcher and its own helpers; build tools never run on a friend's PC.
for (const entry of await fs.readdir(path.join(root, "scripts"))) {
  if (entry === "local-app.mjs" || /^local-runtime-.*\.mjs$/.test(entry))
    await fs.copyFile(
      path.join(root, "scripts", entry),
      path.join(destination, "scripts", entry),
    );
}

// Preserve npm's nested package placement so multiple native binary versions resolve correctly.
const copied = new Map();
async function locate(name, from) {
  let directory = from;
  while (directory === root || directory.startsWith(root + path.sep)) {
    const candidate = path.join(directory, "node_modules", name);
    if (await exists(path.join(candidate, "package.json"))) return candidate;
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  return undefined;
}
function matchesPlatform(values, current) {
  if (!values) return true;
  const choices = Array.isArray(values) ? values : [values];
  if (choices.includes(`!${current}`)) return false;
  const positive = choices.filter((value) => !value.startsWith("!"));
  return positive.length === 0 || positive.includes(current);
}
async function copyDependency(source, optional = false) {
  if (copied.has(source)) return;
  const metadata = JSON.parse(
    await fs.readFile(path.join(source, "package.json"), "utf8"),
  );
  if (
    !matchesPlatform(metadata.os, "win32") ||
    !matchesPlatform(metadata.cpu, "x64")
  ) {
    if (optional) return;
    throw new Error(`Incompatible runtime dependency: ${metadata.name}`);
  }
  const relative = path.relative(root, source);
  if (
    !relative.startsWith("node_modules" + path.sep) ||
    relative.includes(".." + path.sep)
  )
    throw new Error("Dependency is outside the project: " + source);
  copied.set(source, {
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? "See package license",
    path: relative.replaceAll(path.sep, "/"),
  });
  await fs.cp(source, path.join(destination, relative), {
    recursive: true,
    filter: (file) =>
      !path.relative(source, file).split(path.sep).includes("node_modules"),
  });
  for (const name of Object.keys(metadata.dependencies ?? {})) {
    const isOptional = Object.hasOwn(metadata.optionalDependencies ?? {}, name);
    const dependency = await locate(name, source);
    if (!dependency) {
      if (isOptional) continue;
      throw new Error(`Missing ${metadata.name} dependency: ${name}`);
    }
    await copyDependency(dependency, isOptional);
  }
  for (const name of Object.keys(metadata.optionalDependencies ?? {})) {
    const dependency = await locate(name, source);
    if (dependency) await copyDependency(dependency, true);
  }
}
const wranglerPath = await locate("wrangler", root);
if (!wranglerPath)
  throw new Error(
    "Wrangler is missing. Install the project dependencies before packaging.",
  );
await copyDependency(wranglerPath);
for (const relative of [
  "node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe",
  "node_modules/wrangler/bin/wrangler.js",
]) {
  if (!(await exists(path.join(destination, relative))))
    throw new Error(`Package is missing required executable: ${relative}`);
}
// Use unmodified release CRT binaries from Visual Studio's Redistributable
// directory, rather than relying on the publisher's Windows/System32 libraries.
const crtRequired = [
  "msvcp140.dll",
  "msvcp140_atomic_wait.dll",
  "vcruntime140.dll",
  "vcruntime140_1.dll",
];
async function directories(parent) {
  return (await fs.readdir(parent, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
async function findCrtDirectory() {
  const configured = option("--vc-runtime-dir");
  if (configured) return path.resolve(configured);
  const candidates = [];
  for (const programFiles of new Set(
    [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
      Boolean,
    ),
  )) {
    const visualStudio = path.join(programFiles, "Microsoft Visual Studio");
    for (const generation of await directories(visualStudio)) {
      for (const edition of await directories(
        path.join(visualStudio, generation),
      )) {
        const redist = path.join(
          visualStudio,
          generation,
          edition,
          "VC",
          "Redist",
          "MSVC",
        );
        for (const version of await directories(redist)) {
          if (!/^\d+\.\d+\./.test(version)) continue;
          const x64 = path.join(redist, version, "x64");
          for (const folder of await directories(x64)) {
            if (/^Microsoft\.VC\d+\.CRT$/i.test(folder))
              candidates.push({ version, folder: path.join(x64, folder) });
          }
        }
      }
    }
  }
  candidates.sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
  for (const candidate of candidates)
    if (
      (
        await Promise.all(
          crtRequired.map((file) => exists(path.join(candidate.folder, file))),
        )
      ).every(Boolean)
    )
      return candidate.folder;
  throw new Error(
    "Windows app-local CRT is required. Supply a licensed Visual Studio release VC/Redist/MSVC/<version>/x64/Microsoft.VC*.CRT directory with --vc-runtime-dir. Do not use debug or Windows/System32 copies.",
  );
}
const crtDirectory = await findCrtDirectory();
if (/debug_nonredist|[\\/]System32(?:[\\/]|$)/i.test(crtDirectory))
  throw new Error("Only release Redistributable CRT binaries can be packaged.");
for (const file of crtRequired)
  if (!(await exists(path.join(crtDirectory, file))))
    throw new Error(`Required Windows CRT DLL is missing: ${file}`);
const windowsCrt = {
  deployment: "app-local",
  source: "Visual Studio release Redistributable CRT",
  version: path.basename(path.dirname(path.dirname(crtDirectory))),
  redistribution:
    "https://learn.microsoft.com/en-us/visualstudio/releases/2026/redistribution",
  deploymentDocs:
    "https://learn.microsoft.com/en-us/cpp/windows/deployment-in-visual-cpp",
  files: [],
};
for (const entry of await fs.readdir(crtDirectory)) {
  if (!/\.dll$/i.test(entry)) continue;
  const input = path.join(crtDirectory, entry),
    bytes = await fs.readFile(input);
  const header = bytes.length > 64 ? bytes.readUInt32LE(0x3c) : bytes.length;
  if (
    header + 6 >= bytes.length ||
    bytes.toString("ascii", header, header + 4) !== "PE\0\0" ||
    bytes.readUInt16LE(header + 4) !== 0x8664
  )
    throw new Error(`CRT DLL must be Windows x64: ${entry}`);
  // The Node application directory also supplies DLLs to native addons.
  for (const folder of [
    "runtime",
    "node_modules/@cloudflare/workerd-windows-64/bin",
  ])
    await fs.copyFile(input, path.join(destination, folder, entry));
  windowsCrt.files.push({
    name: entry,
    sha256: await sha256(input),
    bytes: bytes.length,
  });
}
await fs.writeFile(
  path.join(destination, "runtime/MICROSOFT-VC-NOTICE.txt"),
  `Microsoft Visual C++ v14 Runtime\nCopyright Microsoft Corporation. All rights reserved.\n\nUnmodified x64 release Redistributable CRT files are deployed locally with Node.js and workerd. These files are sourced from Visual Studio's VC/Redist/MSVC directory, not from the Windows system directory.\n\nRedistribution and license information: ${windowsCrt.redistribution}\nLocal deployment: ${windowsCrt.deploymentDocs}\nThe packaged application version supplies updates for these local DLLs.\n\nFiles: ${windowsCrt.files.map((file) => file.name).join(", ")}\n`,
);
console.log(`Included ${windowsCrt.files.length} app-local Windows CRT DLLs.`);

await fs.writeFile(
  path.join(destination, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      type: "module",
      engines: pkg.engines,
    },
    null,
    2,
  ) + "\n",
);

// Include licenses for compiled application code as well as the local runtime.
await fs.cp(
  path.join(root, "licenses"),
  path.join(destination, "licenses/bundled"),
  {
    recursive: true,
    filter: (file) =>
      !path
        .relative(path.join(root, "licenses"), file)
        .split(path.sep)
        .includes("acquisition-cache"),
  },
);
const notices = [];
const lock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);
for (const relative of Object.keys(lock.packages ?? {}).sort()) {
  if (!relative.startsWith("node_modules/")) continue;
  const source = path.join(root, relative);
  if (!(await exists(path.join(source, "package.json")))) continue;
  const metadata = JSON.parse(
    await fs.readFile(path.join(source, "package.json"), "utf8"),
  );
  const safeName = `${metadata.name.replaceAll("/", "_").replaceAll("@", "")}-${metadata.version}`;
  const files = [];
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /^(licen[sc]e|copying|notice|authors)(\.|$|-)/i.test(entry.name)
    ) {
      const output = path.join("licenses", safeName, entry.name);
      await fs.mkdir(path.dirname(path.join(destination, output)), {
        recursive: true,
      });
      await fs.copyFile(
        path.join(source, entry.name),
        path.join(destination, output),
      );
      files.push(output.replaceAll(path.sep, "/"));
    }
    if (entry.isDirectory() && /^licenses$/i.test(entry.name)) {
      const output = path.join("licenses", safeName, entry.name);
      await fs.cp(
        path.join(source, entry.name),
        path.join(destination, output),
        { recursive: true },
      );
      files.push(output.replaceAll(path.sep, "/"));
    }
  }
  notices.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? "See upstream package",
    files,
  });
}
await fs.writeFile(
  path.join(destination, "THIRD-PARTY-NOTICES.json"),
  JSON.stringify(
    {
      node: {
        version: nodeInfo.version,
        license: "runtime/LICENSE.txt",
        source: `https://github.com/nodejs/node/blob/v${nodeInfo.version}/LICENSE`,
      },
      windowsCrt,
      additionalLicenseDirectory: "licenses/bundled",
      packages: notices,
    },
    null,
    2,
  ) + "\n",
);

const launchCmd = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\local-app.mjs" start\r\nif errorlevel 1 pause\r\n`;
const stopCmd = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\local-app.mjs" stop\r\nif errorlevel 1 pause\r\n`;
const dataCmd = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\local-app.mjs" data --open\r\nif errorlevel 1 pause\r\n`;
for (const [file, content] of [
  ["启动弦间.cmd", launchCmd],
  ["关闭弦间.cmd", stopCmd],
  ["打开数据目录.cmd", dataCmd],
])
  await fs.writeFile(path.join(destination, file), content, "utf8");
const readme = `弦间 ${pkg.version} · Windows 本地体验版\r\n\r\n使用 Windows 10/11 64 位电脑，推荐 Microsoft Edge 或 Chrome。\r\n1. 将整个 ZIP 解压到一个普通文件夹（中文和空格路径均可）。不要直接从压缩包运行，也不要只复制启动文件。\r\n2. 双击「启动弦间.cmd」。首次初始化可能需要数秒；随后浏览器自动打开 http://127.0.0.1:5180。无需安装 Node.js，无需登录或联网。\r\n3. 保留启动窗口。使用结束先保存编排，再双击「关闭弦间.cmd」；也可以在启动窗口按 Ctrl+C。关网页标签不会自动停止程序。\r\n4. 如果浏览器没有自动打开，复制启动窗口中显示的地址。5180 被其他程序占用时会提示，不会关掉其他软件。\r\n\r\n数据保存\r\n曲谱、PDF/图片、编排、唱音、歌词、批注、笔记和收藏指型均保存在当前 Windows 账户的 %LOCALAPPDATA%\\GuitarRoom。\r\n双击「打开数据目录.cmd」可查看。程序文件夹中没有你的曲谱；换版本时可以替换整个程序文件夹，数据目录保持不动。\r\n本设备的滚谱速度、阅读位置与示范谱显示偏好保存在浏览器。请继续使用同一个浏览器和本机地址；不要清除该站点的数据。\r\n\r\n备份与恢复\r\n在曲谱库中选择「导出备份」，可以导出曲谱原文件和已保存整理信息；「恢复备份」可以在本机导入为副本。\r\n导出前请保存编排。恢复不覆盖已有谱子。更换电脑时，把 ZIP 备份带过去再恢复。浏览器内的阅读偏好不包含在 ZIP 中。\r\n卸载时关闭程序并删除程序文件夹即可。数据目录会保留，除非你自己删除；删除前请先导出备份。\r\n\r\n体验反馈\r\n请反馈操作步骤、截图和希望改进的地方。第一版重点是原谱演奏阅读、可视化编排与试听；识别仍属实验功能，暂不作为稳定能力。\r\n请仅导入有权使用的曲谱。使用你自己编排或可分享的谱反馈即可。\r\n\r\n故障排查\r\n程序启动失败可查看数据目录 logs 内最新 launcher / wrangler 日志，再把报错和操作步骤发给我。\r\n如需迁移旧项目中的 .wrangler/state，请先关闭旧开发服务；这是另一份库，体验包不会自动复制或上传它。推荐先在旧网页导出完整 ZIP，再在本地体验版恢复。\r\n运行环境及第三方许可证位于 runtime/LICENSE.txt、licenses 和 THIRD-PARTY-NOTICES.json。\r\n`;
await fs.writeFile(
  path.join(destination, "使用说明.txt"),
  "\ufeff" + readme,
  "utf8",
);
const gitCommit = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
const gitStatus = spawnSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});
async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const manifest = {
  format: "guitar-room-local-release",
  version: pkg.version,
  platform: "win32-x64",
  createdAt: new Date().toISOString(),
  sourceCommit: gitCommit.status === 0 ? gitCommit.stdout.trim() : null,
  sourceHasChanges:
    gitStatus.status === 0 ? Boolean(gitStatus.stdout.trim()) : null,
  node: nodeInfo,
  nodeSha256: await sha256(runtimeNode),
  windowsCrt,
  runtimeDependencies: [...copied.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  ),
  dataLocation: "%LOCALAPPDATA%\\GuitarRoom",
  listener: "127.0.0.1:5180",
  includesUserData: false,
};
await fs.writeFile(
  path.join(destination, "release-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
async function* walk(directory, prefix = "") {
  for (const entry of (
    await fs.readdir(directory, { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected symbolic link in package: ${relative}`);
    if (entry.isDirectory()) yield* walk(file, relative);
    else if (entry.isFile())
      yield { file, relative, size: (await fs.stat(file)).size };
  }
}
let bytes = 0,
  count = 0;
const zip = new JSZip();
for await (const entry of walk(destination)) {
  if (
    /(^|\/)(\.env(?:\..*)?|\.wrangler|\.sites-runtime|\.git|\.qa)(\/|$)/.test(
      entry.relative,
    )
  )
    throw new Error(
      `Private/developer state must not be packaged: ${entry.relative}`,
    );
  bytes += entry.size;
  count++;
  if (!args.includes("--no-zip"))
    zip.file(`${name}/${entry.relative}`, createReadStream(entry.file), {
      date: new Date("2026-01-01T00:00:00Z"),
    });
}
console.log(
  `Package ready: ${count} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${copied.size} runtime packages.`,
);
if (!args.includes("--no-zip")) {
  const archive = path.join(outputRoot, `${name}.zip`);
  console.log("Compressing offline package...");
  await pipeline(
    zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
    createWriteStream(archive),
  );
  const checksum = await sha256(archive);
  await fs.writeFile(archive + ".sha256", `${checksum}  ${name}.zip\n`);
  console.log(
    `ZIP: ${archive} (${((await fs.stat(archive)).size / 1024 / 1024).toFixed(1)} MB)\nSHA256: ${checksum}`,
  );
}
console.log(`Application folder: ${destination}`);
