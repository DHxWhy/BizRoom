import type { ParticipantStatus } from "../../types";

interface AgentAvatarProps {
  icon: string;
  name: string;
  status: ParticipantStatus;
}

const STATUS_COLORS: Record<ParticipantStatus, string> = {
  online: "bg-green-500",
  typing: "bg-yellow-500 animate-pulse",
  busy: "bg-red-500",
  away: "bg-neutral-500",
};

export function AgentAvatar({ icon, name, status }: AgentAvatarProps) {
  return (
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-lg bg-neutral-700 flex items-center justify-center text-lg" title={name}>
        {icon}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${STATUS_COLORS[status]}`}
      />
    </div>
  );
}
