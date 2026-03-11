import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getArtifact } from "../services/ArtifactService.js";

// GET /api/artifacts/:id — download artifact file
export async function artifactDownload(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Artifact download request");

  const id = request.params.id;
  if (!id) {
    return { status: 400, jsonBody: { error: "Artifact ID is required" } };
  }

  const artifact = getArtifact(id);
  if (!artifact) {
    return { status: 404, jsonBody: { error: "Artifact not found" } };
  }

  const body =
    typeof artifact.content === "string"
      ? Buffer.from(artifact.content, "utf-8")
      : artifact.content;

  return {
    status: 200,
    body,
    headers: {
      "Content-Type": artifact.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(artifact.name)}"`,
    },
  };
}

app.http("artifactDownload", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/artifacts/{id}",
  handler: artifactDownload,
});
