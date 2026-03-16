import { describe, it, expect, vi } from "vitest";
import { determineAgentOrder, TurnManager } from "../orchestrator/TurnManager.js";
import type { AgentTurn, AgentRole } from "../models/index.js";

// Helper: extract roles in priority order
function roles(turns: AgentTurn[]): AgentRole[] {
  return turns.map((t) => t.role);
}

function priorities(turns: AgentTurn[]): number[] {
  return turns.map((t) => t.priority);
}

describe("determineAgentOrder", () => {
  // ── COO P1 behaviour ──────────────────────────────────────────────────────

  describe("COO as primary orchestrator (P1)", () => {
    it("adds COO at priority 1 when there are no mentions", () => {
      const turns = determineAgentOrder("일반 논의", [], "coo", ["cfo", "cmo"]);
      expect(turns[0]).toEqual({ role: "coo", priority: 1 });
    });

    it("adds COO at priority 1 when @COO is explicitly mentioned", () => {
      const turns = determineAgentOrder("@COO 의견 주세요", ["coo"], "coo", []);
      expect(turns[0]).toEqual({ role: "coo", priority: 1 });
    });

    it("does NOT add COO when mentions exist but do not include coo", () => {
      // mentions = ["cfo"] → COO P1 condition is false
      const turns = determineAgentOrder("@CFO 예산 확인", ["cfo"], "cfo", ["coo", "clo"]);
      const roleList = roles(turns);
      // COO is a secondary of finance; it will appear at P3 via secondaryAgents
      // but NOT at P1
      const cooTurn = turns.find((t) => t.role === "coo");
      if (cooTurn) {
        expect(cooTurn.priority).toBeGreaterThan(1);
      }
      // CFO should be at P2 (mentioned)
      expect(roleList[0]).toBe("cfo");
    });
  });

  // ── Mentioned agents at P2 ────────────────────────────────────────────────

  describe("mentioned agents at priority 2", () => {
    it("places @CFO mention at priority 2", () => {
      const turns = determineAgentOrder("@CFO 예산 알려주세요", ["cfo"], "cfo", ["coo", "clo"]);
      const cfoTurn = turns.find((t) => t.role === "cfo");
      expect(cfoTurn).toBeDefined();
      expect(cfoTurn!.priority).toBe(2);
    });

    it("places multiple mentions each at priority 2", () => {
      const turns = determineAgentOrder("@CFO @CMO 같이 논의해주세요", ["cfo", "cmo"], "cfo", [
        "coo",
        "clo",
      ]);
      const cfoTurn = turns.find((t) => t.role === "cfo");
      const cmoTurn = turns.find((t) => t.role === "cmo");
      expect(cfoTurn!.priority).toBe(2);
      expect(cmoTurn!.priority).toBe(2);
    });
  });

  // ── Primary agent at P3 ───────────────────────────────────────────────────

  describe("primary agent at priority 3", () => {
    it("adds primary agent at priority 3 when not already added", () => {
      // No mentions → COO added as P1; primary=cfo → added as P3
      const turns = determineAgentOrder("예산 논의", [], "cfo", ["coo", "clo"]);
      const cfoTurn = turns.find((t) => t.role === "cfo");
      expect(cfoTurn).toBeDefined();
      expect(cfoTurn!.priority).toBe(3);
    });

    it("does not duplicate primary agent when it was already added via mentions (P2)", () => {
      // @CFO mentioned at P2 — primary=cfo should not appear again at P3
      const turns = determineAgentOrder("@CFO 예산", ["cfo"], "cfo", []);
      const cfoTurns = turns.filter((t) => t.role === "cfo");
      expect(cfoTurns).toHaveLength(1);
    });

    it("does not duplicate primary agent when it is COO and was added at P1", () => {
      // No mentions → COO at P1; primary=coo → should not appear again
      const turns = determineAgentOrder("일반 논의", [], "coo", ["cfo"]);
      const cooTurns = turns.filter((t) => t.role === "coo");
      expect(cooTurns).toHaveLength(1);
    });
  });

  // ── Secondary agents at P3 ────────────────────────────────────────────────

  describe("secondary agents at priority 3", () => {
    it("adds secondary agents at priority 3", () => {
      // No mentions, primary=cfo, secondary=[coo, clo]
      // COO is already added as P1, so only clo should appear at P3 from secondaries
      const turns = determineAgentOrder("예산 논의", [], "cfo", ["coo", "clo"]);
      const cloTurn = turns.find((t) => t.role === "clo");
      expect(cloTurn).toBeDefined();
      expect(cloTurn!.priority).toBe(3);
    });

    it("skips secondary agents already added via COO P1", () => {
      // No mentions → COO at P1; secondary includes coo → should not be duplicated
      const turns = determineAgentOrder("예산 논의", [], "cfo", ["coo", "clo"]);
      const cooTurns = turns.filter((t) => t.role === "coo");
      expect(cooTurns).toHaveLength(1);
    });

    it("skips secondary agents already added via mentions (P2)", () => {
      // mentions=["cfo"], secondary includes cfo → only one cfo entry
      const turns = determineAgentOrder("@CFO 예산", ["cfo"], "cmo", ["cfo", "coo"]);
      const cfoTurns = turns.filter((t) => t.role === "cfo");
      expect(cfoTurns).toHaveLength(1);
    });
  });

  // ── Deduplication (global) ────────────────────────────────────────────────

  describe("deduplication across all priorities", () => {
    it("each agent appears at most once in the output", () => {
      const turns = determineAgentOrder("@CFO @CMO 예산 마케팅", ["cfo", "cmo"], "cfo", [
        "coo",
        "clo",
      ]);
      const roleList = roles(turns);
      const uniqueRoles = new Set(roleList);
      expect(roleList.length).toBe(uniqueRoles.size);
    });
  });

  // ── Sort by priority ──────────────────────────────────────────────────────

  describe("sort by priority ascending", () => {
    it("result is sorted in ascending priority order", () => {
      const turns = determineAgentOrder("예산 논의", [], "cfo", ["clo"]);
      const pList = priorities(turns);
      for (let i = 1; i < pList.length; i++) {
        expect(pList[i]).toBeGreaterThanOrEqual(pList[i - 1]);
      }
    });

    it("P1 comes before P2 in output", () => {
      // mentions=["coo"] → COO is P1; then... no P2 since only coo mentioned
      // Use a scenario with both P1 and P2
      // mentions=["coo", "cfo"] → COO P1 (via includes), CFO P2
      const turns = determineAgentOrder("@COO @CFO 논의", ["coo", "cfo"], "cfo", []);
      expect(turns[0].priority).toBe(1);
      expect(turns[1].priority).toBe(2);
    });

    it("P2 comes before P3 in output", () => {
      // No mentions → COO P1; @CFO in mentions (skip this — use actual mentions)
      // mentions=["coo", "cfo"], primary=cmo → COO P1, CFO P2, CMO P3
      const turns = determineAgentOrder("@COO @CFO 논의", ["coo", "cfo"], "cmo", []);
      const p2 = turns.find((t) => t.priority === 2)!;
      const p3 = turns.find((t) => t.priority === 3)!;
      const p2idx = turns.indexOf(p2);
      const p3idx = turns.indexOf(p3);
      expect(p2idx).toBeLessThan(p3idx);
    });
  });

  // ── @COO mention only ─────────────────────────────────────────────────────

  describe("@COO mention only — no duplicates", () => {
    it("when only @COO is mentioned, COO appears exactly once at P1", () => {
      // mentions=["coo"] → condition `mentions.includes("coo")` is true → P1
      // P2 loop: coo is already in `added`, so skipped
      const turns = determineAgentOrder("@COO 어떻게 생각하세요", ["coo"], "coo", []);
      const cooTurns = turns.filter((t) => t.role === "coo");
      expect(cooTurns).toHaveLength(1);
      expect(cooTurns[0].priority).toBe(1);
    });
  });

  // ── No mentions → COO + topic agents ─────────────────────────────────────

  describe("no mentions scenario (general routing)", () => {
    it("includes COO (P1), primary (P3), and secondaries (P3)", () => {
      const turns = determineAgentOrder("서버 아키텍처 논의", [], "cto", ["cdo"]);
      const roleList = roles(turns);
      expect(roleList).toContain("coo");
      expect(roleList).toContain("cto");
      expect(roleList).toContain("cdo");
    });

    it("COO at P1 when no mentions, even if not the primary topic agent", () => {
      const turns = determineAgentOrder("마케팅 캠페인 논의", [], "cmo", ["cdo", "cfo"]);
      expect(turns[0]).toEqual({ role: "coo", priority: 1 });
    });
  });

  // ── Multiple mentions (all → P2, COO absent unless mentioned) ────────────

  describe("multiple mentions without coo", () => {
    it("returns mentioned agents at P2, primary at P3 (no P1 COO)", () => {
      const turns = determineAgentOrder("@CFO @CMO 예산과 마케팅", ["cfo", "cmo"], "cfo", [
        "coo",
        "clo",
      ]);
      const p2Roles = turns.filter((t) => t.priority === 2).map((t) => t.role);
      expect(p2Roles).toContain("cfo");
      expect(p2Roles).toContain("cmo");
    });
  });
});

