import {
  db,
  owner,
  safe,
  checkOrigin,
  ApiError,
  patchSchema,
  noCache,
} from "@/lib/server";
import { DEMOS, normalizeScore, type Score } from "@/lib/models";
import { z } from "zod";
import {
  cleanupScoreFiles,
  isDeletedScore,
  type DeletedScore,
} from "@/lib/score-storage";
export const dynamic = "force-dynamic";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return safe(async () => {
    checkOrigin(req);
    const user = await owner();
    const { id } = await params;
    const row = await db()
      .prepare("SELECT body FROM scores WHERE owner=? AND id=?")
      .bind(user, id)
      .first<{ body: string }>();
    if (!row) throw new ApiError(404, "找不到这份曲谱。");
    const current: Score | DeletedScore = JSON.parse(row.body);
    if (isDeletedScore(current)) throw new ApiError(404, "这份曲谱已删除。");
    const { expectedUpdatedAt, ...patch } = patchSchema.parse(await req.json());
    if (expectedUpdatedAt !== current.updatedAt)
      throw new ApiError(
        409,
        "曲谱已在另一个页面修改。请保留当前输入，刷新后再保存。",
      );
    let pages = current.pages;
    if (patch.pages) {
      if (
        patch.pages.length !== pages.length ||
        new Set(patch.pages.map((p) => p.id)).size !== pages.length ||
        patch.pages.some((p) => !pages.some((old) => old.id === p.id))
      )
        throw new ApiError(400, "页码信息无效。");
      pages = patch.pages.map((p) => ({
        ...current.pages.find((old) => old.id === p.id)!,
        rotation: p.rotation,
      }));
    }
    if (
      patch.annotations?.some(
        (a) =>
          !pages.some((p) => p.id === a.pageId) ||
          a.x + a.w > 1.001 ||
          a.y + a.h > 1.001,
      )
    )
      throw new ApiError(400, "批注位置无效。");
    if (
      patch.arrangement?.sections.some((section) =>
        section.bars.some(
          (bar) => bar.pageId && !pages.some((page) => page.id === bar.pageId),
        ),
      )
    )
      throw new ApiError(400, "编排关联的原谱页面不存在。");
    const next = {
      ...current,
      ...patch,
      pages,
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
    };
    next.lastPage = Math.min(next.lastPage, pages.length - 1);
    const result = await db()
      .prepare(
        "UPDATE scores SET body=?,updated_at=? WHERE owner=? AND id=? AND body=?",
      )
      .bind(JSON.stringify(next), next.updatedAt, user, id, row.body)
      .run();
    if (result.meta.changes !== 1)
      throw new ApiError(409, "曲谱刚刚有新的修改，请保留输入并刷新后重试。");
    return noCache(normalizeScore(next));
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return safe(async () => {
    checkOrigin(req);
    const user = await owner(),
      { id } = await params;
    const { expectedUpdatedAt } = z
      .object({ expectedUpdatedAt: z.number().int().min(0) })
      .strict()
      .parse(await req.json());
    let row = await db()
      .prepare("SELECT body FROM scores WHERE owner=? AND id=?")
      .bind(user, id)
      .first<{ body: string }>();
    if (!row) {
      const demo = DEMOS.find((s) => s.id === id);
      if (!demo || expectedUpdatedAt !== 0)
        throw new ApiError(404, "找不到这份曲谱。");
      const tombstone: DeletedScore = {
        id,
        deletedAt: Date.now(),
        demoId: demo.demoId,
      };
      await db()
        .prepare(
          "INSERT INTO scores (id,owner,body,updated_at) VALUES (?,?,?,?) ON CONFLICT (owner,id) DO NOTHING",
        )
        .bind(id, user, JSON.stringify(tombstone), tombstone.deletedAt)
        .run();
      row = await db()
        .prepare("SELECT body FROM scores WHERE owner=? AND id=?")
        .bind(user, id)
        .first<{ body: string }>();
    }
    if (!row) throw new ApiError(404, "找不到这份曲谱。");
    const current = JSON.parse(row.body) as Score | DeletedScore;
    if (!isDeletedScore(current)) {
      if (current.updatedAt !== expectedUpdatedAt)
        throw new ApiError(
          409,
          "曲谱已有新的修改，请重新打开曲谱库，核对后再删除。",
        );
      const tombstone: DeletedScore = {
        id,
        deletedAt: Date.now(),
        ...(current.demoId !== undefined ? { demoId: current.demoId } : {}),
      };
      const result = await db()
        .prepare(
          "UPDATE scores SET body=?,updated_at=? WHERE owner=? AND id=? AND body=?",
        )
        .bind(
          JSON.stringify(tombstone),
          tombstone.deletedAt,
          user,
          id,
          row.body,
        )
        .run();
      if (result.meta.changes !== 1)
        throw new ApiError(409, "曲谱刚刚有新的修改，请核对后再删除。");
    }
    let cleanupPending = false;
    try {
      await cleanupScoreFiles(user, id);
    } catch {
      cleanupPending = true;
    }
    return noCache({ deleted: true, cleanupPending });
  });
}
