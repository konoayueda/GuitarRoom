import {
  bucket,
  db,
  owner,
  safe,
  checkOrigin,
  ApiError,
  noCache,
  metadataSchema,
} from "@/lib/server";
import {
  DEMOS,
  normalizeScore,
  type Score,
  type ScorePage,
} from "@/lib/models";
import {
  isDeletedScore,
  retryDeletedFiles,
  type DeletedScore,
} from "@/lib/score-storage";
export const dynamic = "force-dynamic";
export async function GET() {
  return safe(async () => {
    const user = await owner();
    const result = await db()
      .prepare(
        "SELECT body FROM scores WHERE owner = ? ORDER BY updated_at DESC",
      )
      .bind(user)
      .all<{ body: string }>();
    const records = result.results.map(
      (r) => JSON.parse(r.body) as Score | DeletedScore,
    );
    await retryDeletedFiles(user);
    return noCache({
      scores: records
        .filter((s): s is Score => !isDeletedScore(s))
        .map(normalizeScore),
      dismissedDemoIds: records
        .filter(isDeletedScore)
        .filter((s) => s.demoId !== undefined)
        .map((s) => s.id),
    });
  });
}
export async function POST(req: Request) {
  return safe(async () => {
    checkOrigin(req);
    const user = await owner();
    if (req.headers.get("content-type")?.includes("application/json")) {
      const { demoId } = (await req.json()) as { demoId: number };
      if (!Number.isInteger(demoId) || !DEMOS[demoId])
        throw new ApiError(400, "示范谱不存在。");
      const score = {
        ...DEMOS[demoId],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db()
        .prepare(
          "INSERT INTO scores (id,owner,body,updated_at) VALUES (?,?,?,?) ON CONFLICT (owner,id) DO NOTHING",
        )
        .bind(score.id, user, JSON.stringify(score), score.updatedAt)
        .run();
      const row = await db()
        .prepare("SELECT body FROM scores WHERE owner=? AND id=?")
        .bind(user, score.id)
        .first<{ body: string }>();
      const saved = JSON.parse(row!.body) as Score | DeletedScore;
      if (isDeletedScore(saved))
        throw new ApiError(410, "这份示范谱已从你的曲谱库删除。");
      return noCache(normalizeScore(saved));
    }
    if (Number(req.headers.get("content-length") || 0) > 42 * 1024 * 1024)
      throw new ApiError(413, "一次导入请控制在 40 MB 以内。");
    const form = await req.formData();
    const rawFiles = form.getAll("files");
    if (
      !rawFiles.length ||
      rawFiles.length > 20 ||
      rawFiles.some((f) => !(f instanceof File))
    )
      throw new ApiError(400, "请选择 1–20 张图片，或一份 PDF。");
    const inputFiles = rawFiles as File[];
    if (
      inputFiles.reduce((s, f) => s + f.size, 0) > 40 * 1024 * 1024 ||
      inputFiles.some((f) => f.size === 0 || f.size > 20 * 1024 * 1024)
    )
      throw new ApiError(413, "单文件最多 20 MB，总计最多 40 MB。");
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (inputFiles.some((f) => !allowed.includes(f.type)))
      throw new ApiError(400, "仅支持 JPG、PNG、WebP 和 PDF。");
    if (
      inputFiles.some((f) => f.type === "application/pdf") &&
      inputFiles.length !== 1
    )
      throw new ApiError(400, "PDF 请单独导入，图片可以合并。");
    const meta = metadataSchema
      .pick({
        title: true,
        artist: true,
        key: true,
        capo: true,
        tuning: true,
        tags: true,
      })
      .parse(JSON.parse(String(form.get("metadata") || "{}")));
    const pdfCount =
      inputFiles[0].type === "application/pdf"
        ? Number(form.get("pdfPages"))
        : 1;
    if (!Number.isInteger(pdfCount) || pdfCount < 1 || pdfCount > 200)
      throw new ApiError(400, "每份曲谱最多 200 页。");
    const scoreId = crypto.randomUUID();
    const objects: {
      id: string;
      key: string;
      name: string;
      type: string;
      size: number;
    }[] = [];
    const pages: ScorePage[] = [];
    try {
      for (const f of inputFiles) {
        const id = crypto.randomUUID(),
          key = user + "/" + scoreId + "/" + id;
        const signature = new Uint8Array(await f.slice(0, 12).arrayBuffer());
        const isPdf =
          signature[0] === 37 &&
          signature[1] === 80 &&
          signature[2] === 68 &&
          signature[3] === 70;
        const isPng =
          signature[0] === 137 &&
          signature[1] === 80 &&
          signature[2] === 78 &&
          signature[3] === 71;
        const isJpg =
          signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
        const isWebp =
          String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
        if (
          !(f.type === "application/pdf"
            ? isPdf
            : f.type === "image/png"
              ? isPng
              : f.type === "image/jpeg"
                ? isJpg
                : isWebp)
        )
          throw new ApiError(400, "文件内容与格式不符：" + f.name);
        await bucket().put(key, f.stream(), {
          httpMetadata: { contentType: f.type },
        });
        objects.push({
          id,
          key,
          name: f.name.slice(0, 180),
          type: f.type,
          size: f.size,
        });
        for (let n = 1; n <= (f.type === "application/pdf" ? pdfCount : 1); n++)
          pages.push({
            id: crypto.randomUUID(),
            fileId: id,
            name: f.name.slice(0, 180),
            type: f.type,
            rotation: 0,
            ...(f.type === "application/pdf" ? { pdfPage: n } : {}),
          });
      }
      const score: Score = {
        id: scoreId,
        ...meta,
        status: "planned",
        favorite: false,
        pages,
        annotations: [],
        note: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastOpened: 0,
        lastPage: 0,
      };
      await db().batch([
        ...objects.map((f) =>
          db()
            .prepare(
              "INSERT INTO files (id,owner,score_id,object_key,name,type,size) VALUES (?,?,?,?,?,?,?)",
            )
            .bind(f.id, user, scoreId, f.key, f.name, f.type, f.size),
        ),
        db()
          .prepare(
            "INSERT INTO scores (id,owner,body,updated_at) VALUES (?,?,?,?)",
          )
          .bind(scoreId, user, JSON.stringify(score), score.updatedAt),
      ]);
      return noCache(score);
    } catch (e) {
      await Promise.allSettled(objects.map((f) => bucket().delete(f.key)));
      throw e;
    }
  });
}
