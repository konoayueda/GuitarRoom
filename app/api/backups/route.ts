import { BACKUP_MAX_BYTES, BackupError, parseBackup } from "@/lib/backup";
import { restoreBackup } from "@/lib/backup-storage";
import { ApiError, checkOrigin, noCache, owner, safe } from "@/lib/server";
export const dynamic = "force-dynamic";
async function readArchive(req: Request) {
  const type = req.headers.get("content-type")?.split(";", 1)[0];
  if (type !== "application/zip" && type !== "application/octet-stream")
    throw new ApiError(415, "请选择网站导出的 ZIP 备份。");
  if (Number(req.headers.get("content-length") || 0) > BACKUP_MAX_BYTES)
    throw new ApiError(413, "备份文件最多 200 MB。");
  if (!req.body) throw new ApiError(400, "备份文件为空。");
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > BACKUP_MAX_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "备份文件最多 200 MB。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function POST(req: Request) {
  return safe(async () => {
    checkOrigin(req);
    const user = await owner();
    let parsed;
    try {
      parsed = await parseBackup(await readArchive(req));
    } catch (error) {
      if (error instanceof BackupError) throw new ApiError(400, error.message);
      throw error;
    }
    return noCache(await restoreBackup(user, parsed));
  }, req);
}
