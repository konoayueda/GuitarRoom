import JSZip from "jszip";
import { z } from "zod";
import { arrangementSchema } from "./arrangement";
import { DEMOS, normalizeScore, type Score } from "./models";

export const BACKUP_MAX_BYTES = 200 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 8 * 1024 * 1024;
const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const BACKUP_MANIFEST = "曲谱与笔记.json";
const token = z.string().min(1).max(100);
const safeToken = token.regex(/^[a-zA-Z0-9_-]+$/);
const supportedType = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const annotation = z
  .object({
    id: token,
    pageId: token,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
    text: z.string().trim().min(1).max(500),
  })
  .strict();
const page = z
  .object({
    id: token,
    fileId: safeToken.optional(),
    demo: z.number().int().min(0).max(2).optional(),
    pdfPage: z.number().int().min(1).max(200).optional(),
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    name: z.string().min(1).max(180),
    type: z.string().max(40),
  })
  .strict();
const score = z
  .object({
    id: safeToken,
    title: z.string().trim().min(1).max(100),
    artist: z.string().max(100),
    key: z.string().max(12),
    capo: z.number().int().min(0).max(12),
    tuning: z.string().max(100),
    tags: z.array(z.string().trim().min(1).max(25)).max(12),
    status: z.enum(["planned", "practicing", "mastered"]),
    favorite: z.boolean(),
    pages: z.array(page).min(1).max(200),
    annotations: z.array(annotation).max(500),
    note: z.string().max(4000),
    createdAt: z.number().finite().min(0),
    updatedAt: z.number().finite().min(0),
    lastOpened: z.number().finite().min(0),
    lastPage: z.number().int().min(0).max(199),
    demoId: z.number().int().min(0).max(2).optional(),
    arrangement: arrangementSchema.optional(),
    backupFiles: z.record(z.string().min(1).max(500)),
  })
  .strict();
export const backupFingeringSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(60),
    frets: z.array(z.number().int().min(-1).max(24)).length(6),
    note: z.string().max(500),
    capo: z.number().int().min(0).max(12),
  })
  .strict();
export type BackupFingering = z.infer<typeof backupFingeringSchema>;
const manifestSchema = z
  .object({
    format: z.literal("xianjian-backup"),
    version: z.union([z.literal(1), z.literal(2)]),
    exportedAt: z.string().datetime(),
    scores: z.array(score).max(100),
    fingerings: z.array(backupFingeringSchema).max(1000).optional(),
  })
  .strict();
export type BackupManifest = z.infer<typeof manifestSchema>;
export type ParsedBackup = {
  manifest: BackupManifest;
  files: Map<string, { bytes: Uint8Array; type: string }>;
};
export class BackupError extends Error {}
function invalid(message: string): never {
  throw new BackupError(message);
}
function validPath(path: string, directory = false) {
  const value = directory && path.endsWith("/") ? path.slice(0, -1) : path;
  return (
    value.length > 0 &&
    value.length <= 500 &&
    !/[\\\u0000-\u001f\u007f:]/.test(value) &&
    !value.startsWith("/") &&
    value
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== "..")
  );
}
// Inspect declared sizes and paths before JSZip can decompress anything. This also
// catches duplicate central-directory entries that JSZip would otherwise replace.
export function inspectBackupZip(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes.length > BACKUP_MAX_BYTES)
    invalid("备份文件为空、损坏或超过 200 MB。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) {
    if (
      view.getUint32(n, true) === 0x06054b50 &&
      n + 22 + view.getUint16(n + 20, true) === bytes.length
    ) {
      end = n;
      break;
    }
  }
  if (end < 0) invalid("这不是完整的 ZIP 备份文件。");
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    start === 0xffffffff ||
    size === 0xffffffff
  )
    invalid("备份不支持分卷或 ZIP64，请使用网站导出的 ZIP。");
  if (!count || count > 2000 || start + size !== end)
    invalid("ZIP 文件目录无效或文件数量超过限制。");
  const entries = new Map<
    string,
    { size: number; directory: boolean; crc: number }
  >();
  let at = start,
    total = 0;
  const decode = (data: Uint8Array) => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return invalid("备份文件名编码无效。");
    }
  };
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50)
      invalid("ZIP 文件目录已损坏。");
    const flags = view.getUint16(at + 8, true),
      method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true),
      length = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true),
      extra = view.getUint16(at + 30, true),
      comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true),
      next = at + 46 + nameLength + extra + comment;
    if (
      next > end ||
      flags & 1 ||
      (method !== 0 && method !== 8) ||
      view.getUint16(at + 34, true) ||
      compressed === 0xffffffff ||
      length === 0xffffffff ||
      local === 0xffffffff
    )
      invalid("备份包含加密、分卷或不支持的压缩格式。");
    const path = decode(bytes.subarray(at + 46, at + 46 + nameLength)),
      directory = path.endsWith("/");
    if (!validPath(path, directory) || entries.has(path))
      invalid("备份包含不安全或重复的文件路径。");
    if (directory && length !== 0) invalid("备份文件夹数据无效。");
    if (
      length > (path === BACKUP_MANIFEST ? MANIFEST_MAX_BYTES : FILE_MAX_BYTES)
    )
      invalid("备份中有文件超出大小限制。");
    total += length;
    if (
      total > BACKUP_MAX_BYTES ||
      local + 30 > start ||
      view.getUint32(local, true) !== 0x04034b50
    )
      invalid("备份解压后的总量超过 200 MB，或文件数据已损坏。");
    const localName = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true);
    if (
      local + 30 + localName + localExtra + compressed > start ||
      decode(bytes.subarray(local + 30, local + 30 + localName)) !== path
    )
      invalid("备份文件目录与内容不一致。");
    entries.set(path, {
      size: length,
      directory,
      crc: view.getUint32(at + 16, true),
    });
    at = next;
  }
  if (at !== start + size || !entries.has(BACKUP_MANIFEST))
    invalid("找不到网站导出的曲谱备份清单。");
  return entries;
}
function signatureMatches(bytes: Uint8Array, type: string) {
  if (type === "application/pdf")
    return (
      bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70
    );
  if (type === "image/png")
    return (
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    );
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    type === "image/webp" &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  );
}
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit++)
    current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});
