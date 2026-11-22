import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Every change here needs a migration: run `npm run db:generate` and commit the
// new files in drizzle/ along with this file. CI fails if you forget.

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // Stored in cents so we never deal with floating point money.
  priceCents: integer("price_cents").notNull(),
  rating: real("rating"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
