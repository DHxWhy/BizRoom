// Slide-out drawer for viewing and downloading meeting artifacts.
// Overlays the right side of the screen with a premium glass panel.

import { memo, useState, useCallback, useRef, useEffect } from "react";
import type {
  BigScreenUpdateEvent,
  SophiaMessageEvent,
  Artifact,
  ArtifactsReadyEvent,
  VisualType,
} from "../../types";
import { S } from "../../constants/strings";
import { renderToCanvas } from "../meeting3d/BigScreenRenderer";

// ── Props ──

export interface ArtifactDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bigScreenHistory: BigScreenUpdateEvent[];
  sophiaMessages: SophiaMessageEvent[];
  artifacts: Artifact[];
  readyArtifacts: ArtifactsReadyEvent | null;
}

// ── Badge labels for visual types ──

const VISUAL_TYPE_LABEL: Record<VisualType, string> = {
  comparison: "비교표",
  "pie-chart": "파이차트",
  "bar-chart": "막대차트",
  timeline: "타임라인",
  checklist: "체크리스트",
  summary: "요약",
  architecture: "아키텍처",
};

const FILE_TYPE_BADGE: Record<string, string> = {
  pptx: "PPT",
  xlsx: "Excel",
  pdf: "PDF",
  planner: "Planner",
};

// ── Sub-components ──

/** Collapsible section with animated expand/collapse */
const DrawerSection = memo(function DrawerSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-neutral-800/40 last:border-b-0">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3
                   hover:bg-neutral-800/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">{title}</span>
          {count > 0 && (
            <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10
                           border border-indigo-500/20 rounded-full px-1.5 py-0.5">
              {count}
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-3">{children}</div>
      </div>
    </div>
  );
});

/** Inline preview of a BigScreen visual — renders to a small canvas */
const VisualPreview = memo(function VisualPreview({
  event,
}: {
  event: BigScreenUpdateEvent;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void renderToCanvas(canvas, event).then(() => setRendered(true));
  }, [event]);

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-neutral-700/30 bg-neutral-950/60">
      <canvas
        ref={canvasRef}
        className={`w-full h-auto transition-opacity duration-300 ${
          rendered ? "opacity-100" : "opacity-0"
        }`}
        style={{ aspectRatio: "16 / 9" }}
      />
    </div>
  );
});

