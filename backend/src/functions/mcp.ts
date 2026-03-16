// backend/src/functions/mcp.ts
// BizRoom.ai MCP Server — Azure Functions HTTP trigger
// Hero Tech: Azure MCP (Model Context Protocol)
//
// Implements MCP JSON-RPC 2.0 protocol directly without StreamableHTTPServerTransport.
// Reason: Azure Functions v4 uses HttpResponseInit (return-value based), not a writable
// ServerResponse. The SDK transport writes directly to ServerResponse — incompatible.
// Manual JSON-RPC is simpler and fully spec-compliant for stateless HTTP.
//
// Tools exposed:
//   bizroom_generate_excel   — generate Excel budget report (.xlsx)
//   bizroom_generate_ppt     — generate PowerPoint from meeting minutes (.pptx)
//   bizroom_meeting_summary  — get real-time summary of active meeting

import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateBudgetExcel } from "../plugins/ExcelPlugin.js";
import {
  generatePPT,
  type MeetingMinutesData,
} from "../services/ArtifactGenerator.js";
import { sophiaAgent } from "../agents/SophiaAgent.js";

// ── MCP Tool Definitions ──────────────────────────────────────────────────────

const BIZROOM_TOOLS: Tool[] = [
  {
    name: "bizroom_generate_excel",
    description:
      "Generate an Excel budget report (.xlsx) for the BizRoom AI meeting. " +
      "Use when the user requests financial reports, budget analysis, or expense tracking.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Report title" },
        data: {
          type: "array",
          description: "Budget line items",
          items: {
            type: "object",
            properties: {
              category: { type: "string", description: "Budget category" },
              budget: { type: "number", description: "Planned budget amount" },
              actual: { type: "number", description: "Actual spend amount" },
              variance: {
                type: "number",
                description: "Variance (actual - budget)",
              },
              note: { type: "string", description: "Optional note" },
            },
            required: ["category", "budget", "actual", "variance"],
          },
        },
      },
      required: ["title", "data"],
    },
  },
  {
    name: "bizroom_generate_ppt",
    description:
      "Generate a PowerPoint presentation (.pptx) from BizRoom meeting minutes. " +
      "Use when the user asks to summarize the meeting or create presentation slides.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Presentation title" },
        date: { type: "string", description: "Meeting date (ISO 8601)" },
        participants: {
          type: "array",
          items: { type: "string" },
          description: "Participant names (e.g. ['Hudson COO', 'Amelia CFO'])",
        },
        agendas: {
          type: "array",
          description: "Agenda items discussed in the meeting",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              keyPoints: { type: "array", items: { type: "string" } },
              decisions: { type: "array", items: { type: "string" } },
              visualRefs: { type: "array", items: { type: "string" } },
            },
          },
        },
        actionItems: {
          type: "array",
          description: "Follow-up action items assigned during the meeting",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              assignee: { type: "string" },
              deadline: { type: "string" },
            },
            required: ["description", "assignee"],
          },
        },
      },
      required: ["title"],
    },
  },
  {
    name: "bizroom_meeting_summary",
    description:
      "Get a real-time summary of the current BizRoom AI meeting. " +
      "Returns recent speeches from AI C-Suite agents in the active meeting room.",
    inputSchema: {
      type: "object" as const,
      properties: {
        roomId: {
          type: "string",
          description: "Meeting room ID to retrieve summary for",
        },
        maxSpeeches: {
          type: "number",
          description: "Max number of recent speeches to include (default: 10)",
        },
      },
      required: ["roomId"],
    },
  },
];

// ── JSON-RPC 2.0 Helpers ──────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
};

function rpcOk(id: string | number | null, result: unknown): HttpResponseInit {
  return {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    jsonBody: { jsonrpc: "2.0", id, result },
  };
}

function rpcErr(
  id: string | number | null,
  code: number,
  message: string,
): HttpResponseInit {
  // JSON-RPC errors use HTTP 200 per spec (error is in payload, not HTTP status)
  return {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    jsonBody: { jsonrpc: "2.0", id, error: { code, message } },
  };
}

