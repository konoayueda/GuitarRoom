import { db, owner, safe, checkOrigin, noCache } from "@/lib/server";
import { z } from "zod";
const shape = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  frets: z.array(z.number().int().min(-1).max(24)).length(6),
  note: z.string().max(500),
  capo: z.number().int().min(0).max(12),
});
export async function GET() {
  return safe(async () => {
    const user = await owner();
    const rows = await db()
      .prepare("SELECT body FROM fingerings WHERE owner=?")
      .bind(user)
      .all<{ body: string }>();
    return noCache(rows.results.map((r) => JSON.parse(r.body)));
  });
}
export async function POST(req: Request) {
  return safe(async () => {
    checkOrigin(req);
    const user = await owner(),
      body = shape.parse(await req.json());
    await db()
      .prepare(
        "INSERT INTO fingerings (id,owner,body) VALUES (?,?,?) ON CONFLICT (owner,id) DO UPDATE SET body=excluded.body",
      )
      .bind(body.id, user, JSON.stringify(body))
      .run();
    return noCache(body);
  });
}
