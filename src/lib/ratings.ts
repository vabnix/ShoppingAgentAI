import { avg, eq } from "drizzle-orm";
import type { db as Db } from "@/db";
import { products, reviews } from "@/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

// products.rating is a cached average, so call this in the same transaction
// as any review insert, update or delete.
export async function refreshProductRating(tx: Tx, productId: number) {
  const [row] = await tx
    .select({ value: avg(reviews.rating) })
    .from(reviews)
    .where(eq(reviews.productId, productId));

  // avg() comes back as a string, or null when there are no reviews left.
  const rating = row?.value == null ? null : Math.round(Number(row.value) * 10) / 10;

  await tx.update(products).set({ rating }).where(eq(products.id, productId));
}
