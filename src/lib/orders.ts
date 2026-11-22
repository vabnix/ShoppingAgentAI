import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders, products, type OrderStatus } from "@/db/schema";
import { HttpError, notFound } from "./api";
import type { CreateOrder, OrderListQuery, z } from "./validation";

// Where each status is allowed to go next. Anything not listed is rejected.
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export async function listOrders(q: z.output<typeof OrderListQuery>) {
  const filters: SQL[] = [];
  if (q.status) filters.push(eq(orders.status, q.status));
  // Emails aren't case sensitive in practice, and people type them however.
  if (q.customerEmail) {
    filters.push(sql`lower(${orders.customerEmail}) = ${q.customerEmail.toLowerCase()}`);
  }

  return db
    .select()
    .from(orders)
    .where(and(...filters))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(q.limit)
    .offset(q.offset);
}

export async function getOrder(id: number) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: { items: true },
  });
  if (!order) throw notFound("Order");
  return order;
}

export async function placeOrder(input: z.output<typeof CreateOrder>) {
  return db.transaction(async (tx) => {
    const ids = input.items.map((i) => i.productId);
    const found = await tx.select().from(products).where(inArray(products.id, ids));
    const byId = new Map(found.map((p) => [p.id, p]));

    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new HttpError(400, "Some products don't exist", { productIds: missing });
    }

    const lines = input.items.map(({ productId, quantity }) => {
      const product = byId.get(productId)!;
      return {
        productId,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity,
      };
    });

    // Take stock only if there's enough left. Doing the check inside the
    // UPDATE means two orders racing for the last item can't both win.
    for (const line of lines) {
      const updated = await tx
        .update(products)
        .set({ stockQuantity: sql`${products.stockQuantity} - ${line.quantity}` })
        .where(and(eq(products.id, line.productId), gte(products.stockQuantity, line.quantity)))
        .returning({ id: products.id });

      if (!updated.length) {
        const available = byId.get(line.productId)!.stockQuantity;
        throw new HttpError(409, `Not enough stock for "${line.productName}"`, {
          productId: line.productId,
          requested: line.quantity,
          available,
        });
      }
    }

    const totalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

    const [order] = await tx
      .insert(orders)
      .values({
        customerName: input.customerName,
        customerEmail: input.customerEmail.toLowerCase(),
        shippingAddress: input.shippingAddress,
        totalCents,
      })
      .returning();

    const items = await tx
      .insert(orderItems)
      .values(lines.map((l) => ({ ...l, orderId: order.id })))
      .returning();

    return { ...order, items };
  });
}

export async function changeOrderStatus(id: number, status: OrderStatus) {
  return db.transaction(async (tx) => {
    const order = await tx.query.orders.findFirst({
      where: eq(orders.id, id),
      with: { items: true },
    });
    if (!order) throw notFound("Order");

    if (!NEXT_STATUS[order.status].includes(status)) {
      throw new HttpError(409, `Can't move an order from "${order.status}" to "${status}"`, {
        allowed: NEXT_STATUS[order.status],
      });
    }

    if (status === "cancelled") {
      // Put the stock back. Items whose product has since been deleted are skipped.
      for (const item of order.items) {
        if (item.productId == null) continue;
        await tx
          .update(products)
          .set({ stockQuantity: sql`${products.stockQuantity} + ${item.quantity}` })
          .where(eq(products.id, item.productId));
      }
    }

    const [updated] = await tx.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return { ...updated, items: order.items };
  });
}
