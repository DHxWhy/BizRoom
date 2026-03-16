import { describe, it, expect } from "vitest";
import { parseStructuredOutput } from "../orchestrator/ResponseParser.js";

describe("parseStructuredOutput", () => {
  describe("Tier 1: valid JSON + valid schema", () => {
    it("parses complete structured output", () => {
      const raw = JSON.stringify({
        speech: "대표님, A안으로 진행할까요?",
        key_points: ["A안 추천", "비용 절감"],
        mention: { target: "ceo", intent: "confirm", options: ["A안", "B안"] },
        visual_hint: { type: "comparison", title: "A vs B" },
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.tier).toBe("schema_valid");
      expect(result.data.speech).toBe("대표님, A안으로 진행할까요?");
      expect(result.data.mention?.target).toBe("ceo");
      expect(result.data.mention?.intent).toBe("confirm");
      expect(result.data.visual_hint?.type).toBe("comparison");
    });

    it("parses output with null mention and visual_hint", () => {
      const raw = JSON.stringify({
        speech: "동의합니다.",
        key_points: ["동의"],
        mention: null,
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "cfo");
      expect(result.tier).toBe("schema_valid");
      expect(result.data.mention).toBeNull();
      expect(result.data.visual_hint).toBeNull();
    });

    it("filters self-mention", () => {
      const raw = JSON.stringify({
        speech: "제가 다시 정리하겠습니다.",
        key_points: ["정리"],
        mention: { target: "coo", intent: "opinion" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.data.mention).toBeNull();
    });
  });

  describe("Tier 2: JSON repair", () => {
    it("extracts JSON from markdown code fence", () => {
      const raw = '```json\n{"speech":"테스트","key_points":["a"],"mention":null,"visual_hint":null}\n```';
      const result = parseStructuredOutput(raw, "cmo");
      expect(result.tier).toBe("json_repaired");
      expect(result.data.speech).toBe("테스트");
    });
  });

  describe("Tier 3: fallback", () => {
    it("treats plain text as speech", () => {
      const raw = "저는 이 방안에 동의합니다. 예산 검토가 필요합니다.";
      const result = parseStructuredOutput(raw, "cfo");
      expect(result.tier).toBe("fallback");
      expect(result.data.speech).toBe(raw);
      expect(result.data.mention).toBeNull();
      expect(result.data.key_points).toEqual([]);
    });

    it("truncates excessively long fallback speech to 300 chars", () => {
      const raw = "가".repeat(500);
      const result = parseStructuredOutput(raw, "cto");
      expect(result.data.speech.length).toBe(300);
    });
  });

  describe("mention validation", () => {
    it("rejects invalid intent", () => {
      const raw = JSON.stringify({
        speech: "테스트",
        key_points: [],
        mention: { target: "cfo", intent: "invalid_intent" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "coo");
      expect(result.data.mention).toBeNull();
    });

    it("accepts valid agent role targets", () => {
      for (const target of ["coo", "cfo", "cmo", "cto", "cdo", "clo", "ceo"]) {
        const raw = JSON.stringify({
          speech: "테스트",
          key_points: [],
          mention: { target, intent: "opinion" },
          visual_hint: null,
        });
        const result = parseStructuredOutput(raw, target === "coo" ? "cfo" : "coo");
        expect(result.data.mention?.target).toBe(target);
      }
    });

    it("accepts member: prefix targets", () => {
      const raw = JSON.stringify({
        speech: "마케팅 담당자분?",
        key_points: [],
        mention: { target: "member:마케팅", intent: "opinion" },
        visual_hint: null,
      });
      const result = parseStructuredOutput(raw, "cmo");
      expect(result.data.mention?.target).toBe("member:마케팅");
    });
  });
});
