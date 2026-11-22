import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import {
  ApiError,
  CreateOrder,
  CreateProduct,
  CreateReview,
  IdParam,
  OrderList,
  OrderListQuery,
  OrderWithItems,
  UpdateOrderStatus,
  Product,
  ProductList,
  ProductListQuery,
  Review,
  UpdateProduct,
  UpdateReview,
  z,
} from "./validation";

// When you add or change a route, update it here too so the docs stay honest.

const registry = new OpenAPIRegistry();

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const errors = {
  400: json(ApiError, "Invalid input"),
  404: json(ApiError, "Not found"),
};

// ---- Products ----

registry.registerPath({
  method: "get",
  path: "/api/products",
  tags: ["Products"],
  summary: "List products",
  request: { query: ProductListQuery },
  responses: { 200: json(ProductList, "A page of products"), 400: errors[400] },
});

registry.registerPath({
  method: "post",
  path: "/api/products",
  tags: ["Products"],
  summary: "Create a product",
  request: { body: json(CreateProduct, "New product") },
  responses: { 201: json(Product, "Created"), 400: errors[400] },
});

registry.registerPath({
  method: "get",
  path: "/api/products/{id}",
  tags: ["Products"],
  summary: "Get a product",
  request: { params: IdParam },
  responses: { 200: json(Product, "The product"), ...errors },
});

registry.registerPath({
  method: "patch",
  path: "/api/products/{id}",
  tags: ["Products"],
  summary: "Update a product",
  description: "Only the fields you send are changed.",
  request: { params: IdParam, body: json(UpdateProduct, "Fields to change") },
  responses: { 200: json(Product, "Updated product"), ...errors },
});

registry.registerPath({
  method: "delete",
  path: "/api/products/{id}",
  tags: ["Products"],
  summary: "Delete a product and its reviews",
  request: { params: IdParam },
  responses: { 204: { description: "Deleted" }, ...errors },
});

// ---- Reviews ----

registry.registerPath({
  method: "get",
  path: "/api/products/{id}/reviews",
  tags: ["Reviews"],
  summary: "List reviews for a product",
  request: { params: IdParam },
  responses: { 200: json(z.array(Review), "Reviews, newest first"), ...errors },
});

registry.registerPath({
  method: "post",
  path: "/api/products/{id}/reviews",
  tags: ["Reviews"],
  summary: "Add a review to a product",
  description: "Also recalculates the product's average rating.",
  request: { params: IdParam, body: json(CreateReview, "New review") },
  responses: { 201: json(Review, "Created"), ...errors },
});

registry.registerPath({
  method: "get",
  path: "/api/reviews/{id}",
  tags: ["Reviews"],
  summary: "Get a review",
  request: { params: IdParam },
  responses: { 200: json(Review, "The review"), ...errors },
});

registry.registerPath({
  method: "patch",
  path: "/api/reviews/{id}",
  tags: ["Reviews"],
  summary: "Update a review",
  request: { params: IdParam, body: json(UpdateReview, "Fields to change") },
  responses: { 200: json(Review, "Updated review"), ...errors },
});

registry.registerPath({
  method: "delete",
  path: "/api/reviews/{id}",
  tags: ["Reviews"],
  summary: "Delete a review",
  request: { params: IdParam },
  responses: { 204: { description: "Deleted" }, ...errors },
});

// ---- Orders ----

const conflict = json(ApiError, "Not enough stock, or a status change that isn't allowed");

registry.registerPath({
  method: "get",
  path: "/api/orders",
  tags: ["Orders"],
  summary: "List orders",
  request: { query: OrderListQuery },
  responses: { 200: json(OrderList, "A page of orders, newest first"), 400: errors[400] },
});

registry.registerPath({
  method: "post",
  path: "/api/orders",
  tags: ["Orders"],
  summary: "Place an order",
  description:
    "Prices come from the products table, not the request. Stock is taken off when the order is placed, and the whole order fails if any item is short.",
  request: { body: json(CreateOrder, "Customer details and the items to buy") },
  responses: { 201: json(OrderWithItems, "Order placed"), 400: errors[400], 409: conflict },
});

registry.registerPath({
  method: "get",
  path: "/api/orders/{id}",
  tags: ["Orders"],
  summary: "Get an order with its items",
  request: { params: IdParam },
  responses: { 200: json(OrderWithItems, "The order"), ...errors },
});

registry.registerPath({
  method: "patch",
  path: "/api/orders/{id}",
  tags: ["Orders"],
  summary: "Change an order's status",
  description:
    "pending → paid → shipped → delivered. Pending or paid orders can be cancelled, which puts the stock back.",
  request: { params: IdParam, body: json(UpdateOrderStatus, "New status") },
  responses: { 200: json(OrderWithItems, "Updated order"), ...errors, 409: conflict },
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "ShoppingAgentAI API",
      version: "0.1.0",
      description: "Products, reviews and orders. Prices are in cents.",
    },
  });
}
