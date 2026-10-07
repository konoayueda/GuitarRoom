import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { z } from "zod";
import { arrangementSchema } from "./arrangement";
import { canAccessLocalRoom } from "./local-access";
import { discardUnreadRequestBody } from "./request-body";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function owner() {
  const requestHeaders = await headers();
  if (
    !canAccessLocalRoom(
      requestHeaders.get("host") ?? "",
      process.env.NODE_ENV === "development",
      env.GUITAR_ROOM_LOCAL_APP,
    )
  )
    throw new ApiError(403, "当前为本机琴房，请通过本地启动程序打开。");
  // Reuse the previous local namespace; no records or files need moving.
  return "local_seedy";
}
export function db() {
  if (!env.DB) throw new ApiError(503, "曲谱库暂时无法连接，请稍后重试。");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET)
    throw new ApiError(503, "文件存储暂时无法连接，请稍后重试。");
  return env.BUCKET;
}
export async function safe(action: () => Promise<Response>, req?: Request) {
  try {
    return await action();
  } catch (e) {
    if (e instanceof ApiError)
      return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error: "输入内容不完整或超出限制，请检查后重试。",
          details: e.flatten(),
        },
        { status: 400 },
      );
    console.error("Guitar room request failed", e);
    return Response.json(
      { error: "暂时未能保存，请保留当前内容并重试。" },
      { status: 500 },
    );
  } finally {
    await discardUnreadRequestBody(req);
  }
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new ApiError(403, "请求来源无效。");
}
export const metadataSchema = z.object({
  title: z.string().trim().min(1).max(100),
  artist: z.string().max(100),
  key: z.string().max(12),
  capo: z.number().int().min(0).max(12),
  tuning: z.string().max(100),
  tags: z.array(z.string().trim().min(1).max(25)).max(12),
  status: z.enum(["planned", "practicing", "mastered"]),
  favorite: z.boolean(),
  note: z.string().max(4000),
  lastPage: z.number().int().min(0).max(1000),
  lastOpened: z.number().min(0),
  annotations: z
    .array(
      z.object({
        id: z.string().max(80),
        pageId: z.string().max(100),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
        text: z.string().trim().min(1).max(500),
      }),
    )
    .max(500),
});
export const patchSchema = metadataSchema
  .partial()
  .extend({
    expectedUpdatedAt: z.number().int().min(0),
    arrangement: arrangementSchema.optional(),
    pages: z
      .array(
        z.object({
          id: z.string().max(100),
          rotation: z.union([
            z.literal(0),
            z.literal(90),
            z.literal(180),
            z.literal(270),
          ]),
        }),
      )
      .min(1)
      .max(200)
      .optional(),
  })
  .strict();
export function noCache(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
