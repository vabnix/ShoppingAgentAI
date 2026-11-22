import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { handler, notFound, parseBody, parseId } from "@/lib/api";
import { refreshProductRating } from "@/lib/ratings";
import { UpdateReview } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const id = await parseId(params);
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, id) });
  if (!review) throw notFound("Review");
  return NextResponse.json(review);
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const id = await parseId(params);
  const data = await parseBody(req, UpdateReview);

  const updated = await db.transaction(async (tx) => {
    const [review] = await tx.update(reviews).set(data).where(eq(reviews.id, id)).returning();
    if (!review) throw notFound("Review");
    // Only the rating affects the product average, but recomputing is cheap.
    await refreshProductRating(tx, review.productId);
    return review;
  });

  return NextResponse.json(updated);
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const id = await parseId(params);

  await db.transaction(async (tx) => {
    const [review] = await tx
      .delete(reviews)
      .where(eq(reviews.id, id))
      .returning({ productId: reviews.productId });
    if (!review) throw notFound("Review");
    await refreshProductRating(tx, review.productId);
  });

  return new NextResponse(null, { status: 204 });
});