// ── Tool Handlers ─────────────────────────────────────────────────────────────

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  switch (name) {
    case "bizroom_generate_excel": {
      const result = generateBudgetExcel({
        title: (args.title as string) ?? "BizRoom Report",
        data:
          (args.data as Array<{
            category: string;
            budget: number;
            actual: number;
            variance: number;
            note?: string;
          }>) ?? [],
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              artifactId: result.id,
              message: `Excel report "${args.title}" generated successfully`,
              downloadUrl: `/api/artifact/${result.id}`,
            }),
          },
        ],
        isError: false,
      };
    }

    case "bizroom_generate_ppt": {
      const data: MeetingMinutesData = {
        meetingInfo: {
          title: (args.title as string) ?? "BizRoom Meeting",
          date: (args.date as string) ?? new Date().toISOString(),
          participants: (args.participants as string[]) ?? [],
        },
        agendas: (args.agendas as MeetingMinutesData["agendas"]) ?? [],
        actionItems:
          (args.actionItems as MeetingMinutesData["actionItems"]) ?? [],
      };
      const buffer = await generatePPT(data);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `PowerPoint "${args.title}" generated (${buffer.length} bytes)`,
              sizeBytes: buffer.length,
            }),
          },
        ],
        isError: false,
      };
    }

    case "bizroom_meeting_summary": {
      const roomId = args.roomId as string;
      const maxSpeeches = (args.maxSpeeches as number) ?? 10;
      const speeches = sophiaAgent.getRecentSpeeches(roomId, maxSpeeches);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              roomId,
              speechCount: speeches.length,
              summary:
                speeches.join("\n\n") ||
                "No active meeting found for this room.",
              generatedAt: new Date().toISOString(),
            }),
          },
        ],
        isError: false,
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}

// ── Azure Functions HTTP Trigger ──────────────────────────────────────────────

app.http("mcp", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "mcp",
  handler: async (
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> => {
    // OPTIONS preflight for CORS
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }

    // GET — server info & capability discovery (convenience, not part of JSON-RPC spec)
    if (request.method === "GET") {
      return {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        jsonBody: {
          name: "bizroom-mcp",
          version: "1.0.0",
          description:
            "BizRoom.ai MCP Server — AI C-Suite meeting tools (Excel, PPT, meeting summary)",
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          tools: BIZROOM_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
          })),
        },
      };
    }

    // POST — JSON-RPC 2.0 request handling
    let body: JsonRpcRequest;
    try {
      body = (await request.json()) as JsonRpcRequest;
    } catch {
      return rpcErr(null, -32700, "Parse error: request body is not valid JSON");
    }

    if (body.jsonrpc !== "2.0") {
      return rpcErr(body.id ?? null, -32600, "Invalid Request: jsonrpc must be '2.0'");
    }

    context.log(`[MCP] ${body.method} id=${body.id}`);

    switch (body.method) {
      // ── Handshake ──
      case "initialize":
        return rpcOk(body.id, {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "bizroom-mcp", version: "1.0.0" },
          capabilities: { tools: { listChanged: false } },
        });

      // ── Client ack — no response body per spec ──
      case "notifications/initialized":
        return { status: 202, headers: CORS_HEADERS };

      // ── Tool discovery ──
      case "tools/list":
        return rpcOk(body.id, { tools: BIZROOM_TOOLS });

      // ── Tool invocation ──
      case "tools/call": {
        const params = body.params as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        if (!params?.name) {
          return rpcErr(body.id, -32602, "Invalid params: 'name' is required");
        }
        try {
          const result = await callTool(params.name, params.arguments ?? {});
          return rpcOk(body.id, result);
        } catch (err) {
          context.error(`[MCP] Tool '${params.name}' failed: ${String(err)}`);
          return rpcErr(body.id, -32603, `Internal error: ${String(err)}`);
        }
      }

      default:
        return rpcErr(body.id, -32601, `Method not found: ${body.method}`);
    }
  },
});
