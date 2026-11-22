import { NextResponse } from "next/server";
import { handler, parseBody, parseQuery } from "@/lib/api";
import { listOrders, placeOrder } from "@/lib/orders";
import { CreateOrder, OrderListQuery } from "@/lib/validation";

export const GET = handler(async (req) => {
  const query = parseQuery(req, OrderListQuery);
  const items = await listOrders(query);
  return NextResponse.json({ items, limit: query.limit, offset: query.offset });
});

export const POST = handler(async (req) => {
  const input = await parseBody(req, CreateOrder);
  const order = await placeOrder(input);
  return NextResponse.json(order, { status: 201 });
});
