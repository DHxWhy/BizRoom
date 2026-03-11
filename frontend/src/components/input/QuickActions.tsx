import { S } from "../../constants/strings";
import type { QuickActionType } from "../../types";

interface QuickActionsProps {
  onAction: (action: QuickActionType) => void;
  disabled?: boolean;
}

const ACTIONS: { type: QuickActionType; icon: string; label: string }[] = [
  { type: "agree", icon: "👍", label: S.quickActions.agree },
  { type: "disagree", icon: "👎", label: S.quickActions.disagree },
  { type: "next", icon: "⏭️", label: S.quickActions.next },
  { type: "hold", icon: "🛑", label: S.quickActions.hold },
];

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex gap-1.5 px-3 pb-1.5 overflow-x-auto">
      {ACTIONS.map((action) => (
        <button
          key={action.type}
          onClick={() => onAction(action.type)}
          disabled={disabled}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800/60 hover:bg-neutral-700/70 disabled:opacity-30 text-xs transition-colors flex-shrink-0 border border-neutral-700/20"
          title={action.label}
        >
          <span>{action.icon}</span>
          <span className="text-neutral-300">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
