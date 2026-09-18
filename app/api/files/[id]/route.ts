import { bucket, db, owner, safe, ApiError } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return safe(async () => {
    const user = await owner();
    const { id } = await params;
    const f = await db()
      .prepare(
        "SELECT f.object_key,f.name,f.type FROM files f JOIN scores s ON s.owner=f.owner AND s.id=f.score_id WHERE f.owner=? AND f.id=? AND json_extract(s.body,'$.deletedAt') IS NULL",
      )
      .bind(user, id)
      .first<{ object_key: string; name: string; type: string }>();
    if (!f) throw new ApiError(404, "找不到文件。");
    const object = await bucket().get(f.object_key);
    if (!object) throw new ApiError(404, "文件暂时无法读取。");
    return new Response(object.body, {
      headers: {
        "Content-Type": f.type,
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition":
          "inline; filename*=UTF-8''" + encodeURIComponent(f.name),
      },
    });
  });
}
