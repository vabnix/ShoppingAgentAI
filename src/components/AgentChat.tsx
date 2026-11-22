"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentEvent } from "@/agents/runtime";

export type PublicAgent = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  starters: string[];
};

type ToolPart = {
  kind: "tool";
  id: string;
  name: string;
  input: unknown;
  status: "running" | "ok" | "error";
  output?: string;
};
type Part = { kind: "text"; text: string } | ToolPart;
type AssistantMsg = { role: "assistant"; parts: Part[]; error?: string; streaming: boolean };
type ChatMessage = { role: "user"; text: string } | AssistantMsg;

type Conversation = {
  messages: ChatMessage[];
  // Anthropic-format history from the server, sent back as-is next turn.
  history: unknown[];
};

const empty = (): Conversation => ({ messages: [], history: [] });

const TOOL_LABELS: Record<string, string> = {
  search_products: "Searched products",
  get_product: "Looked up a product",
  list_reviews: "Read reviews",
  add_review: "Posted a review",
  place_order: "Placed an order",
  get_order: "Checked an order",
  list_orders: "Looked up orders",
  cancel_order: "Cancelled an order",
};

const AGENT_ICONS: Record<string, ReactNode> = {
  "shopping-assistant": <BagIcon />,
  "order-support": <BoxIcon />,
};

