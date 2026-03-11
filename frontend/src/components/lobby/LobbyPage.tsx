import { useState, useCallback, useEffect, useRef } from "react";
import { S } from "../../constants/strings";
import { useSessionRoom } from "../../hooks/useSessionRoom";

interface LobbyPageProps {
  /** Pre-filled room code from URL hash (join mode) */
  initialRoomCode?: string;
}

export function LobbyPage({ initialRoomCode }: LobbyPageProps) {
  const { createRoom, joinRoom, savedUserName } = useSessionRoom();

  const [mode, setMode] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
  const [name, setName] = useState(savedUserName);
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [error, setError] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError(S.lobby.nameLabel);
        return;
      }

      if (mode === "create") {
        createRoom(trimmedName);
      } else {
        const code = roomCode.trim().toUpperCase();
        if (!code || !/^BZ-[A-Z0-9]{4}$/.test(code)) {
          setError(S.lobby.roomIdPlaceholder);
          return;
        }
        joinRoom(code, trimmedName);
      }
    },
    [name, roomCode, mode, createRoom, joinRoom],
  );

  const handleRoomCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-uppercase, max 7 chars (BZ-XXXX)
    const val = e.target.value.toUpperCase().slice(0, 7);
    setRoomCode(val);
  }, []);

  return (
    <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/5 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-purple-600/4 blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-neutral-950/70 backdrop-blur-2xl rounded-2xl border border-neutral-700/30 shadow-2xl shadow-black/50 p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {S.lobby.title}
              <span className="text-indigo-400">.ai</span>
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{S.lobby.subtitle}</p>
          </div>

          {/* Tab toggle */}
          <div className="flex bg-neutral-900/60 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("create");
                setError("");
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "create"
                  ? "bg-indigo-600/80 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {S.lobby.createRoomTab}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("join");
                setError("");
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "join"
                  ? "bg-indigo-600/80 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {S.lobby.joinRoomTab}
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name input */}
            <div>
              <label
                htmlFor="lobby-name-input"
                className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider"
              >
                {S.lobby.nameLabel}
              </label>
              <input
                ref={nameInputRef}
                id="lobby-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={S.lobby.namePlaceholder}
                maxLength={20}
                className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>

            {/* Room code input (join mode only) */}
            {mode === "join" && (
              <div>
                <label
                  htmlFor="lobby-room-input"
                  className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider"
                >
                  {S.lobby.roomCode}
                </label>
                <input
                  id="lobby-room-input"
                  type="text"
                  value={roomCode}
                  onChange={handleRoomCodeChange}
                  placeholder={S.lobby.roomIdPlaceholder}
                  className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all font-mono text-center text-lg tracking-widest"
                />
              </div>
            )}

            {/* Error message */}
            {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}

            {/* Submit button */}
            <button
              type="submit"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              {mode === "create" ? S.lobby.createRoom : S.lobby.enterRoom}
            </button>
          </form>

          {/* Footer hint */}
          <p className="text-center text-neutral-600 text-xs mt-6">
            {mode === "create" ? S.lobby.createHint : S.lobby.joinHint}
          </p>
        </div>
      </div>
    </div>
  );
}
