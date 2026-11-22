import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { handler, notFound, parseBody, parseId } from "@/lib/api";
import { getProduct } from "@/lib/catalog";
import { UpdateProduct } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  return NextResponse.json(await getProduct(await parseId(params)));
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const id = await parseId(params);
  const data = await parseBody(req, UpdateProduct);
  const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
  if (!updated) throw notFound("Product");
  return NextResponse.json(updated);
});

export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const id = await parseId(params);
  // Reviews go too, via ON DELETE CASCADE.
  const [deleted] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  if (!deleted) throw notFound("Product");
  return new NextResponse(null, { status: 204 });
});
