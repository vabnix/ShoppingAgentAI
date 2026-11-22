# ShoppingAgentAI

A small online grocery store where customers shop by chatting with agents instead of clicking through pages.

There are two agents:

- **Shopping Assistant** finds products, compares them, reads reviews and places orders.
- **Order Support** looks up orders, explains where they are and cancels them.

Ask "what organic produce do you have under $5?" and the assistant searches the catalog, checks stock and ratings, and answers. Ask it to order two bunches of bananas and it reads the order back to you and waits for a "yes" before placing it.

## How it works

```
Browser (chat UI)
   │  POST /api/agent/chat, replies stream back as events
   ▼
Agent runtime ──── Claude (decides what to do and which tools to call)
   │
   │  MCP
   ▼
MCP server (search_products, place_order, cancel_order, ...)
   │
   ▼
Business logic (src/lib) ──── SQLite (via Drizzle)
   ▲
   │
REST API (/api/products, /api/orders, ...)
```

1. The chat UI sends your message to `/api/agent/chat`.
2. The agent runtime sends the conversation to Claude, along with the tools that agent is allowed to use.
3. When Claude wants to look something up or take an action, the runtime calls that tool on our MCP server and passes the result back to Claude.
4. This repeats until Claude has an answer, which streams back to the browser as it's written. Each tool call also shows up in the chat so you can see what the agent did.

The REST API and the MCP tools call the same functions in `src/lib`, so the rules are the same either way. Totals are worked out from catalog prices, an order can't take more stock than there is, and orders only move forward through their statuses.

## Why these tools

**Next.js** runs the UI and the API in one app with one dev server. No separate backend to deploy.

**SQLite + Drizzle.** SQLite is a single file, so there's nothing to install or run. Drizzle lets us write the schema in TypeScript and generates a SQL migration for every change. Those migrations are committed, so the `drizzle/` folder is a full history of how the database changed. CI fails if someone changes the schema without generating one.

**Zod** checks every piece of input before it touches the database: request bodies, query strings and the arguments an agent passes to a tool. We write each schema once and use it for three things:
- validating input and returning a clear error when it's wrong
- giving TypeScript the types, so the code and the checks can't disagree
- generating the OpenAPI spec behind the Swagger docs, so the docs always match what the API accepts

This matters more with agents. Claude usually sends valid tool arguments, but "usually" isn't good enough when the tool places an order.

**Model Context Protocol (MCP)** is an open standard for exposing tools to AI models. Instead of wiring our functions straight into one agent, we put them behind an MCP server. That gets us:
- **One tool layer for every agent.** Each agent picks the subset it's allowed to use. Order Support can't place orders because it isn't given that tool.
- **Outside clients for free.** Claude Desktop, Claude Code or MCP Inspector can connect to `/api/mcp` and use the same tools with no extra code.
- **A clean boundary.** The agent only sees tool names, descriptions and input schemas. It never touches the database directly.

**Claude (Anthropic API)** is the model behind the agents. It decides which tools to call and writes the replies. We run the agent loop ourselves, which keeps it simple to follow and lets it talk to an MCP server on localhost.

**Tailwind CSS** for styling, with a light and dark theme.

## Project layout

```
src/
  app/
    page.tsx              chat page
    api/agent/chat/       streams agent replies to the browser
    api/mcp/              MCP endpoint for outside clients
    api/products/, api/reviews/, api/orders/   REST API
    api-docs/             Swagger UI
  agents/
    definitions.ts        each agent's instructions and allowed tools
    runtime.ts            the loop between Claude and the MCP tools
  mcp/server.ts           MCP tool definitions
  lib/
    catalog.ts, orders.ts business logic shared by REST and MCP
    validation.ts         zod schemas
    openapi.ts            builds the OpenAPI spec from those schemas
  components/AgentChat.tsx  chat UI
  db/schema.ts            database tables
drizzle/                  generated SQL migrations (committed)
scripts/seed.mjs          sample products and reviews
```

## Getting started

You need Node.js 20 or later.

```bash
npm install
npm run db:migrate     # create the local database
npm run db:seed        # add sample products and reviews
npm run dev
```

Then open http://localhost:3000.

The agents need Claude credentials. Either run `ant auth login`, or copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. The catalog, API and docs work without it. Only the chat needs it.

## Useful URLs

| URL | What it is |
|---|---|
| http://localhost:3000 | Agent chat |
| http://localhost:3000/api-docs | Swagger docs. Try every endpoint from the browser |
| http://localhost:3000/api/openapi.json | Raw OpenAPI spec, for Postman or Insomnia |
| http://localhost:3000/api/mcp | MCP server (Streamable HTTP) |

To use the shop's tools from Claude Code:

```bash
claude mcp add --transport http shop http://localhost:3000/api/mcp
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | Lint |
| `npm run db:generate -- --name <change>` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Add sample data (`-- --reset` wipes products, reviews and orders first) |
| `npm run db:studio` | Browse the database in the browser |

## Changing the database

1. Edit `src/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description`.
3. Check the SQL file it writes in `drizzle/`, then run `npm run db:migrate`.
4. Commit the schema change and the new migration together.

Don't edit a migration that's already been committed. Fix mistakes with a new one.

## CI

Two GitHub Actions workflows run on every push to `main` and every pull request:

- **CI** (`.github/workflows/ci.yml`) installs dependencies, lints and runs a production build, which also type-checks the project.
- **DB migrations** (`.github/workflows/db-migrations.yml`) runs only when database files change. It fails if the schema changed without a migration, and checks that every migration applies cleanly to a fresh database.

## Not built yet

- **No login.** Anyone who can reach the app can place or cancel orders, through the chat, the API or MCP. Fine on your own machine, but it needs auth before going anywhere public.
- **No payments.** Orders are records only.
- **Chats aren't saved.** A conversation lives in the browser tab and is gone on refresh.
