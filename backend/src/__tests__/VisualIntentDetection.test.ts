import { describe, it, expect } from "vitest";
import { detectVisualIntent } from "../orchestrator/VoiceLiveOrchestrator.js";

describe("detectVisualIntent", () => {
  describe("comparison keywords", () => {
    it("detects Korean '비교' keyword", () => {
      const hint = detectVisualIntent("[CEO]: A안과 B안을 비교해주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("comparison");
    });

    it("detects '장단점' keyword", () => {
      const hint = detectVisualIntent("[CEO]: 각 옵션의 장단점을 분석해주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("comparison");
    });

    it("detects English 'vs' keyword", () => {
      const hint = detectVisualIntent("[CEO]: Option A vs Option B");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("comparison");
    });
  });

  describe("chart keywords", () => {
    it("detects '비율' for pie chart", () => {
      const hint = detectVisualIntent("[CEO]: 시장 점유율 비율을 보여주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("pie-chart");
    });

    it("detects '차트' for bar chart", () => {
      const hint = detectVisualIntent("[CEO]: 매출 차트를 보여주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("bar-chart");
    });

    it("detects '그래프' for bar chart", () => {
      const hint = detectVisualIntent("[CEO]: 분기별 성장 그래프");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("bar-chart");
    });
  });

  describe("timeline keywords", () => {
    it("detects '타임라인'", () => {
      const hint = detectVisualIntent("[CEO]: 프로젝트 타임라인을 정리해주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("timeline");
    });

    it("detects '로드맵'", () => {
      const hint = detectVisualIntent("[CEO]: Q2 로드맵을 보여주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("timeline");
    });

    it("detects '마일스톤'", () => {
      const hint = detectVisualIntent("[CEO]: 주요 마일스톤을 정리해줘");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("timeline");
    });
  });

  describe("checklist keywords", () => {
    it("detects '체크리스트'", () => {
      const hint = detectVisualIntent("[CEO]: 출시 전 체크리스트를 만들어주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("checklist");
    });

    it("detects 'to-do'", () => {
      const hint = detectVisualIntent("[CEO]: to-do list please");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("checklist");
    });
  });

  describe("summary keywords", () => {
    it("detects '요약'", () => {
      const hint = detectVisualIntent("[CEO]: 지금까지 논의를 요약해주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("summary");
    });

    it("detects '정리'", () => {
      const hint = detectVisualIntent("[CEO]: 핵심 포인트를 정리해줘");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("summary");
    });
  });

  describe("architecture keywords", () => {
    it("detects '아키텍처'", () => {
      const hint = detectVisualIntent("[CEO]: 시스템 아키텍처를 보여주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("architecture");
    });

    it("detects '구조도'", () => {
      const hint = detectVisualIntent("[CEO]: 전체 구조도를 그려주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("architecture");
    });
  });

  describe("generic visual request", () => {
    it("detects '시각화' as summary fallback", () => {
      const hint = detectVisualIntent("[CEO]: 시각화해주세요");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("summary");
    });

    it("detects '빅스크린' as summary fallback", () => {
      const hint = detectVisualIntent("[CEO]: 빅스크린에 띄워줘");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("summary");
    });

    it("detects English 'visualize'", () => {
      const hint = detectVisualIntent("[CEO]: Can you visualize this?");
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("summary");
    });
  });

  describe("no visual intent", () => {
    it("returns null for regular conversation", () => {
      const hint = detectVisualIntent("[CEO]: 마케팅 예산에 대해 논의합시다");
      expect(hint).toBeNull();
    });

    it("returns null for empty input", () => {
      const hint = detectVisualIntent("");
      expect(hint).toBeNull();
    });
  });

  describe("agent speech augmentation", () => {
    it("detects visual type from agent speech when user input lacks keywords", () => {
      const hint = detectVisualIntent(
        "[CEO]: 각 옵션을 분석해주세요",
        "A안과 B안의 비교 결과를 말씀드리겠습니다",
      );
      expect(hint).not.toBeNull();
      expect(hint!.type).toBe("comparison");
    });
  });

  describe("title extraction", () => {
    it("incorporates topic from user input into title", () => {
      const hint = detectVisualIntent("[CEO]: 매출 추이를 차트로 보여줘");
      expect(hint).not.toBeNull();
      expect(hint!.title).toContain("매출 추이");
    });

    it("uses default title when input is too short after cleaning", () => {
      const hint = detectVisualIntent("[CEO]: 비교해줘");
      expect(hint).not.toBeNull();
      // After cleaning, the remaining text is too short, so default title is used
      expect(hint!.title).toBe("비교 분석");
    });
  });
});
