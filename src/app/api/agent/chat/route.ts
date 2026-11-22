import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAgent } from "@/agents/definitions";
import { runAgent, type AgentEvent } from "@/agents/runtime";
import { z } from "@/lib/validation";

const ChatRequest = z.object({
  agentId: z.string(),
  message: z.string().trim().min(1).max(4000),
  // The conversation so far, exactly as the last "done" event returned it.
  // It's passed back untouched because Claude needs its thinking blocks.
  history: z.array(z.any()).max(400).default([]),
});

function friendlyError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The server couldn't authenticate with Claude. Set ANTHROPIC_API_KEY or run `ant auth login`, then restart the dev server.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now. Give it a few seconds and try again.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status}): ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export async function POST(req: Request) {
  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { agentId, message, history } = parsed.data;
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: `Unknown agent "${agentId}"` }, { status: 404 });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runAgent(agent, history, message, req.signal)) send(event);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(err);
          send({ type: "error", message: friendlyError(err) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
