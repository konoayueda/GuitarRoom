import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const scores = sqliteTable(
  "scores",
  {
    id: text("id").notNull(),
    owner: text("owner").notNull(),
    body: text("body").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    scoreId: text("score_id").notNull(),
    key: text("object_key").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
  },
  (t) => [index("idx_files_owner_score").on(t.owner, t.scoreId)],
);
export const fingerings = sqliteTable(
  "fingerings",
  {
    id: text("id").notNull(),
    owner: text("owner").notNull(),
    body: text("body").notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.id] })],
);
