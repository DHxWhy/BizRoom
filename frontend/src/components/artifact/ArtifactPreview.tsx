import { S } from "../../constants/strings";
import type { Artifact } from "../../types";

interface ArtifactPreviewProps {
  artifact: Artifact;
}

const TYPE_ICONS: Record<string, string> = {
  excel: "\u{1F4CA}",
  markdown: "\u{1F4DD}",
  image: "\u{1F5BC}\uFE0F",
};

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  const icon = TYPE_ICONS[artifact.type] ?? "\u{1F4CE}";

  const handleDownload = () => {
    // Download via API endpoint
    window.open(`/api/artifacts/${artifact.id}`, "_blank");
  };

  return (
    <div className="mt-2 inline-flex items-center gap-3 bg-neutral-800/70 border border-neutral-700 rounded-lg px-4 py-3 max-w-sm">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-200 truncate">
          {artifact.name}
        </p>
        <p className="text-xs text-neutral-500 uppercase">{artifact.type}</p>
      </div>
      <button
        onClick={handleDownload}
        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
      >
        {S.artifacts.download}
      </button>
    </div>
  );
}
