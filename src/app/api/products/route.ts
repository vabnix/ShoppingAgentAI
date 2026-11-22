import { NextResponse } from "next/server";
import { db } from "@/db";
import { products } from "@/db/schema";
import { handler, parseBody, parseQuery } from "@/lib/api";
import { listProducts } from "@/lib/catalog";
import { CreateProduct, ProductListQuery } from "@/lib/validation";

export const GET = handler(async (req) => {
  const query = parseQuery(req, ProductListQuery);
  const items = await listProducts(query);
  return NextResponse.json({ items, limit: query.limit, offset: query.offset });
});

export const POST = handler(async (req) => {
  const data = await parseBody(req, CreateProduct);
  const [created] = await db.insert(products).values(data).returning();
  return NextResponse.json(created, { status: 201 });
});