// ── TurnManager instance tests ────────────────────────────────────────────

describe("TurnManager re-flush agentsDone emission", () => {
  it("emits agentsDone before re-flushing queued input", () => {
    vi.useFakeTimers();

    const tm = new TurnManager();
    const roomId = "test-room-reflush";
    tm.setCeo(roomId, "user-1");

    const events: string[] = [];
    tm.on("agentsDone:" + roomId, () => events.push("agentsDone"));
    tm.on("stateChanged:" + roomId, (_rid: string, state: string) => events.push("state:" + state));
    tm.on("triggerAgent:" + roomId, () => events.push("triggerAgent"));

    // Simulate: hearing → transcript → flush → speaking
    tm.onSpeechStart(roomId, "user-1");
    tm.onTranscript(roomId, "user-1", "CEO", "예산 논의 해주세요");
    tm.onSpeechEnd(roomId, "user-1");

    // Fast-forward flush timer to trigger onFlush
    vi.runAllTimers();

    // Now simulate chat arriving during speaking (which queues input)
    tm.onChatMessage(roomId, "user-1", "CEO", "추가 질문입니다", true);

    // Simulate each agent done until queue is empty
    // Get the active agents from triggerAgent events
    const triggerCount = events.filter((e) => e === "triggerAgent").length;
    for (let i = 0; i < Math.max(triggerCount, 1); i++) {
      const agentRoles: AgentRole[] = ["coo", "cfo", "cmo", "cto", "cdo", "clo"];
      tm.onAgentDone(roomId, agentRoles[i], "응답입니다.");
      vi.runAllTimers(); // run INTER_AGENT_GAP_MS timers
    }

    // Keep finishing agents until agentsDone fires
    let safety = 0;
    while (!events.includes("agentsDone") && safety < 10) {
      const agentRoles: AgentRole[] = ["coo", "cfo", "cmo", "cto", "cdo", "clo"];
      tm.onAgentDone(roomId, agentRoles[safety % 6], "응답입니다.");
      vi.runAllTimers();
      safety++;
    }

    // agentsDone should have been emitted
    expect(events).toContain("agentsDone");

    vi.useRealTimers();
    tm.destroyRoom(roomId);
  });
});
