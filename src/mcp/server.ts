import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { HttpError } from "@/lib/api";
import { addReview, getProduct, listProducts, listReviews } from "@/lib/catalog";
import { changeOrderStatus, getOrder, listOrders, placeOrder } from "@/lib/orders";
import { z } from "@/lib/validation";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Adds a readable price next to the cents so the model doesn't have to do the
// conversion (and get it wrong) when talking to customers.
function withPrices<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row };
  for (const key of ["priceCents", "unitPriceCents", "totalCents"] as const) {
    if (typeof row[key] === "number") out[key.replace("Cents", "")] = dollars(row[key] as number);
  }
  return out;
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Turn our app errors into tool errors the model can read and recover from,
// instead of an opaque "internal error".
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    let message = "Something went wrong";
    if (err instanceof HttpError) {
      message = err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message;
    } else if (err instanceof ZodError) {
      message = `Invalid input: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
    } else {
      console.error(err);
    }
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

const id = z.number().int().positive();

export function createShopMcpServer() {
  const server = new McpServer({ name: "shopping-agent-ai", version: "0.1.0" });

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Find products in the catalog. All filters are optional; call with no filters to browse. Prices are in cents.",
      inputSchema: {
        search: z.string().optional().describe("Part of the product name, e.g. 'apple'"),
        category: z.string().optional().describe("Exact category, e.g. 'produce'"),
        isOrganic: z.boolean().optional(),
        maxPriceCents: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    ({ limit, ...filters }) =>
      run(async () => (await listProducts({ ...filters, limit, offset: 0 })).map(withPrices)),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description: "Full details for one product, including stock and its five most recent reviews.",
      inputSchema: { productId: id },
      annotations: { readOnlyHint: true },
    },
    ({ productId }) =>
      run(async () => {
        const product = await getProduct(productId);
        const reviews = await listReviews(productId);
        return { ...withPrices(product), reviewCount: reviews.length, recentReviews: reviews.slice(0, 5) };
      }),
  );

  server.registerTool(
    "list_reviews",
    {
      title: "List reviews",
      description: "All reviews for a product, newest first.",
      inputSchema: { productId: id },
      annotations: { readOnlyHint: true },
    },
    ({ productId }) => run(() => listReviews(productId)),
  );

  server.registerTool(
    "add_review",
    {
      title: "Add a review",
      description: "Post a customer's review of a product. Rating is a whole number from 1 to 5.",
      inputSchema: {
        productId: id,
        reviewerName: z.string().trim().min(1).max(100),
        rating: z.number().int().min(1).max(5),
        title: z.string().max(200).optional(),
        comment: z.string().max(5000).optional(),
      },
    },
    ({ productId, ...review }) => run(() => addReview(productId, review)),
  );

  server.registerTool(
    "place_order",
    {
      title: "Place an order",
      description:
        "Place an order and take the items out of stock. Prices come from the catalog. Only call this after the customer has confirmed the items, quantities, name, email and shipping address.",
      inputSchema: {
        customerName: z.string().trim().min(1).max(200),
        customerEmail: z.email(),
        shippingAddress: z.string().trim().min(1).max(500),
        items: z
          .array(z.object({ productId: id, quantity: z.number().int().min(1).max(1000) }))
          .min(1)
          .max(100),
      },
    },
    (input) =>
      run(async () => {
        const order = await placeOrder(input);
        return { ...withPrices(order), items: order.items.map(withPrices) };
      }),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description: "An order with its line items and current status.",
      inputSchema: { orderId: id },
      annotations: { readOnlyHint: true },
    },
    ({ orderId }) =>
      run(async () => {
        const order = await getOrder(orderId);
        return { ...withPrices(order), items: order.items.map(withPrices) };
      }),
  );

  server.registerTool(
    "list_orders",
    {
      title: "List a customer's orders",
      description: "Orders placed with an email address, newest first. Optionally filter by status.",
      inputSchema: {
        customerEmail: z.email(),
        status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ customerEmail, status }) =>
      run(async () => (await listOrders({ customerEmail, status, limit: 20, offset: 0 })).map(withPrices)),
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel an order",
      description:
        "Cancel a pending or paid order and put its stock back. Shipped or delivered orders can't be cancelled. Only call this after the customer has confirmed.",
      inputSchema: { orderId: id },
      annotations: { destructiveHint: true },
    },
    ({ orderId }) =>
      run(async () => {
        const order = await changeOrderStatus(orderId, "cancelled");
        return { ...withPrices(order), items: order.items.map(withPrices) };
      }),
  );

  return server;
}
