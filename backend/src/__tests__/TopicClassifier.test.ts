import { describe, it, expect } from "vitest";
import { classifyTopic, parseMentions } from "../orchestrator/TopicClassifier.js";

// ─── classifyTopic ──────────────────────────────────────────────────────────

describe("classifyTopic", () => {
  describe("topic detection — Korean keywords", () => {
    it("classifies '예산 논의' as finance with primaryAgent cfo", () => {
      const result = classifyTopic("예산 논의");
      expect(result.topic).toBe("finance");
      expect(result.primaryAgent).toBe("cfo");
    });

    it("classifies '마케팅 캠페인' as marketing with primaryAgent cmo", () => {
      const result = classifyTopic("마케팅 캠페인");
      expect(result.topic).toBe("marketing");
      expect(result.primaryAgent).toBe("cmo");
    });

    it("classifies '서버 아키텍처' as tech with primaryAgent cto", () => {
      const result = classifyTopic("서버 아키텍처");
      expect(result.topic).toBe("tech");
      expect(result.primaryAgent).toBe("cto");
    });

    it("classifies '계약 검토' as legal with primaryAgent clo", () => {
      const result = classifyTopic("계약 검토");
      expect(result.topic).toBe("legal");
      expect(result.primaryAgent).toBe("clo");
    });

    it("classifies '디자인 UX' as design with primaryAgent cdo", () => {
      const result = classifyTopic("디자인 UX");
      expect(result.topic).toBe("design");
      expect(result.primaryAgent).toBe("cdo");
    });
  });

  describe("topic detection — English keywords", () => {
    it("classifies 'budget plan' as finance", () => {
      const result = classifyTopic("budget plan");
      expect(result.topic).toBe("finance");
      expect(result.primaryAgent).toBe("cfo");
    });

    it("classifies 'marketing campaign brand' as marketing", () => {
      const result = classifyTopic("marketing campaign brand");
      expect(result.topic).toBe("marketing");
      expect(result.primaryAgent).toBe("cmo");
    });
  });

  describe("general fallback", () => {
    it("classifies unrelated text as general with primaryAgent coo", () => {
      const result = classifyTopic("오늘 날씨 좋네요");
      expect(result.topic).toBe("general");
      expect(result.primaryAgent).toBe("coo");
    });

    it("returns secondaryAgents for general topic", () => {
      const result = classifyTopic("오늘 날씨 좋네요");
      expect(result.secondaryAgents).toEqual(["cfo", "cmo"]);
    });
  });

  describe("confidence scoring", () => {
    it("returns confidence 0.3 when no keywords match (general fallback)", () => {
      const result = classifyTopic("오늘 날씨 좋네요");
      expect(result.confidence).toBe(0.3);
    });

    it("returns confidence 1/3 (~0.333) for exactly 1 keyword match", () => {
      // "예산" is a single finance keyword
      const result = classifyTopic("예산");
      expect(result.confidence).toBeCloseTo(1 / 3, 5);
    });

    it("returns confidence capped at 1.0 for 3+ keyword matches", () => {
      // "예산 비용 마진" — three distinct finance keywords
      const result = classifyTopic("예산 비용 마진");
      expect(result.confidence).toBe(1.0);
    });

    it("higher keyword count produces higher confidence", () => {
      const oneKw = classifyTopic("예산");
      const twoKw = classifyTopic("예산 비용");
      expect(twoKw.confidence).toBeGreaterThan(oneKw.confidence);
    });
  });

  describe("secondaryAgents", () => {
    it("finance topic returns coo and clo as secondary agents", () => {
      const result = classifyTopic("예산");
      expect(result.secondaryAgents).toEqual(["coo", "clo"]);
    });

    it("tech topic returns cdo as secondary agent", () => {
      const result = classifyTopic("서버");
      expect(result.secondaryAgents).toEqual(["cdo"]);
    });
  });
});

