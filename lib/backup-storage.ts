import { bucket, db } from "./server";
import { planBackupRestore, type ParsedBackup } from "./backup";

export async function restoreBackup(user: string, parsed: ParsedBackup) {
  const plan = planBackupRestore(parsed),
    objects: string[] = [];
  const existing = await db()
    .prepare("SELECT id FROM fingerings WHERE owner=?")
    .bind(user)
    .all<{ id: string }>();
  const existingIds = new Set(existing.results.map((f) => f.id));
  const fingerings = plan.fingerings.filter((f) => !existingIds.has(f.id));
  try {
    for (const file of plan.files) {
      const key = user + "/" + file.scoreId + "/" + file.id;
      objects.push(key);
      await bucket().put(key, file.bytes, {
        httpMetadata: { contentType: file.type },
      });
    }
    const statements = [
      ...plan.files.map((file) =>
        db()
          .prepare(
            "INSERT INTO files (id,owner,score_id,object_key,name,type,size) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(
            file.id,
            user,
            file.scoreId,
            user + "/" + file.scoreId + "/" + file.id,
            file.name,
            file.type,
            file.bytes.length,
          ),
      ),
      ...plan.scores.map((score) =>
        db()
          .prepare(
            "INSERT INTO scores (id,owner,body,updated_at) VALUES (?,?,?,?)",
          )
          .bind(score.id, user, JSON.stringify(score), score.updatedAt),
      ),
      ...fingerings.map((f) =>
        db()
          .prepare(
            "INSERT INTO fingerings (id,owner,body) VALUES (?,?,?) ON CONFLICT (owner,id) DO NOTHING",
          )
          .bind(f.id, user, JSON.stringify(f)),
      ),
    ];
    // D1 batch is a transaction: no score becomes visible until all file records,
    // scores and new fingering favorites have been inserted successfully.
    const result = statements.length ? await db().batch(statements) : [];
    return {
      scores: plan.scores,
      restoredFingerings: result
        .slice(plan.files.length + plan.scores.length)
        .reduce((n, r) => n + (r.meta.changes ?? 0), 0),
      skippedFingerings: plan.fingerings.length - fingerings.length,
    };
  } catch (error) {
    // These keys belong exclusively to this restore. Existing files are untouched.
    await Promise.allSettled(objects.map((key) => bucket().delete(key)));
    throw error;
  }
}
