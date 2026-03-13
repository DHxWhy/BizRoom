import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { UserService } from "../services/UserService.js";
import type { BrandMemorySet } from "../models/index.js";

interface UpdateBrandMemoryRequest {
  brandMemory: BrandMemorySet;
}

// PUT /api/user/{id}/brand-memory — update user's brand memory
export async function userBrandMemory(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("User brand memory update request");

  const id = request.params.id;
  if (!id) {
    return { status: 400, jsonBody: { error: "User ID is required" } };
  }

  let body: UpdateBrandMemoryRequest;
  try {
    body = (await request.json()) as UpdateBrandMemoryRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.brandMemory || typeof body.brandMemory !== "object") {
    return { status: 400, jsonBody: { error: "brandMemory object is required" } };
  }

  try {
    const updated = await UserService.updateBrandMemory(id, body.brandMemory);
    if (!updated) {
      return { status: 404, jsonBody: { error: "User not found" } };
    }
    return { status: 200, jsonBody: updated };
  } catch (err: unknown) {
    context.log("Brand memory update failed:", err);
    return { status: 500, jsonBody: { error: "Failed to update brand memory" } };
  }
}

app.http("userBrandMemory", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "api/user/{id}/brand-memory",
  handler: userBrandMemory,
});
