import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  storyKey: text("story_key").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull().default(0),
});
