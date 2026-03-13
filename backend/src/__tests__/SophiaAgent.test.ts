import { describe, it, expect, beforeEach } from "vitest";
import { SophiaAgent } from "../agents/SophiaAgent.js";

describe("SophiaAgent", () => {
  let sophia: SophiaAgent;
  const roomId = "test-room-sophia";

  beforeEach(() => {
    sophia = new SophiaAgent();
    sophia.initRoom(roomId);
  });

  describe("buffer accumulation", () => {
    it("accumulates agent responses in buffer", () => {
      sophia.addToBuffer(roomId, {
        speaker: "Hudson",
        role: "coo",
        speech: "정리하겠습니다.",
        keyPoints: ["정리"],
        visualHint: null,
        timestamp: Date.now(),
      });
      const state = sophia.getRoomState(roomId);
      expect(state?.buffer.length).toBe(1);
    });

    it("caps buffer at 200 entries", () => {
      for (let i = 0; i < 210; i++) {
        sophia.addToBuffer(roomId, {
          speaker: "Hudson",
          role: "coo",
          speech: `발언 ${i}`,
          keyPoints: [],
          visualHint: null,
          timestamp: Date.now(),
        });
      }
      const state = sophia.getRoomState(roomId);
      expect(state!.buffer.length).toBeLessThanOrEqual(200);
    });
  });

  describe("room lifecycle", () => {
    it("cleans up room state on destroy", () => {
      sophia.destroyRoom(roomId);
      expect(sophia.getRoomState(roomId)).toBeUndefined();
    });
  });

  describe("visual hint detection", () => {
    it("returns true when structured output has visual_hint", () => {
      expect(
        sophia.hasVisualHint({
          speech: "test",
          key_points: [],
          mention: null,
          visual_hint: { type: "comparison", title: "test" },
        }),
      ).toBe(true);
    });

    it("returns false when visual_hint is null", () => {
      expect(
        sophia.hasVisualHint({
          speech: "test",
          key_points: [],
          mention: null,
          visual_hint: null,
        }),
      ).toBe(false);
    });
  });
});
