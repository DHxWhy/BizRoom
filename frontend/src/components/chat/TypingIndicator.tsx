import { S } from "../../constants/strings";

interface TypingIndicatorProps {
  typingAgents: string[];
}

export function TypingIndicator({ typingAgents }: TypingIndicatorProps) {
  if (typingAgents.length === 0) return null;

  const text = typingAgents.length === 1
    ? S.typing.single(typingAgents[0])
    : S.typing.multiple(typingAgents);

  return (
    <div className="px-4 py-2 text-xs text-neutral-400 flex items-center gap-2">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
      </span>
      {text}
    </div>
  );
}
