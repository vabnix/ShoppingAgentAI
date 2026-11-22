import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createShopMcpServer } from "@/mcp/server";
import type { AgentDefinition } from "./definitions";

type MessageParam = Anthropic.Beta.BetaMessageParam;

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; isError: boolean; output: string }
  // The current model turn failed partway and is being re-run, so the UI
  // should drop anything it showed since the last tool round.
  | { type: "retry" }
  | { type: "done"; messages: MessageParam[]; stopReason: string | null }
  | { type: "error"; message: string };

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 12;
const MAX_STREAM_RETRIES = 2;

const anthropic = new Anthropic();

// Connects to our MCP server in-process. The agent still only sees what the
// server advertises over MCP, the same as an outside client would.
async function connectMcp() {
  const server = createShopMcpServer();
  const client = new Client({ name: "shop-agent", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: () => client.close() };
}

function resultText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const blocks = Array.isArray(result.content) ? result.content : [];
  return blocks
    .map((b) => (b.type === "text" ? b.text : `[${b.type} content]`))
    .join("\n");
}

export async function* runAgent(
  agent: AgentDefinition,
  history: MessageParam[],
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const mcp = await connectMcp();
  try {
    const { tools: mcpTools } = await mcp.client.listTools();
    const tools: Anthropic.Beta.BetaTool[] = mcpTools
      .filter((t) => agent.tools.includes(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description ?? t.title ?? t.name,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        // The MCP server validates every input with zod before running, so
        // streaming inputs unbuffered is safe here.
        eager_input_streaming: true,
      }));

    const messages: MessageParam[] = [...history, { role: "user", content: userMessage }];
    let retries = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = anthropic.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 64000,
          system: agent.system,
          tools,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          // Caches the system prompt, tools and history between turns.
          cache_control: { type: "ephemeral" },
          // If the model declines for safety reasons, the API retries on a
          // fallback model inside the same call instead of just stopping.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );

      let message: Anthropic.Beta.BetaMessage;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
        }
        message = await stream.finalMessage();
        retries = 0;
      } catch (err) {
        // API errors (auth, rate limit, overloaded) go straight to the user.
        // Anything else is a dropped connection or a tool input the SDK
        // couldn't parse, which is worth one or two more tries.
        if (err instanceof Anthropic.APIError || signal?.aborted || retries++ >= MAX_STREAM_RETRIES) {
          throw err;
        }
        yield { type: "retry" };
        turn--;
        continue;
      }

      // Thinking blocks have to go back unchanged on later turns, so we keep
      // the whole content array, not just the text.
      messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") {
        yield { type: "text", text: "\n\nSorry, I can't help with that one." };
        yield { type: "done", messages, stopReason: message.stop_reason };
        return;
      }

      const toolUses = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );

      // Hitting the token cap mid tool call means the input is probably cut off.
      if (toolUses.length > 0 && message.stop_reason === "max_tokens") {
        throw new Error("The reply was cut off while calling a tool. Please try again.");
      }

      if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
        yield { type: "done", messages, stopReason: message.stop_reason };
        return;
      }

      for (const t of toolUses) yield { type: "tool_call", id: t.id, name: t.name, input: t.input };

      // Run this round's tools together and send every result back in one
      // message, which keeps Claude willing to call tools in parallel.
      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          let output: string;
          let isError: boolean;
          if (!agent.tools.includes(t.name)) {
            output = `Tool ${t.name} isn't available to this agent.`;
            isError = true;
          } else {
            try {
              const result = await mcp.client.callTool({
                name: t.name,
                arguments: (t.input ?? {}) as Record<string, unknown>,
              });
              output = resultText(result);
              isError = Boolean(result.isError);
            } catch (err) {
              output = `Tool call failed: ${err instanceof Error ? err.message : String(err)}`;
              isError = true;
            }
          }
          return { type: "tool_result", tool_use_id: t.id, content: output, is_error: isError };
        }),
      );

      for (const r of results) {
        yield {
          type: "tool_result",
          id: r.tool_use_id,
          isError: Boolean(r.is_error),
          output: typeof r.content === "string" ? r.content : "",
        };
      }

      messages.push({ role: "user", content: results });
    }

    yield { type: "text", text: "\n\nI've hit my limit of steps for one message. Could you narrow it down a bit?" };
    yield { type: "done", messages, stopReason: "max_turns" };
  } finally {
    await mcp.close();
  }
}
