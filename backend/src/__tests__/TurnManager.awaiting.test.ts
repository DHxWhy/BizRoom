import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TurnManager } from "../orchestrator/TurnManager.js";

describe("TurnManager awaiting state", () => {
  let tm: TurnManager;
  const roomId = "test-room-awaiting";

  beforeEach(() => {
    vi.useFakeTimers();
    tm = new TurnManager();
    tm.initRoom(roomId, "ceo-user");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions to awaiting when human mention is detected", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    const stateChanges: string[] = [];
    tm.on("stateChanged:" + roomId, (_rid: string, state: string) => {
      stateChanges.push(state);
    });

    tm.enterAwaitingState(roomId, {
      target: "ceo",
      intent: "confirm",
      options: ["A안", "B안"],
      fromAgent: "cfo",
    });

    expect(stateChanges).toContain("awaiting");
  });

  it("emits humanCallout event when entering awaiting", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    let calloutPayload: unknown = null;
    tm.on("humanCallout:" + roomId, (_rid: string, payload: unknown) => {
      calloutPayload = payload;
    });

    tm.enterAwaitingState(roomId, {
      target: "ceo",
      intent: "confirm",
      options: ["A안"],
      fromAgent: "coo",
    });

    expect(calloutPayload).toBeTruthy();
  });

  it("resumes queue on human response", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "ceo",
      intent: "opinion",
      fromAgent: "cmo",
    });

    tm.onHumanResponse(roomId, "ceo-user", "A안으로 하겠습니다");
    expect(room.state).not.toBe("awaiting");
  });

  it("auto-resumes after 30s timeout", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "ceo",
      intent: "confirm",
      options: ["A안"],
      fromAgent: "cfo",
    });

    vi.advanceTimersByTime(30000);
    expect(room.state).not.toBe("awaiting");
  });

  it("clears timeout when human responds before timeout", () => {
    const room = (tm as any).rooms.get(roomId);
    room.state = "speaking";

    tm.enterAwaitingState(roomId, {
      target: "ceo",
      intent: "opinion",
      fromAgent: "cto",
    });

    tm.onHumanResponse(roomId, "ceo-user", "동의합니다");
    vi.advanceTimersByTime(30000);
    expect(room.state).not.toBe("awaiting");
  });

  it("ignores human response if state is not awaiting", () => {
    const room = (tm as any).rooms.get(roomId);
    expect(room.state).toBe("idle");
    tm.onHumanResponse(roomId, "ceo-user", "test");
    expect(room.state).toBe("idle");
  });

  describe("mention-based routing in onAgentDone", () => {
    it("adds mentioned agent to queue", () => {
      tm.handleMentionRouting(roomId, {
        speech: "CFO 의견이 필요합니다",
        key_points: [],
        mention: { target: "cfo", intent: "opinion" },
        visual_hint: null,
      }, "coo");

      const room = (tm as any).rooms.get(roomId);
      expect(room.agentQueue.some((q: any) => q.role === "cfo")).toBe(true);
    });

    it("enters awaiting state on ceo mention", () => {
      let calloutEmitted = false;
      tm.on("humanCallout:" + roomId, () => { calloutEmitted = true; });

      const room = (tm as any).rooms.get(roomId);
      room.state = "speaking";

      tm.handleMentionRouting(roomId, {
        speech: "대표님 결정이 필요합니다",
        key_points: [],
        mention: { target: "ceo", intent: "confirm", options: ["A안"] },
        visual_hint: null,
      }, "cfo");

      expect(calloutEmitted).toBe(true);
    });

    it("falls back to keyword checkFollowUp when mention is null", () => {
      tm.handleMentionRouting(roomId, {
        speech: "예산 검토가 필요합니다",
        key_points: [],
        mention: null,
        visual_hint: null,
      }, "coo");
      // Should not crash, checkFollowUp handles keyword matching
    });
  });
});
