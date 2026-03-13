import React from "react";

interface SophiaMessageProps {
  text: string;
  timestamp?: string;
}

export const SophiaMessage: React.FC<SophiaMessageProps> = ({ text, timestamp }) => {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-l-2 border-amber-500 bg-amber-500/5 rounded-r-md">
      <span className="text-xs text-amber-500 font-semibold whitespace-nowrap">
        Sophia
      </span>
      <span className="text-xs text-gray-300">{text}</span>
      {timestamp && (
        <span className="text-[10px] text-gray-600 ml-auto whitespace-nowrap">{timestamp}</span>
      )}
    </div>
  );
};
