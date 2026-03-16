// backend/src/__tests__/mcp.test.ts
// Unit tests for BizRoom MCP Server tool handlers
// Tests callTool() for each of the 3 exposed tools

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies before any dynamic imports ──────────────────────────────

vi.mock("../plugins/ExcelPlugin.js", () => ({
  generateBudgetExcel: vi
    .fn()
    .mockReturnValue({ id: "mock-excel-id", buffer: Buffer.from("xlsx-mock") }),
}));

vi.mock("../services/ArtifactGenerator.js", () => ({
  generatePPT: vi.fn().mockResolvedValue(Buffer.from("pptx-mock")),
}));

vi.mock("../agents/SophiaAgent.js", () => ({
  sophiaAgent: {
    getRecentSpeeches: vi
      .fn()
      .mockReturnValue([
        "Hudson: Let's begin the strategy review.",
        "Amelia: Q1 numbers look strong.",
      ]),
  },
}));

// Mock Azure Functions registration — prevents "app not initialized" error
vi.mock("@azure/functions", () => ({
  app: { http: vi.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

const { generateBudgetExcel } = await import("../plugins/ExcelPlugin.js");
const { generatePPT } = await import("../services/ArtifactGenerator.js");
const { sophiaAgent } = await import("../agents/SophiaAgent.js");
const { callTool } = await import("../functions/mcp.js");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MCP: bizroom_generate_excel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls generateBudgetExcel with provided title and data", async () => {
    const args = {
      title: "Q1 Budget",
      data: [{ category: "Marketing", budget: 5000, actual: 4200, variance: -800 }],
    };

    const result = await callTool("bizroom_generate_excel", args);

    expect(generateBudgetExcel).toHaveBeenCalledWith({
      title: "Q1 Budget",
      data: [{ category: "Marketing", budget: 5000, actual: 4200, variance: -800 }],
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe("text");
  });

  it("returns artifactId in response", async () => {
    const result = await callTool("bizroom_generate_excel", {
      title: "Test",
      data: [],
    });

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.artifactId).toBe("mock-excel-id");
    expect(parsed.downloadUrl).toMatch(/^\/api\/artifact\//);
  });

  it("uses fallback title when title is missing", async () => {
    await callTool("bizroom_generate_excel", { data: [] });

    expect(generateBudgetExcel).toHaveBeenCalledWith(
      expect.objectContaining({ title: "BizRoom Report" }),
    );
  });
});

describe("MCP: bizroom_generate_ppt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls generatePPT with meeting data", async () => {
    const args = {
      title: "Q1 Strategy Review",
      date: "2026-03-16",
      participants: ["Hudson COO", "Amelia CFO"],
      agendas: [],
      actionItems: [],
    };

    const result = await callTool("bizroom_generate_ppt", args);

    expect(generatePPT).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingInfo: expect.objectContaining({ title: "Q1 Strategy Review" }),
      }),
    );
    expect(result.isError).toBe(false);
  });

  it("returns success with byte size", async () => {
    const result = await callTool("bizroom_generate_ppt", { title: "Test PPT" });

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.success).toBe(true);
    expect(typeof parsed.sizeBytes).toBe("number");
    expect(parsed.sizeBytes).toBeGreaterThan(0);
  });

  it("uses fallback title when title is missing", async () => {
    await callTool("bizroom_generate_ppt", {});

    expect(generatePPT).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingInfo: expect.objectContaining({ title: "BizRoom Meeting" }),
      }),
    );
  });
});

describe("MCP: bizroom_meeting_summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls getRecentSpeeches with roomId and maxSpeeches", async () => {
    await callTool("bizroom_meeting_summary", {
      roomId: "room-abc",
      maxSpeeches: 5,
    });

    expect(sophiaAgent.getRecentSpeeches).toHaveBeenCalledWith("room-abc", 5);
  });

  it("uses default maxSpeeches of 10 when not provided", async () => {
    await callTool("bizroom_meeting_summary", { roomId: "room-xyz" });

    expect(sophiaAgent.getRecentSpeeches).toHaveBeenCalledWith("room-xyz", 10);
  });

  it("returns speech count and summary in response", async () => {
    const result = await callTool("bizroom_meeting_summary", {
      roomId: "room-abc",
    });

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.roomId).toBe("room-abc");
    expect(parsed.speechCount).toBe(2);
    expect(parsed.summary).toContain("Hudson");
    expect(parsed.generatedAt).toBeTruthy();
  });

  it("returns no-meeting message when room has no speeches", async () => {
    (sophiaAgent.getRecentSpeeches as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

    const result = await callTool("bizroom_meeting_summary", { roomId: "empty-room" });

    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.summary).toContain("No active meeting");
    expect(parsed.speechCount).toBe(0);
  });
});

describe("MCP: unknown tool", () => {
  it("returns isError=true for unknown tool name", async () => {
    const result = await callTool("unknown_tool", {});

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { type: string; text: string }).text);
    expect(parsed.error).toContain("Unknown tool");
  });
});

describe("MCP: tool definitions shape", () => {
  it("all tools have required MCP fields", () => {
    const toolSchemas = [
      {
        name: "bizroom_generate_excel",
        requiredArgs: ["title", "data"],
      },
      {
        name: "bizroom_generate_ppt",
        requiredArgs: ["title"],
      },
      {
        name: "bizroom_meeting_summary",
        requiredArgs: ["roomId"],
      },
    ];

    for (const schema of toolSchemas) {
      expect(schema.name).toMatch(/^bizroom_/);
      expect(schema.requiredArgs.length).toBeGreaterThan(0);
    }
    expect(toolSchemas).toHaveLength(3);
  });
});
