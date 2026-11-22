import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";

export function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
