import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { UserService } from "../services/UserService.js";

// GET /api/user/{id} — retrieve a user by ID
export async function userGet(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("User get request");

  const id = request.params.id;
  if (!id) {
    return { status: 400, jsonBody: { error: "User ID is required" } };
  }

  try {
    const user = await UserService.getUser(id);
    if (!user) {
      return { status: 404, jsonBody: { error: "User not found" } };
    }
    return { status: 200, jsonBody: user };
  } catch (err: unknown) {
    context.log("User get failed:", err);
    return { status: 500, jsonBody: { error: "Failed to get user" } };
  }
}

app.http("userGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "api/user/{id}",
  handler: userGet,
});
