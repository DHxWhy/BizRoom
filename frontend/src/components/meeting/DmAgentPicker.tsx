import { useCallback } from "react";
import { S } from "../../constants/strings";

interface DmAgentPickerProps {
  currentTarget: string | null;
  onSelect: (agentRole: string) => void;
}

const AGENTS = [
  { role: "coo", name: S.agents.coo.name, title: S.agents.coo.role, icon: "📋", color: "bg-blue-500/20 border-blue-500/40 text-blue-300" },
  { role: "cfo", name: S.agents.cfo.name, title: S.agents.cfo.role, icon: "💰", color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
  { role: "cmo", name: S.agents.cmo.name, title: S.agents.cmo.role, icon: "📣", color: "bg-orange-500/20 border-orange-500/40 text-orange-300" },
  { role: "cto", name: S.agents.cto.name, title: S.agents.cto.role, icon: "🛠️", color: "bg-purple-500/20 border-purple-500/40 text-purple-300" },
  { role: "cdo", name: S.agents.cdo.name, title: S.agents.cdo.role, icon: "🎨", color: "bg-pink-500/20 border-pink-500/40 text-pink-300" },
  { role: "clo", name: S.agents.clo.name, title: S.agents.clo.role, icon: "⚖️", color: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" },
] as const;

export function DmAgentPicker({ currentTarget, onSelect }: DmAgentPickerProps) {
  const handleSelect = useCallback(
    (role: string) => {
      onSelect(role);
    },
    [onSelect],
  );

  return (
    <div className="px-3 py-2 border-b border-neutral-700/30">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">
        {S.mode.selectDmAgent}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {AGENTS.map((agent) => {
          const isSelected = currentTarget === agent.role;
          return (
            <button
              key={agent.role}
              onClick={() => handleSelect(agent.role)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                border transition-all duration-150 whitespace-nowrap flex-shrink-0
                ${isSelected ? agent.color : "border-neutral-700/30 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"}
              `}
              aria-pressed={isSelected}
            >
              <span>{agent.icon}</span>
              <span>{agent.name}</span>
              <span className="text-[10px] opacity-60">{agent.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
