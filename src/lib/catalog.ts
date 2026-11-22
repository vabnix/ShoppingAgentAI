import { and, desc, eq, like, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, reviews } from "@/db/schema";
import { notFound } from "./api";
import { refreshProductRating } from "./ratings";
import type { CreateReview, ProductListQuery, z } from "./validation";

// Shared by the REST routes and the MCP tools so both behave the same way.

type ProductFilters = z.output<typeof ProductListQuery> & { maxPriceCents?: number };

export async function listProducts(q: ProductFilters) {
  const filters: SQL[] = [];
  if (q.category) filters.push(eq(products.category, q.category));
  if (q.isOrganic !== undefined) filters.push(eq(products.isOrganic, q.isOrganic));
  if (q.search) filters.push(like(products.name, `%${q.search}%`));
  if (q.maxPriceCents !== undefined) filters.push(lte(products.priceCents, q.maxPriceCents));

  return db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(q.limit)
    .offset(q.offset);
}

export async function getProduct(id: number) {
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) throw notFound("Product");
  return product;
}

export async function listReviews(productId: number) {
  await getProduct(productId);
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.productId, productId))
    .orderBy(desc(reviews.createdAt), desc(reviews.id));
}

export async function addReview(productId: number, data: z.output<typeof CreateReview>) {
  await getProduct(productId);
  return db.transaction(async (tx) => {
    const [review] = await tx
      .insert(reviews)
      .values({ ...data, productId })
      .returning();
    await refreshProductRating(tx, productId);
    return review;
  });
}