export function AgentChat({ agents }: { agents: PublicAgent[] }) {
  const [agentId, setAgentId] = useState(agents[0]?.id);
  const [convos, setConvos] = useState<Record<string, Conversation>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const convo = convos[agent.id] ?? empty();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [convo.messages]);

  // Grow the textarea with its content, up to the max height set in CSS.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    // Only show a scrollbar once it hits the max height. Otherwise macOS
    // "always show scrollbars" draws one in an empty box.
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, [input]);

  function updateConvo(id: string, fn: (c: Conversation) => Conversation) {
    setConvos((all) => ({ ...all, [id]: fn(all[id] ?? empty()) }));
  }

  // Applies a change to the assistant message that's currently streaming.
  function updateLast(id: string, fn: (m: AssistantMsg) => ChatMessage) {
    updateConvo(id, (c) => {
      const messages = [...c.messages];
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") messages[messages.length - 1] = fn(last);
      return { ...c, messages };
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const id = agent.id;
    const history = convo.history;

    setInput("");
    setBusy(true);
    updateConvo(id, (c) => ({
      ...c,
      messages: [...c.messages, { role: "user", text: message }, { role: "assistant", parts: [], streaming: true }],
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    // Where the current model turn's output starts, so a retry can drop it.
    let roundStart = 0;

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: id, message, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const event = JSON.parse(chunk.slice(6)) as AgentEvent;
          handleEvent(id, event, (n) => (roundStart = n), () => roundStart);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        updateLast(id, (m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      updateLast(id, (m) => ({ ...m, streaming: false }));
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function handleEvent(id: string, event: AgentEvent, setRound: (n: number) => void, getRound: () => number) {
    switch (event.type) {
      case "text":
        updateLast(id, (m) => {
          const parts = [...m.parts];
          const last = parts[parts.length - 1];
          if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + event.text };
          else parts.push({ kind: "text", text: event.text });
          return { ...m, parts };
        });
        break;
      case "tool_call":
        updateLast(id, (m) => ({
          ...m,
          parts: [...m.parts, { kind: "tool", id: event.id, name: event.name, input: event.input, status: "running" }],
        }));
        break;
      case "tool_result":
        updateLast(id, (m) => {
          const parts = m.parts.map((p) =>
            p.kind === "tool" && p.id === event.id
              ? { ...p, status: event.isError ? ("error" as const) : ("ok" as const), output: event.output }
              : p,
          );
          setRound(parts.length);
          return { ...m, parts };
        });
        break;
      case "retry":
        updateLast(id, (m) => ({ ...m, parts: m.parts.slice(0, getRound()) }));
        break;
      case "done":
        updateConvo(id, (c) => ({ ...c, history: event.messages }));
        break;
      case "error":
        updateLast(id, (m) => ({ ...m, error: event.message }));
        break;
    }
  }

  const hasMessages = convo.messages.length > 0;

  return (
    <div className="flex h-dvh w-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-neutral-200/70 bg-white/60 px-4 py-5 backdrop-blur md:flex dark:border-neutral-800/70 dark:bg-neutral-900/40">
        <div className="flex items-center gap-2.5 px-2">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm">
            <BagIcon />
          </div>
          <div>
            <div className="font-semibold tracking-tight">ShoppingAgentAI</div>
            <div className="text-xs text-neutral-500">Grocery agents over MCP</div>
          </div>
        </div>

        <div className="mt-8 px-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400">Agents</div>
        <nav className="mt-2 space-y-1">
          {agents.map((a) => {
            const active = a.id === agent.id;
            return (
              <button
                key={a.id}
                onClick={() => setAgentId(a.id)}
                disabled={busy}
                className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                }`}
              >
                <Avatar agentId={a.id} active={active} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{a.description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 px-2 text-xs text-neutral-500">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-neutral-800 dark:hover:text-neutral-200">
              <Chevron className="transition group-open:rotate-90" />
              {agent.tools.length} MCP tools available
            </summary>
            <ul className="mt-2 space-y-1 pl-4 font-mono text-[11px]">
              {agent.tools.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
          <div className="flex gap-4">
            <a href="/api-docs" className="hover:text-neutral-800 dark:hover:text-neutral-200">API docs</a>
            <span className="font-mono">/api/mcp</span>
          </div>
        </div>
      </aside>

      {/* Chat */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-200/70 bg-neutral-50/80 px-4 py-3 backdrop-blur md:px-6 dark:border-neutral-800/70 dark:bg-neutral-950/80">
          {/* Agent switcher for small screens, where the sidebar is hidden. */}
          <div className="flex gap-1 rounded-xl bg-neutral-200/60 p-1 md:hidden dark:bg-neutral-800/60">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => setAgentId(a.id)}
                disabled={busy}
                className={`rounded-lg px-3 py-1 text-sm transition ${
                  a.id === agent.id ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <Avatar agentId={agent.id} active />
            <div>
              <div className="text-sm font-medium">{agent.name}</div>
              <div className="text-xs text-neutral-500">{agent.description}</div>
            </div>
          </div>
          <button
            onClick={() => updateConvo(agent.id, empty)}
            disabled={busy || !hasMessages}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-200/60 disabled:pointer-events-none disabled:opacity-40 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <PlusIcon /> New chat
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-8 md:px-6">
            {!hasMessages ? (
              <EmptyState agent={agent} onPick={send} />
            ) : (
              <div className="space-y-8">
                {convo.messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-neutral-900 px-4 py-2.5 text-[15px] text-white dark:bg-neutral-100 dark:text-neutral-900">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <AssistantMessage key={i} agentId={agent.id} message={m} />
                  ),
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer floats over the bottom of the conversation. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-50 via-neutral-50/90 to-transparent pt-10 dark:from-neutral-950 dark:via-neutral-950/90">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="pointer-events-auto mx-auto mb-4 w-full max-w-3xl px-4 md:px-6"
          >
            <div className="flex items-end gap-2 rounded-3xl border border-neutral-200 bg-white p-2 pl-4 shadow-lg shadow-neutral-900/5 transition focus-within:border-emerald-500/60 focus-within:ring-4 focus-within:ring-emerald-500/10 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/30">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={`Ask ${agent.name}…`}
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-neutral-400"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:bg-neutral-200 disabled:text-neutral-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
                >
                  <ArrowUpIcon />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              Enter to send · Shift + Enter for a new line · The agent asks before placing or cancelling orders
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

function EmptyState({ agent, onPick }: { agent: PublicAgent; onPick: (s: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-600/20 [&_svg]:size-7">
        {AGENT_ICONS[agent.id] ?? <BagIcon />}
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">How can I help?</h2>
      <p className="mt-1.5 max-w-md text-neutral-500">{agent.description}</p>
      <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
        {agent.starters.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-2xl border border-neutral-200 bg-white p-4 text-left text-sm text-neutral-700 transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// Consecutive tool calls are shown as one compact row so a reply that needed
// several lookups doesn't turn into a stack of cards.
type Segment = { kind: "text"; text: string } | { kind: "tools"; tools: ToolPart[] };

function segment(parts: Part[]): Segment[] {
  const out: Segment[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (p.kind === "tool") {
      if (last?.kind === "tools") last.tools.push(p);
      else out.push({ kind: "tools", tools: [p] });
    } else if (p.text.trim()) {
      out.push({ kind: "text", text: p.text });
    }
  }
  return out;
}

function AssistantMessage({ agentId, message }: { agentId: string; message: AssistantMsg }) {
  const segments = segment(message.parts);
  const waiting = message.streaming && (segments.length === 0 || segments[segments.length - 1].kind === "tools");
  return (
    <div className="flex gap-3">
      <Avatar agentId={agentId} active small />
      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
        {segments.map((s, i) =>
          s.kind === "text" ? <Markdown key={i} text={s.text} /> : <ToolGroup key={i} tools={s.tools} />,
        )}
        {waiting && <TypingDots />}
        {message.error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {message.error}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolGroup({ tools }: { tools: ToolPart[] }) {
  const running = tools.some((t) => t.status === "running");
  const failed = tools.filter((t) => t.status === "error").length;

  // "Searched products ×2 · Read reviews"
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  const summary = [...counts]
    .map(([name, n]) => `${TOOL_LABELS[name] ?? name}${n > 1 ? ` ×${n}` : ""}`)
    .join(" · ");

  return (
    <details className="group w-fit max-w-full">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        {running ? (
          <span className="size-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        ) : failed ? (
          <span className="size-2 rounded-full bg-red-500" />
        ) : (
          <span className="size-2 rounded-full bg-emerald-500" />
        )}
        <span className="truncate">{summary}</span>
        {failed > 0 && !running && <span className="text-red-500">{failed} failed</span>}
        <Chevron className="shrink-0 transition group-open:rotate-90" />
      </summary>
      <div className="mt-2 space-y-2">
        {tools.map((t) => (
          <div key={t.id} className="rounded-xl border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-2 flex items-center gap-2 font-mono">
              <span>{t.name}</span>
              <span className={t.status === "error" ? "text-red-500" : t.status === "ok" ? "text-emerald-600" : "text-amber-500"}>
                {t.status === "error" ? "failed" : t.status === "ok" ? "done" : "running"}
              </span>
            </div>
            <Pre label="Input" text={JSON.stringify(t.input, null, 2)} />
            {t.output !== undefined && <Pre label="Output" text={t.output} />}
          </div>
        ))}
      </div>
    </details>
  );
}

function Pre({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-neutral-400">{label}</div>
      <pre className="max-h-56 overflow-auto rounded-lg bg-neutral-50 p-2 text-[11px] leading-relaxed dark:bg-neutral-950">{text}</pre>
    </div>
  );
}

function Avatar({ agentId, active, small }: { agentId: string; active?: boolean; small?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${small ? "size-7 [&_svg]:size-3.5" : "size-9 [&_svg]:size-4"} ${
        active
          ? "bg-gradient-to-br from-emerald-400 to-teal-600 text-white"
          : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"
      }`}
    >
      {AGENT_ICONS[agentId] ?? <BagIcon />}
    </span>
  );
}

function TypingDots() {
  return (
    <div className="flex h-6 items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-neutral-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

// Just enough markdown for chat replies: paragraphs, lists and **bold**.
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={blocks.length}
        className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 marker:text-neutral-400`}
      >
        {list.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();

  return <div className="space-y-3 text-[15px] leading-7 text-neutral-800 dark:text-neutral-200">{blocks}</div>;
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    piece.startsWith("**") && piece.endsWith("**") ? (
      <strong key={i} className="font-semibold text-neutral-950 dark:text-white">
        {piece.slice(2, -2)}
      </strong>
    ) : (
      piece
    ),
  );
}

// ---- Icons (inline so we don't pull in an icon library for six glyphs) ----

function svgProps(className?: string) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function BagIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M6 7h12l1 13H5L6 7Z" />
      <path d="M9 10V6a3 3 0 0 1 6 0v4" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg {...svgProps()}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg {...svgProps()} fill="currentColor" stroke="none">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)} width={12} height={12}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
