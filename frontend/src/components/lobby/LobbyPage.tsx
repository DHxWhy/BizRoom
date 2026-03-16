import { useState, useCallback, useEffect, useRef } from "react";
import { S } from "../../constants/strings";
import { useSessionRoom } from "../../hooks/useSessionRoom";
import { useMeetingDispatch } from "../../context/MeetingContext";
import { BrandMemoryForm } from "./BrandMemoryForm";
import { createEmptyBrandMemory } from "../../constants/brandPresets";
import type { BrandMemorySet } from "../../types";

type LobbyStep = "name" | "brandMemory" | "agenda" | "entering";

const SESSION_KEY_BRAND_MEMORY = "bizroom_brand_memory";

interface LobbyPageProps {
  /** Pre-filled room code from URL hash (join mode) */
  initialRoomCode?: string;
}

/** Load brand memory from sessionStorage */
function loadBrandMemory(): BrandMemorySet {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_BRAND_MEMORY);
    if (raw) return JSON.parse(raw) as BrandMemorySet;
  } catch {
    /* ignore */
  }
  return createEmptyBrandMemory();
}

/** Save brand memory to sessionStorage */
function saveBrandMemory(bm: BrandMemorySet): void {
  sessionStorage.setItem(SESSION_KEY_BRAND_MEMORY, JSON.stringify(bm));
}

export function LobbyPage({ initialRoomCode }: LobbyPageProps) {
  const { createRoom, enterRoom, joinRoom, savedUserName } = useSessionRoom();
  const dispatch = useMeetingDispatch();

  const [step, setStep] = useState<LobbyStep>("name");
  const [mode, setMode] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
  const [name, setName] = useState(savedUserName);
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [agenda, setAgenda] = useState("BizRoom Target Customer Definition");
  const [brandMemory, setBrandMemory] = useState<BrandMemorySet>(loadBrandMemory);
  const [error, setError] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const agendaInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "name") nameInputRef.current?.focus();
    if (step === "agenda") agendaInputRef.current?.focus();
  }, [step]);

  // Step 1: Name
  const handleNameSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError(S.lobby.nameLabel);
        return;
      }
      if (mode === "join") {
        const code = roomCode.trim().toUpperCase();
        if (!code || !/^BZ-[A-Z0-9]{4}$/.test(code)) {
          setError(S.lobby.roomIdPlaceholder);
          return;
        }
        joinRoom(code, trimmedName);
        return;
      }
      // Create mode: proceed to brand memory step
      createRoom(trimmedName);
      setStep("brandMemory");
    },
    [name, roomCode, mode, createRoom, joinRoom],
  );

  // Step 2: Brand Memory → next
  const handleBrandMemoryNext = useCallback(() => {
    saveBrandMemory(brandMemory);
    const hasRequired =
      brandMemory.companyName.trim() &&
      brandMemory.industry.trim() &&
      brandMemory.productName.trim();
    dispatch({
      type: "SET_BRAND_MEMORY",
      payload: hasRequired ? brandMemory : null,
    });
    setStep("agenda");
  }, [brandMemory, dispatch]);

  // Step 3: Agenda → enter room
  const handleAgendaSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      dispatch({
        type: "SET_LOBBY_AGENDA",
        payload: agenda.trim() || "General Meeting",
      });
      enterRoom();
    },
    [enterRoom, agenda, dispatch],
  );

  const handleRoomCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
          {/* Logo (always visible) */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {S.lobby.title}
              <span className="text-indigo-400">.ai</span>
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{S.lobby.subtitle}</p>
          </div>

          {/* Step indicator */}
          {mode === "create" && step !== "name" && (
            <div className="flex justify-center gap-2 mb-6">
              {(["name", "brandMemory", "agenda"] as const).map((s, i) => (
                <div
                  key={s}
                  className={`h-1 w-12 rounded-full transition-colors ${
                    ["name", "brandMemory", "agenda"].indexOf(step) >= i
                      ? "bg-indigo-500"
                      : "bg-neutral-800"
                  }`}
                />
              ))}
            </div>
          )}

          {/* ═══ STEP: NAME ═══ */}
          {step === "name" && (
            <>
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

              <form onSubmit={handleNameSubmit} className="space-y-4">
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

                {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {mode === "create" ? S.brandMemory.next : S.lobby.enterRoom}
                </button>
              </form>

              <p className="text-center text-neutral-600 text-xs mt-6">
                {mode === "create" ? S.lobby.createHint : S.lobby.joinHint}
              </p>
            </>
          )}

          {/* ═══ STEP: BRAND MEMORY ═══ */}
          {step === "brandMemory" && (
            <div className="max-h-[60vh] overflow-y-auto pr-1 -mr-1">
              <BrandMemoryForm
                value={brandMemory}
                onChange={(bm) => {
                  setBrandMemory(bm);
                  saveBrandMemory(bm);
                }}
                onNext={handleBrandMemoryNext}
                onBack={() => setStep("name")}
              />
            </div>
          )}

          {/* ═══ STEP: AGENDA ═══ */}
          {step === "agenda" && (
            <form onSubmit={handleAgendaSubmit} className="space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white">{S.agenda.stepTitle}</h2>
                <p className="text-neutral-400 text-sm mt-1">{S.agenda.stepSubtitle}</p>
              </div>

              <textarea
                ref={agendaInputRef}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder={S.agenda.placeholder}
                rows={3}
                className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("brandMemory")}
                  className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 font-medium transition-all"
                >
                  {S.brandMemory.back}
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  {S.lobby.enterRoom}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
