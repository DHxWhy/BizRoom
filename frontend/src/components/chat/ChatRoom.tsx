import { useEffect, useRef } from "react";
import type { Message } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface ChatRoomProps {
  messages: Message[];
  typingAgents: string[];
}

export function ChatRoom({ messages, typingAgents }: ChatRoomProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingAgents.length]);

  return (
    <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="회의 채팅">
      <div className="py-4 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <TypingIndicator typingAgents={typingAgents} />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
