import { S } from "../../constants/strings";
import type { Participant } from "../../types";

interface SidebarProps {
  participants: Participant[];
  roomName: string;
}

const AGENT_ICONS: Record<string, string> = {
  coo: "📋",
  cfo: "💰",
  cmo: "📣",
  cto: "🛠️",
  cdo: "🎨",
  clo: "⚖️",
};

export function Sidebar({ participants, roomName }: SidebarProps) {
  const agents = participants.filter((p) => p.type === "agent");
  const humans = participants.filter((p) => p.type === "human");

  return (
    <>
      <div className="p-4 border-b border-neutral-800">
        <h1 className="text-lg font-bold">{S.app.name}</h1>
        <p className="text-xs text-neutral-400 mt-0.5">{S.app.tagline}</p>
      </div>
      <div className="p-3">
        <div className="px-3 py-2 rounded-lg bg-neutral-800/50 text-sm font-medium">
          # {roomName}
        </div>
      </div>
      <div className="px-4 mt-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          {S.sidebar.agents}
        </h3>
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-800/50">
            <span>{AGENT_ICONS[agent.role] ?? "🤖"}</span>
            <span className="text-sm">{agent.name}</span>
            <span className="text-xs text-neutral-500 ml-auto">{agent.role.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="px-4 mt-4">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          {S.sidebar.humans}
        </h3>
        {humans.map((human) => (
          <div key={human.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-800/50">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">{human.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}
