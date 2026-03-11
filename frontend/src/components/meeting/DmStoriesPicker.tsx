// Instagram Stories-style circular avatar agent picker
// Ref: Design Spec §5

import { memo } from "react";
import { S } from "../../constants/strings";
import type { AgentRole } from "../../types";

interface DmStoriesPickerProps {
  currentTarget: AgentRole | null;
  onSelect: (role: AgentRole) => void;
}

const AGENTS: {
  role: AgentRole;
  name: string;
  title: string;
  icon: string;
  color: string;
}[] = [
  { role: "coo", name: S.agents.coo.name, title: S.agents.coo.role, icon: "\u{1F4CB}", color: "#3b82f6" },
  { role: "cfo", name: S.agents.cfo.name, title: S.agents.cfo.role, icon: "\u{1F4B0}", color: "#10b981" },
  { role: "cmo", name: S.agents.cmo.name, title: S.agents.cmo.role, icon: "\u{1F4E3}", color: "#f97316" },
  { role: "cto", name: S.agents.cto.name, title: S.agents.cto.role, icon: "\u{1F6E0}", color: "#06b6d4" },
  { role: "cdo", name: S.agents.cdo.name, title: S.agents.cdo.role, icon: "\u{1F3A8}", color: "#ec4899" },
  { role: "clo", name: S.agents.clo.name, title: S.agents.clo.role, icon: "\u2696\uFE0F", color: "#84cc16" },
];

function AgentStoryAvatar({
  agent,
  isSelected,
  onSelect,
}: {
  agent: (typeof AGENTS)[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-center gap-1.5 min-w-[72px] group"
    >
      {/* Circular avatar with ring */}
      <div
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center text-2xl
          transition-all duration-300
          ${
            isSelected
              ? "ring-2 shadow-lg scale-105"
              : "ring-1 ring-neutral-700 group-hover:ring-neutral-500 group-hover:scale-105"
          }
        `}
        style={{
          "--tw-ring-color": isSelected ? agent.color : undefined,
          boxShadow: isSelected ? `0 0 20px ${agent.color}40` : undefined,
          background: isSelected
            ? `linear-gradient(135deg, ${agent.color}20, ${agent.color}10)`
            : "rgba(38, 38, 38, 0.6)",
        } as React.CSSProperties}
      >
        <span className="text-2xl">{agent.icon}</span>
        {/* Online indicator dot */}
        <div
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-neutral-950"
          style={{ backgroundColor: agent.color }}
        />
      </div>
      {/* Name + Role labels */}
      <div className="text-center">
        <p
          className={`text-xs font-medium ${isSelected ? "text-white" : "text-neutral-400"}`}
        >
          {agent.name}
        </p>
        <p className="text-[10px] text-neutral-500">{agent.title}</p>
      </div>
    </button>
  );
}

export const DmStoriesPicker = memo(function DmStoriesPicker({
  currentTarget,
  onSelect,
}: DmStoriesPickerProps) {
  return (
    <div className="py-4 px-2">
      <p className="text-xs text-neutral-500 text-center mb-3">
        {S.mode.selectDmAgent}
      </p>
      <div className="flex justify-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {AGENTS.map((agent) => (
          <AgentStoryAvatar
            key={agent.role}
            agent={agent}
            isSelected={currentTarget === agent.role}
            onSelect={() => onSelect(agent.role)}
          />
        ))}
      </div>
    </div>
  );
});
