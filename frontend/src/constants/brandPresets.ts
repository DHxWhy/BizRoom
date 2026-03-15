// Brand Memory presets for demo and quick setup
// Ref: Spec §2, §5.3

import type { BrandMemorySet } from "../types";

export const BRAND_PRESETS: Record<string, { label: string; data: BrandMemorySet }> = {
  maestiq: {
    label: "Maestiq (Demo)",
    data: {
      companyName: "Maestiq",
      industry: "AI SaaS / 생산성 도구",
      foundedDate: "2026-02-11",
      founderName: "",
      teamSize: "1인 창업자",
      mission: "1인 기업도 대기업처럼 경영할 수 있다",
      vision: "AI 임원진과 함께하는 경영의 민주화",
      productName: "BizRoom.ai",
      productDescription: "AI C-Suite 가상 임원진과 실시간 음성 회의하는 3D 가상 회의실",
      coreFeatures: [
        "AI 임원진 실시간 음성 회의 + 턴테이킹",
        "기본 C-Suite 6명 (COO, CFO, CMO, CTO, CDO, CLO) — 상용화 시 업종·필요에 맞게 역할 커스텀 가능",
        "실시간 데이터 시각화 (BigScreen)",
        "회의록/PPT/Excel 자동 생성 → OneDrive 저장",
      ],
      targetCustomer: "1인 창업자, 마이크로 기업 대표, 프리랜서",
      techStack:
        "Azure Functions, OpenAI GPT Realtime 1.5 (음성), Whisper-1 (STT), Anthropic Claude (텍스트), Azure SignalR, React Three Fiber, Microsoft Graph API",
      revenueModel: "월 구독형 SaaS (Freemium → Pro → Team 티어)",
      pricing: [
        { name: "Freemium", price: "무료", features: "기본 체험" },
        { name: "Pro", price: "$39/월", features: "개인 사용자" },
        { name: "Team", price: "$79/월", features: "팀 협업" },
      ],
      marketSize: "글로벌 솔로프리너 1.5억 명, AI SaaS 시장 $303억 (2026)",
      marketStats: [
        "글로벌 1인 기업 1.5억 명 (2025 기준)",
        "미국 1인 기업 2,980만 명, 연 매출 $1.7조",
        "미국 전체 사업체의 84%가 무고용 사업체",
        "AI SaaS 시장 $303억 (2026), CAGR 36.6%",
        "SMB 소프트웨어 시장 $801억 (2026)",
        "SMB 63%가 매일 AI 사용 (2025 조사)",
      ],
      competitors: [
        {
          name: "ChatGPT",
          weakness: "범용 AI, 역할 구분 없음, 텍스트 기반",
        },
        {
          name: "Microsoft Copilot",
          weakness: "1:1 어시스턴트 구조, 회의 기능 없음",
        },
        { name: "Notion AI", weakness: "문서 중심, 음성 회의 불가" },
        {
          name: "Fireflies.ai",
          weakness: "회의록 전사만, 의사결정 참여 불가",
        },
      ],
      differentiation: [
        "범용 AI가 아닌 '역할 기반 AI 임원진'",
        "텍스트가 아닌 '실시간 음성 회의'",
        "기록이 아닌 '의사결정 + 산출물 생성'",
        "Microsoft 365 네이티브 통합",
      ],
      currentStage: "MVP 완성, 해커톤 출품 준비 중",
      funding: "부트스트래핑 (자기자본)",
      goals: "MS AI Dev Days 수상 → AppSource 런칭",
      links: [
        { label: "GitHub", url: "https://github.com/maestiq/bizroom" },
        { label: "AppSource", url: "(런칭 예정)" },
        { label: "Azure Portal", url: "https://portal.azure.com" },
        { label: "MS AI Dev Days", url: "https://devdays.microsoft.com" },
      ],
      challenges: [
        "해커톤 심사위원에게 3분 안에 가치 전달",
        "실시간 데모 안정성 확보",
        "AppSource 런칭 로드맵 수립",
      ],
      quarterGoal: "Microsoft AI Dev Days 해커톤 출품 및 수상",
      meetingObjective: "BizRoom.ai 해커톤 출품 전략 준비",
      brandCopy: "월 $39에 임원진과 오피스를 임대하세요",
      subCopy: "AI C-Suite와 가상 회의실, 이제 혼자가 아닙니다",
      positioning: "LLM을 시각화한 경험 플랫폼 — AI 모델이 아닌 AI 경영 경험을 제공",
    },
  },
};

/** Get default empty brand memory with only required fields */
export function createEmptyBrandMemory(): BrandMemorySet {
  return {
    companyName: "",
    industry: "",
    productName: "",
  };
}
