import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { UserService } from "../services/UserService.js";
import type { BrandMemorySet } from "../models/index.js";

interface RegisterRequest {
  email: string;
  displayName: string;
  brandMemory?: BrandMemorySet;
}

// POST /api/user/register — create a new user
export async function userRegister(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("User register request");

  let body: RegisterRequest;
  try {
    body = (await request.json()) as RegisterRequest;
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON body" } };
  }

  if (!body.email?.trim() || !body.displayName?.trim()) {
    return {
      status: 400,
      jsonBody: { error: "email and displayName are required" },
    };
  }

  try {
    const user = await UserService.registerUser(
      body.email,
      body.displayName,
      body.brandMemory,
    );
    return { status: 201, jsonBody: user };
  } catch (err: unknown) {
    context.log("User registration failed:", err);
    return { status: 500, jsonBody: { error: "Failed to register user" } };
  }
}

app.http("userRegister", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/user/register",
  handler: userRegister,
});
