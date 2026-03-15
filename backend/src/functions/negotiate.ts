import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { createHmac } from "node:crypto";

// SignalR negotiate endpoint
// Client calls this to get connection info for SignalR
export async function negotiate(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("SignalR negotiate request received");

  // Check both naming conventions (camelCase for binding, UPPER_SNAKE for manual config)
  const connectionString =
    process.env.AzureSignalRConnectionString ??
    process.env.AZURE_SIGNALR_CONNECTION_STRING;

  if (!connectionString) {
    context.log("No SignalR connection string found — returning dev mock");
    return {
      status: 200,
      jsonBody: {
        url: "",
        accessToken: "",
        // No SignalR configured — client should fall back to REST mode
      },
    };
  }

  // Parse connection string: Endpoint=https://xxx.service.signalr.net;AccessKey=xxx;Version=1.0;
  const endpointMatch = connectionString.match(/Endpoint=([^;]+)/i);
  const keyMatch = connectionString.match(/AccessKey=([^;]+)/i);

  if (!endpointMatch || !keyMatch) {
    context.log("Invalid SignalR connection string format");
    return { status: 500, jsonBody: { error: "Invalid SignalR configuration" } };
  }

  const endpoint = endpointMatch[1].replace(/\/$/, "");
  const accessKey = keyMatch[1];
  const hubName = "default";
  const userId = request.headers.get("x-ms-signalr-userid") ?? "anonymous";

  // Generate JWT access token for Azure SignalR Service
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry
  const audience = `${endpoint}/client/?hub=${hubName}`;

  // Base64url encode helper
  const b64url = (str: string) =>
    Buffer.from(str).toString("base64url");

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ aud: audience, iat: now, exp, sub: userId }));
  // AccessKey in the connection string is used as-is (raw string bytes) for HMAC.
  // Do NOT base64-decode it — Azure SignalR Service signs with the literal key string.
  const signature = createHmac("sha256", accessKey)
    .update(`${header}.${payload}`)
    .digest("base64url");

  const token = `${header}.${payload}.${signature}`;

  return {
    status: 200,
    jsonBody: {
      url: `${endpoint}/client/?hub=${hubName}`,
      accessToken: token,
    },
  };
}

app.http("negotiate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/negotiate",
  handler: negotiate,
});
