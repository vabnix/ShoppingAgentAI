import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Every change here needs a migration: run `npm run db:generate` and commit the
// new files in drizzle/ along with this file. CI fails if you forget.

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    category: text("category"),
    imageUrl: text("image_url"),
    // Stored in cents so we never deal with floating point money.
    priceCents: integer("price_cents").notNull(),
    // Average of the reviews, kept here so listing pages don't have to
    // aggregate every time. Update it whenever a review is added or removed.
    rating: real("rating"),
    isOrganic: integer("is_organic", { mode: "boolean" })
      .notNull()
      .default(false),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => new Date()),
  },
  (t) => [index("products_category_idx").on(t.category)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Deleting a product takes its reviews with it.
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    reviewerName: text("reviewer_name").notNull(),
    rating: integer("rating").notNull(),
    title: text("title"),
    comment: text("comment"),
    isVerifiedPurchase: integer("is_verified_purchase", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("reviews_product_id_idx").on(t.productId),
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

// Lets us do db.query.products.findMany({ with: { reviews: true } }).
export const productsRelations = relations(products, ({ many }) => ({
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
