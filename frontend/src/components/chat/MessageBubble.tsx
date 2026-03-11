import type { Message } from "../../types";
import { AgentAvatar } from "./AgentAvatar";
import { ArtifactPreview } from "../artifact/ArtifactPreview";

interface MessageBubbleProps {
  message: Message;
}

const AGENT_ICONS: Record<string, string> = {
  coo: "📋", cfo: "💰", cmo: "📣", cto: "🛠️", cdo: "🎨", clo: "⚖️",
};

const AGENT_COLORS: Record<string, string> = {
  coo: "border-l-blue-500",
  cfo: "border-l-emerald-500",
  cmo: "border-l-orange-500",
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAgent = message.senderType === "agent";
  const icon = AGENT_ICONS[message.senderRole] ?? "👤";
  const borderColor = isAgent ? (AGENT_COLORS[message.senderRole] ?? "border-l-neutral-500") : "";

  return (
    <div className={`flex gap-3 px-4 py-2 hover:bg-neutral-800/30 ${isAgent ? "items-start" : "items-start flex-row-reverse"}`}>
      {isAgent ? (
        <AgentAvatar icon={icon} name={message.senderName} status="online" />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {message.senderName.charAt(0)}
        </div>
      )}
      <div className={`max-w-[70%] ${isAgent ? "" : "text-right"}`}>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold">{message.senderName}</span>
          {isAgent && (
            <span className="text-xs text-neutral-500 uppercase">{message.senderRole}</span>
          )}
          <span className="text-xs text-neutral-600">
            {new Date(message.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className={`text-sm text-neutral-200 leading-relaxed ${isAgent ? `border-l-2 ${borderColor} pl-3` : ""}`}>
          {message.content}
        </div>
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {message.artifacts.map((artifact) => (
              <ArtifactPreview key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
