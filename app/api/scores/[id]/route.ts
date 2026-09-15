import {
  db,
  owner,
  safe,
  checkOrigin,
  ApiError,
  patchSchema,
  noCache,
} from "@/lib/server";
import type { Score } from "@/lib/models";
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
    const current: Score = JSON.parse(row.body);
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
    return noCache(next);
  });
}
