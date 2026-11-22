import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createShopMcpServer } from "@/mcp/server";

// Streamable HTTP endpoint for outside MCP clients (Claude Desktop, Claude Code,
// MCP Inspector). Stateless: a fresh server per request, so nothing to clean up.
// TODO: add auth before this is exposed anywhere public. It can place and cancel orders.
async function handle(req: Request) {
  const server = createShopMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
