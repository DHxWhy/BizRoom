// In-memory artifact storage for MVP
// Production: Azure Blob Storage

export interface StoredArtifact {
  id: string;
  type: "markdown" | "excel";
  name: string;
  content: Buffer | string;
  mimeType: string;
  createdBy: string;
  createdAt: string;
}

const store: Map<string, StoredArtifact> = new Map();

export function saveArtifact(artifact: StoredArtifact): void {
  store.set(artifact.id, artifact);
}

export function getArtifact(id: string): StoredArtifact | undefined {
  return store.get(id);
}

export function listArtifacts(): StoredArtifact[] {
  return Array.from(store.values());
}
