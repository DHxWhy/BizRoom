import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";

// SignalR negotiate endpoint
// Client calls this to get connection info for SignalR
export async function negotiate(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("SignalR negotiate request received");

  // For MVP: return SignalR connection info
  // In production: Azure Functions SignalR input binding handles this automatically
  const connectionString = process.env.AzureSignalRConnectionString;

  if (!connectionString) {
    return {
      status: 200,
      jsonBody: {
        url: "http://localhost:7071/api",
        accessToken: "dev-token",
        // In dev mode without SignalR, return mock connection info
      },
    };
  }

  // With real SignalR: the binding would return connection info
  return {
    status: 200,
    jsonBody: { negotiated: true },
  };
}

app.http("negotiate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "api/negotiate",
  handler: negotiate,
});
