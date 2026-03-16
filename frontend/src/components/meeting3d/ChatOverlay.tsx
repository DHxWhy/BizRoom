import { useState, useCallback, type ReactNode } from "react";

interface ChatOverlayProps {
  children: ReactNode;
  /** Is the meeting active? */
  isActive: boolean;
}

/**
 * Semi-transparent chat panel that overlays on the 3D scene.
 * Can be collapsed/expanded and resized.
 */
export function ChatOverlay({ children, isActive }: ChatOverlayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggle = useCallback(() => setIsCollapsed((v) => !v), []);

  if (!isActive) return null;

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 flex flex-col transition-all duration-300 ease-out ${
        isCollapsed ? "w-12" : "w-[min(380px,85vw)]"
      }`}
    >
      {/* Collapse/Expand toggle */}
      <button
        onClick={toggle}
        className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 z-20
                   w-6 h-16 bg-neutral-900/80 backdrop-blur-md border border-neutral-700/50
                   rounded-l-lg flex items-center justify-center
                   hover:bg-neutral-800/80 transition-colors"
        title={isCollapsed ? "채팅 열기" : "채팅 접기"}
        aria-label={isCollapsed ? "채팅 패널 열기" : "채팅 패널 접기"}
        aria-expanded={!isCollapsed}
      >
        <svg
          className={`w-3 h-3 text-neutral-400 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {/* Chat panel */}
      {!isCollapsed && (
        <div className="flex-1 flex flex-col bg-neutral-950/75 backdrop-blur-xl border-l border-neutral-700/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800/50">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-neutral-300">
              Meeting Chat
            </span>
          </div>

          {/* Chat content (messages + input) */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        </div>
      )}

      {/* Collapsed indicator */}
      {isCollapsed && (
        <div className="flex-1 bg-neutral-950/60 backdrop-blur-md border-l border-neutral-700/30 flex flex-col items-center pt-4 gap-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span
            className="text-[10px] text-neutral-500 writing-mode-vertical"
            style={{ writingMode: "vertical-rl" }}
          >
            CHAT
          </span>
        </div>
      )}
    </div>
  );
}
