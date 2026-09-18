import { bucket, db } from "./server";
import type { Score } from "./models";
export type DeletedScore = { id: string; deletedAt: number; demoId?: number };
export function isDeletedScore(
  score: Score | DeletedScore,
): score is DeletedScore {
  return "deletedAt" in score;
}
// A tombstone revokes access first; retained file rows make interrupted cleanup retryable.
export async function cleanupScoreFiles(user: string, id: string) {
  const files = await db()
    .prepare("SELECT object_key FROM files WHERE owner=? AND score_id=?")
    .bind(user, id)
    .all<{ object_key: string }>();
  if (!files.results.length) return;
  await bucket().delete([...new Set(files.results.map((f) => f.object_key))]);
  await db()
    .prepare("DELETE FROM files WHERE owner=? AND score_id=?")
    .bind(user, id)
    .run();
}
export async function retryDeletedFiles(user: string) {
  const pending = await db()
    .prepare(
      "SELECT DISTINCT f.score_id FROM files f JOIN scores s ON s.owner=f.owner AND s.id=f.score_id WHERE f.owner=? AND json_extract(s.body,'$.deletedAt') IS NOT NULL LIMIT 10",
    )
    .bind(user)
    .all<{ score_id: string }>();
  await Promise.allSettled(
    pending.results.map((f) => cleanupScoreFiles(user, f.score_id)),
  );
}
