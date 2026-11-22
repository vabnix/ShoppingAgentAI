import { NextResponse } from "next/server";
import { handler, parseBody, parseId } from "@/lib/api";
import { changeOrderStatus, getOrder } from "@/lib/orders";
import { UpdateOrderStatus } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  return NextResponse.json(await getOrder(await parseId(params)));
});

// Orders aren't edited or deleted once placed. They only move through
// statuses, and cancelling is how you undo one.
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const id = await parseId(params);
  const { status } = await parseBody(req, UpdateOrderStatus);
  const order = await changeOrderStatus(id, status);
  return NextResponse.json(order);
});
