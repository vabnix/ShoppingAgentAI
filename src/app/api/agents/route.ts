import { NextResponse } from "next/server";
import { AGENTS } from "@/agents/definitions";

// Public info only. System prompts stay on the server.
export function GET() {
  return NextResponse.json(
    AGENTS.map(({ id, name, description, tools, starters }) => ({ id, name, description, tools, starters })),
  );
}
