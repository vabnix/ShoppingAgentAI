import { AGENTS } from "@/agents/definitions";
import { AgentChat, type PublicAgent } from "@/components/AgentChat";

export default function Home() {
  // System prompts stay on the server; the browser only gets what it shows.
  const agents: PublicAgent[] = AGENTS.map(({ id, name, description, tools, starters }) => ({
    id,
    name,
    description,
    tools,
    starters,
  }));
  return <AgentChat agents={agents} />;
}