/** Single BigScreen history item */
const VisualItem = memo(function VisualItem({
  event,
  index,
  total,
}: {
  event: BigScreenUpdateEvent;
  index: number;
  total: number;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const label = VISUAL_TYPE_LABEL[event.visualType] ?? event.visualType;

  return (
    <div
      className="opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="bg-neutral-900/40 backdrop-blur-sm border border-neutral-700/20
                      rounded-xl p-3 hover:border-neutral-600/30 transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-200 truncate">{event.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10
                             border border-indigo-500/20 rounded px-1.5 py-0.5">
                {label}
              </span>
              <span className="text-[10px] text-neutral-500">
                #{total - index}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300
                       bg-indigo-500/10 hover:bg-indigo-500/20
                       border border-indigo-500/20 rounded-lg px-2 py-1
                       transition-all flex-shrink-0"
          >
            {showPreview ? S.drawer.close : S.drawer.preview}
          </button>
        </div>
        {showPreview && <VisualPreview event={event} />}
      </div>
    </div>
  );
});

/** Single Sophia search result item */
const SearchResultItem = memo(function SearchResultItem({
  message,
  index,
}: {
  message: SophiaMessageEvent;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.text.length > 120;
  const displayText = !expanded && isLong ? message.text.slice(0, 120) + "..." : message.text;

  return (
    <div
      className="opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="bg-neutral-900/40 backdrop-blur-sm border border-neutral-700/20
                      rounded-xl p-3 hover:border-neutral-600/30 transition-all">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30
                        flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-2.5 h-2.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
              {displayText}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 transition-colors"
              >
                {expanded ? S.drawer.close : S.drawer.preview}
              </button>
            )}
            {message.visualRef && (
              <span className="inline-block mt-1 text-[10px] text-neutral-500 bg-neutral-800/50
                             border border-neutral-700/20 rounded px-1.5 py-0.5">
                {message.visualRef}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Single downloadable file item */
const FileItem = memo(function FileItem({
  file,
  index,
}: {
  file: { name: string; type: string; webUrl: string; driveItemId?: string };
  index: number;
}) {
  const badge = FILE_TYPE_BADGE[file.type] ?? file.type.toUpperCase();

  const fileIconColor =
    file.type === "pptx"
      ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
      : file.type === "xlsx"
        ? "text-green-400 bg-green-500/10 border-green-500/20"
        : "text-blue-400 bg-blue-500/10 border-blue-500/20";

  const badgeColor =
    file.type === "pptx"
      ? "text-orange-400 bg-orange-500/10 border-orange-500/20"
      : file.type === "xlsx"
        ? "text-green-400 bg-green-500/10 border-green-500/20"
        : file.type === "pdf"
          ? "text-red-400 bg-red-500/10 border-red-500/20"
          : "text-blue-400 bg-blue-500/10 border-blue-500/20";

  return (
    <div
      className="opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="bg-neutral-900/40 backdrop-blur-sm border border-neutral-700/20
                      rounded-xl p-3 hover:border-neutral-600/30 transition-all">
        <div className="flex items-center gap-3">
          {/* File icon */}
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${fileIconColor}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-neutral-200 truncate">{file.name}</p>
            <span className={`inline-block mt-0.5 text-[10px] font-medium border rounded px-1.5 py-0.5 ${badgeColor}`}>
              {badge}
            </span>
          </div>

          {/* Download button */}
          <a
            href={file.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-medium
                       text-indigo-400 hover:text-indigo-300
                       bg-indigo-500/10 hover:bg-indigo-500/20
                       border border-indigo-500/20 rounded-lg px-2.5 py-1.5
                       transition-all flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {S.drawer.download}
          </a>
        </div>
      </div>
    </div>
  );
});

/** Empty state */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]">
      <div className="w-12 h-12 rounded-2xl bg-neutral-800/40 border border-neutral-700/20
                      flex items-center justify-center mb-3">
        <svg className="w-6 h-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <p className="text-xs text-neutral-500">{S.drawer.empty}</p>
    </div>
  );
}

// ── Main drawer component ──

export const ArtifactDrawer = memo(function ArtifactDrawer({
  isOpen,
  onClose,
  bigScreenHistory,
  sophiaMessages,
  artifacts: _artifacts,
  readyArtifacts,
}: ArtifactDrawerProps) {
  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const hasAnyContent =
    bigScreenHistory.length > 0 ||
    sophiaMessages.length > 0 ||
    (readyArtifacts?.files?.length ?? 0) > 0;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={handleBackdropClick}
        className={`fixed inset-0 z-40 transition-all duration-300 ${
          isOpen
            ? "bg-black/30 backdrop-blur-[2px] pointer-events-auto"
            : "bg-transparent pointer-events-none"
        }`}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50
                    w-[min(400px,100vw)] sm:w-[400px]
                    bg-neutral-950/90 backdrop-blur-xl
                    border-l border-neutral-700/20
                    flex flex-col
                    transition-transform duration-300 ease-out
                    ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3.5
                        border-b border-neutral-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20
                          flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-neutral-100">{S.drawer.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-neutral-800/40 border border-neutral-700/20
                       flex items-center justify-center
                       hover:bg-neutral-700/50 hover:border-neutral-600/30
                       transition-all"
            aria-label={S.drawer.close}
          >
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {!hasAnyContent ? (
            <EmptyState />
          ) : (
            <>
              {/* Visualizations section */}
              {bigScreenHistory.length > 0 && (
                <DrawerSection
                  title={S.drawer.visualizations}
                  count={bigScreenHistory.length}
                >
                  <div className="space-y-2">
                    {[...bigScreenHistory].reverse().map((event, i) => (
                      <VisualItem
                        key={`vis-${bigScreenHistory.length - 1 - i}`}
                        event={event}
                        index={i}
                        total={bigScreenHistory.length}
                      />
                    ))}
                  </div>
                </DrawerSection>
              )}

              {/* Search results section */}
              {sophiaMessages.length > 0 && (
                <DrawerSection
                  title={S.drawer.searchResults}
                  count={sophiaMessages.length}
                >
                  <div className="space-y-2">
                    {[...sophiaMessages].reverse().map((msg, i) => (
                      <SearchResultItem
                        key={`sophia-${sophiaMessages.length - 1 - i}`}
                        message={msg}
                        index={i}
                      />
                    ))}
                  </div>
                </DrawerSection>
              )}

              {/* Meeting artifacts (downloadable files) */}
              {readyArtifacts && readyArtifacts.files.length > 0 && (
                <DrawerSection
                  title={S.drawer.meetingArtifacts}
                  count={readyArtifacts.files.length}
                >
                  <div className="space-y-2">
                    {readyArtifacts.files.map((file, i) => (
                      <FileItem key={`file-${file.name}`} file={file} index={i} />
                    ))}
                  </div>
                </DrawerSection>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
});