async function readZipEntry(
  zip: JSZip,
  path: string,
  info: { size: number; crc: number },
  keep = true,
) {
  const file = zip.file(path);
  if (!file) return invalid("备份缺少文件数据。");
  return new Promise<Uint8Array>((resolve, reject) => {
    // JSZip 3 documents this API, but its bundled declarations omit it.
    const stream = (
        file as JSZip.JSZipObject & {
          internalStream(
            type: "uint8array",
          ): JSZip.JSZipStreamHelper<Uint8Array>;
        }
      ).internalStream("uint8array"),
      chunks: Uint8Array[] = [];
    let length = 0,
      crc = 0xffffffff,
      failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      stream.pause();
      reject(new BackupError("备份文件损坏或实际解压量超出限制。"));
    };
    stream
      .on("data", (chunk: Uint8Array) => {
        if (failed) return;
        length += chunk.length;
        // Enforce actual output incrementally, even if a malicious ZIP lies about size.
        if (length > info.size) {
          fail();
          return;
        }
        for (const byte of chunk)
          crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        if (keep) chunks.push(chunk);
      })
      .on("error", fail)
      .on("end", () => {
        if (failed) return;
        if (length !== info.size || (crc ^ 0xffffffff) >>> 0 !== info.crc) {
          fail();
          return;
        }
        const bytes = new Uint8Array(keep ? length : 0);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(bytes);
      });
    stream.resume();
  });
}
export async function parseBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  const entries = inspectBackupZip(bytes);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return invalid("备份文件损坏，未恢复任何内容。");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readZipEntry(zip, BACKUP_MANIFEST, entries.get(BACKUP_MANIFEST)!),
      ),
    );
  } catch {
    return invalid("备份清单无法读取。");
  }
  const result = manifestSchema.safeParse(raw);
  if (!result.success)
    invalid("备份清单格式无效、内容超出限制或编排数据不完整。");
  const manifest = result.data,
    paths = new Map<string, string>(),
    scoreIds = new Set<string>();
  let restoredBytes = 0,
    restoredFiles = 0;
  if (!manifest.scores.length && !manifest.fingerings?.length)
    invalid("这份备份没有可恢复的曲谱或指型。");
  for (const score of manifest.scores) {
    if (scoreIds.has(score.id)) invalid("备份存在重复的曲谱标识。");
    scoreIds.add(score.id);
    const pages = new Set(score.pages.map((p) => p.id)),
      identities = new Set<string>(),
      sourceTypes = new Map<string, string>();
    if (
      pages.size !== score.pages.length ||
      score.lastPage >= score.pages.length
    )
      invalid("曲谱页码重复或阅读位置无效。");
    for (const p of score.pages) {
      const identity = p.fileId || p.id;
      identities.add(identity);
      if (p.fileId) {
        if (
          p.demo !== undefined ||
          !supportedType.safeParse(p.type).success ||
          (p.type === "application/pdf"
            ? p.pdfPage === undefined
            : p.pdfPage !== undefined)
        )
          invalid("曲谱文件格式或 PDF 页码无效。");
        const oldType = sourceTypes.get(identity);
        if (oldType && oldType !== p.type)
          invalid("同一原文件的格式信息不一致。");
        sourceTypes.set(identity, p.type);
        const path = score.backupFiles[identity];
        if (
          !path ||
          !validPath(path) ||
          !entries.has(path) ||
          entries.get(path)!.directory ||
          entries.get(path)!.size === 0
        )
          invalid("备份缺少曲谱原文件。");
        if (paths.has(path) && paths.get(path) !== p.type)
          invalid("曲谱原文件的引用格式不一致。");
        paths.set(path, p.type);
        if (!oldType) {
          restoredBytes += entries.get(path)!.size;
          restoredFiles++;
          if (restoredBytes > BACKUP_MAX_BYTES || restoredFiles > 1000)
            invalid("恢复的文件总量超过 200 MB 或 1000 个文件。");
        }
      } else {
        if (
          p.demo === undefined ||
          !DEMOS[p.demo] ||
          p.type !== "image/svg+xml" ||
          p.pdfPage !== undefined
        )
          invalid("备份包含不支持的曲谱文件。");
        // Version 1 included the bundled demo SVG; use the trusted bundled copy.
        const path = score.backupFiles[identity];
        if (
          path &&
          (!validPath(path) ||
            !entries.has(path) ||
            entries.get(path)!.directory)
        )
          invalid("示范谱原文件引用无效。");
      }
    }
    if (Object.keys(score.backupFiles).some((key) => !identities.has(key)))
      invalid("备份含有无效的原文件引用。");
    if (
      score.annotations.some(
        (a) => !pages.has(a.pageId) || a.x + a.w > 1.001 || a.y + a.h > 1.001,
      ) ||
      new Set(score.annotations.map((a) => a.id)).size !==
        score.annotations.length
    )
      invalid("备份批注的位置或标识无效。");
    if (
      score.arrangement?.sections.some((s) =>
        s.bars.some((b) => b.pageId && !pages.has(b.pageId)),
      )
    )
      invalid("编排引用的原谱页面不存在。");
  }
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  for (const [path, type] of paths) {
    const content = await readZipEntry(zip, path, entries.get(path)!);
    if (
      content.length !== entries.get(path)!.size ||
      !signatureMatches(content, type)
    )
      invalid("曲谱原文件损坏或内容与格式不符。");
    files.set(path, { bytes: content, type });
  }
  for (const [path, info] of entries) {
    if (!info.directory && path !== BACKUP_MANIFEST && !files.has(path))
      await readZipEntry(zip, path, info, false);
  }
  return { manifest, files };
}
export function restoredFingering(source: BackupFingering) {
  return {
    ...source,
    id: "shape-" + source.frets.join("_") + "-" + source.capo,
  };
}
export function planBackupRestore(
  parsed: ParsedBackup,
  makeId = () => crypto.randomUUID(),
  now = Date.now(),
) {
  const files: {
    id: string;
    scoreId: string;
    name: string;
    type: string;
    bytes: Uint8Array;
  }[] = [];
  const scores = parsed.manifest.scores.map((source) => {
    const { backupFiles, demoId: _demoId, ...body } = source;
    // Every restore receives fresh identifiers; it cannot replace an existing score.
    void _demoId;
    const id = makeId(),
      pageIds = new Map(source.pages.map((p) => [p.id, makeId()]));
    const fileIds = new Map<string, string>();
    for (const p of source.pages)
      if (p.fileId && !fileIds.has(p.fileId)) {
        const fileId = makeId(),
          original = parsed.files.get(backupFiles[p.fileId])!;
        fileIds.set(p.fileId, fileId);
        files.push({
          id: fileId,
          scoreId: id,
          name: p.name,
          type: p.type,
          bytes: original.bytes,
        });
      }
    const restored: Score = {
      ...body,
      id,
      updatedAt: now,
      pages: source.pages.map((p) => ({
        ...p,
        id: pageIds.get(p.id)!,
        ...(p.fileId ? { fileId: fileIds.get(p.fileId)! } : {}),
      })),
      annotations: source.annotations.map((a) => ({
        ...a,
        id: makeId(),
        pageId: pageIds.get(a.pageId)!,
      })),
      ...(source.arrangement
        ? {
            arrangement: {
              ...source.arrangement,
              sections: source.arrangement.sections.map((s) => ({
                ...s,
                bars: s.bars.map((b) => ({
                  ...b,
                  ...(b.pageId ? { pageId: pageIds.get(b.pageId)! } : {}),
                })),
              })),
            },
          }
        : {}),
    };
    return normalizeScore(restored);
  });
  const fingerings = [
    ...new Map(
      (parsed.manifest.fingerings ?? []).map((f) => {
        const restored = restoredFingering(f);
        return [restored.id, restored] as const;
      }),
    ).values(),
  ];
  return { scores, files, fingerings };
}
