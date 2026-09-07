import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey(),
  storyKey: text("story_key").notNull().unique(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull().default(0),
});
