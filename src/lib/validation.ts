import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Adds .openapi() to zod so these same schemas drive the Swagger docs.
extendZodWithOpenApi(z);

export { z };

export const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ example: 1 }),
});

// ---- Products ----

export const Product = z
  .object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    imageUrl: z.string().nullable(),
    priceCents: z.number().int().openapi({ example: 499 }),
    rating: z.number().nullable().openapi({ example: 4.5 }),
    isOrganic: z.boolean(),
    stockQuantity: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Product");

export const CreateProduct = z
  .object({
    name: z.string().trim().min(1).max(200).openapi({ example: "Honeycrisp Apples" }),
    description: z.string().max(5000).nullish(),
    brand: z.string().max(100).nullish(),
    category: z.string().max(100).nullish().openapi({ example: "produce" }),
    imageUrl: z.url().nullish(),
    priceCents: z.number().int().nonnegative().openapi({ example: 499 }),
    isOrganic: z.boolean().optional(),
    stockQuantity: z.number().int().nonnegative().optional(),
  })
  // rating is left out on purpose: it's worked out from the reviews.
  .strict()
  .openapi("CreateProduct");

export const UpdateProduct = CreateProduct.partial()
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to update")
  .openapi("UpdateProduct");

export const ProductListQuery = z.object({
  category: z.string().optional(),
  isOrganic: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional().openapi({ description: "Matches part of the product name" }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ProductList = z
  .object({
    items: z.array(Product),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("ProductList");

// ---- Reviews ----

export const Review = z
  .object({
    id: z.number().int(),
    productId: z.number().int(),
    reviewerName: z.string(),
    rating: z.number().int().min(1).max(5),
    title: z.string().nullable(),
    comment: z.string().nullable(),
    isVerifiedPurchase: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .openapi("Review");

export const CreateReview = z
  .object({
    reviewerName: z.string().trim().min(1).max(100).openapi({ example: "Sam" }),
    rating: z.number().int().min(1).max(5).openapi({ example: 5 }),
    title: z.string().max(200).nullish(),
    comment: z.string().max(5000).nullish(),
    isVerifiedPurchase: z.boolean().optional(),
  })
  .strict()
  .openapi("CreateReview");

export const UpdateReview = CreateReview.partial()
  .refine((v) => Object.keys(v).length > 0, "Send at least one field to update")
  .openapi("UpdateReview");

// ---- Orders ----

export const OrderStatus = z
  .enum(["pending", "paid", "shipped", "delivered", "cancelled"])
  .openapi("OrderStatus");

export const OrderItem = z
  .object({
    id: z.number().int(),
    orderId: z.number().int(),
    productId: z.number().int().nullable().openapi({ description: "null if the product was deleted later" }),
    productName: z.string(),
    unitPriceCents: z.number().int(),
    quantity: z.number().int(),
  })
  .openapi("OrderItem");

export const Order = z
  .object({
    id: z.number().int(),
    customerName: z.string(),
    customerEmail: z.string(),
    shippingAddress: z.string(),
    status: OrderStatus,
    totalCents: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Order");

export const OrderWithItems = Order.extend({ items: z.array(OrderItem) }).openapi("OrderWithItems");

export const CreateOrder = z
  .object({
    customerName: z.string().trim().min(1).max(200).openapi({ example: "Sam Lee" }),
    customerEmail: z.email().openapi({ example: "sam@example.com" }),
    shippingAddress: z.string().trim().min(1).max(500).openapi({ example: "1 Main St, Springfield" }),
    items: z
      .array(
        z.object({
          productId: z.number().int().positive().openapi({ example: 1 }),
          quantity: z.number().int().min(1).max(1000).openapi({ example: 2 }),
        }),
      )
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map((i) => i.productId)).size === items.length,
        "Each product should appear once. Bump the quantity instead.",
      ),
  })
  .strict()
  .openapi("CreateOrder", {
    description: "Prices and the total are worked out on the server from current product prices.",
  });

export const UpdateOrderStatus = z
  .object({ status: OrderStatus })
  .strict()
  .openapi("UpdateOrderStatus");

export const OrderListQuery = z.object({
  status: OrderStatus.optional(),
  customerEmail: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const OrderList = z
  .object({
    items: z.array(Order),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("OrderList");

export const ApiError = z
  .object({
    error: z.string(),
    details: z.unknown().optional(),
  })
  .openapi("Error");