// ─── parseMentions ───────────────────────────────────────────────────────────

describe("parseMentions", () => {
  describe("role-based mentions", () => {
    it("parses @COO to ['coo']", () => {
      expect(parseMentions("@COO 어떻게 생각하세요?")).toEqual(["coo"]);
    });

    it("parses @CFO to ['cfo']", () => {
      expect(parseMentions("@CFO 예산 확인 부탁드립니다")).toEqual(["cfo"]);
    });

    it("parses @CMO to ['cmo']", () => {
      expect(parseMentions("@CMO 마케팅 전략은?")).toEqual(["cmo"]);
    });

    it("parses @CTO to ['cto']", () => {
      expect(parseMentions("@CTO 서버 이슈 공유해주세요")).toEqual(["cto"]);
    });

    it("parses @CDO to ['cdo']", () => {
      expect(parseMentions("@CDO UX 피드백 주세요")).toEqual(["cdo"]);
    });

    it("parses @CLO to ['clo']", () => {
      expect(parseMentions("@CLO 계약서 검토 부탁드립니다")).toEqual(["clo"]);
    });
  });

  describe("name-based mentions", () => {
    it("parses @Hudson to ['coo']", () => {
      expect(parseMentions("@Hudson 의견 주세요")).toEqual(["coo"]);
    });

    it("parses @Amelia to ['cfo']", () => {
      expect(parseMentions("@Amelia 예산 알려주세요")).toEqual(["cfo"]);
    });

    it("parses @Yusef to ['cmo']", () => {
      expect(parseMentions("@Yusef 캠페인 계획?")).toEqual(["cmo"]);
    });

    it("parses @Kelvin to ['cto']", () => {
      expect(parseMentions("@Kelvin 기술 스택 검토")).toEqual(["cto"]);
    });

    it("parses @Jonas to ['cdo']", () => {
      expect(parseMentions("@Jonas 디자인 리뷰")).toEqual(["cdo"]);
    });

    it("parses @Bradley to ['clo']", () => {
      expect(parseMentions("@Bradley 규정 확인 요청")).toEqual(["clo"]);
    });
  });

  describe("case insensitivity", () => {
    it("parses @AMELIA (uppercase) to ['cfo']", () => {
      expect(parseMentions("@AMELIA 예산 정보")).toEqual(["cfo"]);
    });

    it("parses @coo (lowercase) to ['coo']", () => {
      expect(parseMentions("@coo 확인 부탁")).toEqual(["coo"]);
    });

    it("parses @hudson (all lowercase) to ['coo']", () => {
      expect(parseMentions("@hudson 의견 주세요")).toEqual(["coo"]);
    });
  });

  describe("multiple mentions", () => {
    it("parses @CFO @CMO to ['cfo', 'cmo']", () => {
      expect(parseMentions("@CFO @CMO 같이 검토해주세요")).toEqual(["cfo", "cmo"]);
    });

    it("deduplicates @COO @COO to ['coo']", () => {
      expect(parseMentions("@COO @COO 중요합니다")).toEqual(["coo"]);
    });

    it("deduplicates @Hudson @COO (same agent different notation) to ['coo']", () => {
      expect(parseMentions("@Hudson @COO 의견")).toEqual(["coo"]);
    });
  });

  describe("no mentions", () => {
    it("returns [] when there are no @mentions", () => {
      expect(parseMentions("오늘 날씨 좋네요")).toEqual([]);
    });

    it("returns [] for empty string", () => {
      expect(parseMentions("")).toEqual([]);
    });
  });

  describe("false positive guard", () => {
    it("does not extract email addresses as mentions", () => {
      // email@domain.com — '@' is not followed by a valid role/name from the pattern
      expect(parseMentions("email@domain.com 으로 보내주세요")).toEqual([]);
    });

    it("does not match partial role substrings without @ prefix", () => {
      expect(parseMentions("CFO 담당자")).toEqual([]);
    });
  });
});
