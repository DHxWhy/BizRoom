// Centralized UI strings — Korean (ko)
// Ref: CLAUDE.md §Language & i18n Policy
// All UI strings MUST be referenced from this file, never hardcoded.

export const S = {
  app: {
    name: "BizRoom.ai",
    tagline: "Your AI Executive Team",
  },
  meeting: {
    start: "회의를 시작하겠습니다",
    end: "회의를 종료합니다",
    phase: {
      idle: "대기 중",
      opening: "개회",
      briefing: "브리핑",
      discussion: "토론",
      decision: "의사결정",
      action: "실행계획",
      closing: "폐회",
    },
  },
  agents: {
    coo: { name: "Hudson", role: "COO", title: "최고운영책임자" },
    cfo: { name: "Amelia", role: "CFO", title: "최고재무책임자" },
    cmo: { name: "Yusef", role: "CMO", title: "최고마케팅책임자" },
    cto: { name: "Kelvin", role: "CTO", title: "최고기술책임자" },
    cdo: { name: "Jonas", role: "CDO", title: "최고디자인책임자" },
    clo: { name: "Bradley", role: "CLO", title: "최고법무책임자" },
  },
  input: {
    placeholder: "안건을 입력하세요...",
    send: "전송",
    pttHint: "Space를 길게 누르면 음성 입력",
    recording: "녹음 중...",
  },
  quickActions: {
    agree: "동의",
    disagree: "반대",
    next: "다음",
    hold: "보류",
  },
  typing: {
    single: (name: string) => `${name}이(가) 입력 중...`,
    multiple: (names: string[]) => `${names.join(", ")}이(가) 입력 중...`,
  },
  sidebar: {
    channels: "채널",
    participants: "참여자",
    agents: "AI 임원진",
    humans: "참여자",
  },
  artifacts: {
    download: "다운로드",
    preview: "미리보기",
    minutes: "회의록",
    excel: "Excel 보고서",
  },
  errors: {
    connectionFailed: "서버 연결에 실패했습니다",
    sendFailed: "메시지 전송에 실패했습니다",
    micPermission: "마이크 접근 권한이 필요합니다",
    boundary: {
      title: "문제가 발생했습니다",
      unknown: "알 수 없는 오류가 발생했습니다",
      reload: "새로고침",
    },
  },
} as const;
