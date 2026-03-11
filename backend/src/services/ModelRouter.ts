// Task-based model selection per TECH_SPEC.md
// chat/short responses -> gpt-4o-mini (faster, cheaper)
// artifact generation/complex analysis -> gpt-4o (higher quality)

export type TaskType = "chat" | "artifact" | "research" | "summary";

export function getModelForTask(task: TaskType): string {
  switch (task) {
    case "chat":
      return process.env.AZURE_OPENAI_DEPLOYMENT_MINI ?? "gpt-4o-mini";
    case "artifact":
    case "research":
    case "summary":
      return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";
  }
}
