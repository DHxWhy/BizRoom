/**
 * Full-screen loading overlay shown while the 3D scene is loading.
 */
export function LoadingScreen() {
  return (
    <div className="absolute inset-0 z-50 bg-neutral-950 flex flex-col items-center justify-center gap-6">
      {/* Animated logo */}
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 animate-pulse" />
        </div>
        <div className="absolute -inset-2 rounded-3xl border border-indigo-500/20 animate-ping" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold text-white mb-1">
          BizRoom
        </h2>
        <p className="text-sm text-neutral-500">
          회의실을 준비하고 있습니다...
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
      </div>

      <style>{`
        @keyframes loading {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 0; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
