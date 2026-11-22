import { NextResponse } from "next/server";
import { handler, parseBody, parseId } from "@/lib/api";
import { addReview, listReviews } from "@/lib/catalog";
import { CreateReview } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const productId = await parseId(params);
  return NextResponse.json(await listReviews(productId));
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const productId = await parseId(params);
  const data = await parseBody(req, CreateReview);
  const created = await addReview(productId, data);
  return NextResponse.json(created, { status: 201 });
});
