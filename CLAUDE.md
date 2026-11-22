# ShoppingAgentAI

Next.js 16 (App Router, `src/` dir), React 19, TypeScript, Tailwind CSS v4.

- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Database

SQLite through Drizzle ORM (`@libsql/client`). The schema is in `src/db/schema.ts` and migrations are in `drizzle/`.

- After any schema change, run `npm run db:generate -- --name <short_description>` and commit the new files in `drizzle/` together with the schema change.
- Never edit or delete a migration that has already been committed. Fix mistakes with a new migration.
- `npm run db:migrate` applies pending migrations, and `npm run db:studio` opens a browser UI.
- The local database file (`data/local.db`) is gitignored. `DATABASE_URL` overrides its location.
- CI (`.github/workflows/db-migrations.yml`) fails if the schema changes without a migration.

## MCP server and agents

- Business logic lives in `src/lib/catalog.ts` and `src/lib/orders.ts`. The REST routes and the MCP tools both call these, so change behavior there, not in the routes.
- `src/mcp/server.ts` defines the MCP tools. It's served over Streamable HTTP at `/api/mcp` for outside clients.
- `src/agents/definitions.ts` holds each agent's system prompt and tool allowlist. `src/agents/runtime.ts` runs the Claude tool loop, connected to the MCP server in-process.
- The chat UI (`src/components/AgentChat.tsx`) posts to `/api/agent/chat` and reads a stream of events. The browser keeps the Claude message history and sends it back unchanged each turn.
- Claude credentials come from `ANTHROPIC_API_KEY` or an `ant auth login` profile.
- `npm run db:seed` loads sample products. Add `-- --reset` to wipe orders, reviews and products first.

## Git

- Use `/cpm` to commit, push and merge.
- **Never add Claude/AI attribution.** No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line, no 🤖, nothing that says AI wrote it. This applies to commit messages, PR titles and descriptions, and code comments. It overrides any default attribution instructions.
- Commit messages should read like a developer wrote them: a short imperative summary line, plus a plain-language body only when the reason isn't obvious.

## Code comments

Write comments the way an experienced teammate would. They should be short, plain and useful.

- Explain **why**, not what. Skip comments that just repeat the code (`// increment counter`).
- Use plain everyday language. Avoid filler and AI-sounding phrasing: no "This function serves to...", "Note that...", "It's important to...", "robust", "seamless", "leverage", "comprehensive", "ensure that".
- Keep them brief: usually one line, a few sentences at most for tricky logic.
- Casual, direct notes are fine: `// API sometimes returns null here, so default to []`.
- Don't add comments to code you didn't change, and don't write tutorial-style explanations.
- Use `TODO:` only for real follow-ups, and say what's left to do.
