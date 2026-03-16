---
version: "1.0.0"
created: "2026-03-16 10:00"
updated: "2026-03-16 10:00"
---

# Plan: Full English Migration (UI + Agent Prompts)

**목적**: 글로벌 해커톤 심사자(영어권)를 위해 UI 전체 + 에이전트 응답 언어를 영어로 전환
**범위**: strings.ts(1) + common.ts(1) + agent prompts(7) = 총 9개 파일
**병렬 가능**: Task 1~2 독립 / Task 3 내 6개 에이전트 병렬

---

## 파악된 현재 상태

| 파일 | 현재 언어 | 영향 범위 |
| ---- | --------- | --------- |
| `frontend/src/constants/strings.ts` | 한국어 | UI 전체 레이블, 버튼, 플레이스홀더 |
| `backend/src/agents/prompts/common.ts` | 한국어 | 모든 에이전트 공통 (speech 언어 지정, 예시 JSON) |
| `backend/src/agents/prompts/coo-hudson.ts` | 한국어 | COO 페르소나, 화법, 예시 speech |
| `backend/src/agents/prompts/cfo-amelia.ts` | 한국어 | CFO 페르소나, 화법, 예시 speech |
| `backend/src/agents/prompts/cmo-yusef.ts` | 한국어 | CMO 페르소나, 화법, 예시 speech |
| `backend/src/agents/prompts/cto-kelvin.ts` | 한국어 (추정) | CTO 페르소나 |
| `backend/src/agents/prompts/cdo-jonas.ts` | 한국어 (추정) | CDO 페르소나 |
| `backend/src/agents/prompts/clo-bradley.ts` | 한국어 (추정) | CLO 페르소나 |
| `backend/src/agents/prompts/sophia.ts` | 한국어 (추정) | Sophia 비서 프롬프트 |

---

## 영어 전환 핵심 원칙

### 프롬프트 번역 규칙
1. **speech 길이 재조정**: `한국어 발언 (80-180자)` → `English statement (30-80 words)`
   (영어는 한국어 대비 30% 더 간결 → 토큰↓, 지연↓)
2. **시각화 트리거 키워드 영어화**: "시각화", "차트" → "visualization", "chart", "show me", "graph"
3. **sophia_request query 영어화**: 검색어를 영어로 변경 (LLM 검색 품질 향상)
4. **예시 JSON speech**: 한국어 예시 발언 → 영어 예시 발언
5. **정체성 문장**: "당신은 BizRoom.ai의 COO Hudson입니다" → "You are COO Hudson at BizRoom.ai"
6. **간결화 병행**: 번역 시 불필요한 반복 제거 (프롬프트 토큰 절감 목표)

### strings.ts 전환 규칙
- 에이전트 이름(Hudson, Amelia 등): 그대로 유지
- role 코드(coo, cfo 등): 그대로 유지
- 예시 placeholder: `"김대표"` → `"e.g. Alex"` 등 영어권 자연스러운 예시로

---

## Task 구조

### Task 1: strings.ts 영어 전환
**담당**: Alpha (단독 파일, 독립 작업)
**파일**: `frontend/src/constants/strings.ts`
**작업 내용**:

| 항목 | 현재 | 변경 후 |
| ---- | ---- | ------- |
| `meeting.start` | "회의를 시작하겠습니다" | "Let's start the meeting." |
| `meeting.end` | "회의를 종료합니다" | "Meeting adjourned." |
| `meeting.phase.idle` | "대기 중" | "Idle" |
| `meeting.phase.opening` | "개회" | "Opening" |
| `meeting.phase.briefing` | "브리핑" | "Briefing" |
| `meeting.phase.discussion` | "토론" | "Discussion" |
| `meeting.phase.decision` | "의사결정" | "Decision" |
| `meeting.phase.action` | "실행계획" | "Action Plan" |
| `meeting.phase.closing` | "폐회" | "Closing" |
| `agents.*.title` | "최고운영책임자" 등 | "Chief Operating Officer" 등 |
| `agents.sophia.title` | "AI 비서" | "AI Secretary" |
| `input.placeholder` | "안건을 입력하세요..." | "Enter your agenda..." |
| `input.placeholderAuto` | "토론 주제를 입력하세요..." | "Enter discussion topic..." |
| `input.placeholderDm` | `${name}에게 메시지를...` | `Message ${name}...` |
| `input.send` | "전송" | "Send" |
| `input.startAuto` | "토론 시작" | "Start Discussion" |
| `input.stopAuto` | "토론 중지" | "Stop Discussion" |
| `input.pttHint` | "Space를 길게 누르면 음성 입력" | "Hold Space to speak" |
| `input.recording` | "녹음 중..." | "Recording..." |
| `input.processing` | "변환 중..." | "Processing..." |
| `mode.selectDmAgent` | "대화할 임원을 선택하세요" | "Select an executive to chat with" |
| `mode.autoObserving` | "AI 임원진이 자율 토론 중입니다" | "AI executives are in autonomous discussion" |
| `mode.autoPrompt` | "토론 주제를 입력하면..." | "Enter a topic to start autonomous discussion" |
| `quickActions.agree` | "동의" | "Agree" |
| `quickActions.disagree` | "반대" | "Disagree" |
| `quickActions.next` | "다음" | "Next" |
| `quickActions.hold` | "보류" | "Hold" |
| `typing.single` | `${name}이(가) 입력 중...` | `${name} is typing...` |
| `typing.multiple` | `${names.join(", ")}이(가)...` | `${names.join(", ")} are typing...` |
| `sidebar.channels` | "채널" | "Channels" |
| `sidebar.participants` | "참여자" | "Participants" |
| `sidebar.agents` | "AI 임원진" | "AI Executives" |
| `sidebar.humans` | "참여자" | "Members" |
| `artifacts.download` | "다운로드" | "Download" |
| `artifacts.preview` | "미리보기" | "Preview" |
| `artifacts.minutes` | "회의록" | "Meeting Minutes" |
| `artifacts.excel` | "Excel 보고서" | "Excel Report" |
| `drawer.*` | 전체 한글 | 영어 |
| `camera.*` | 전체 한글 | 영어 |
| `brandMemory.*` | 전체 한글 | 영어 |
| `agenda.*` | 전체 한글 | 영어 |
| `lobby.*` | 전체 한글 | 영어 |
| `lobby.namePlaceholder` | "예: 김대표" | "e.g. Alex" |
| `lobby.roomIdPlaceholder` | "회의실 코드 (예: BZ-A3F9)" | "Room code (e.g. BZ-A3F9)" |
| `ceo.*` | 전체 한글 | 영어 |
| `mic.*` | 전체 한글 | 영어 |
| `errors.*` | 전체 한글 | 영어 |
| `overlay.*` | 전체 한글 | 영어 |

---

### Task 2: common.ts 영어 전환 (가장 중요)
**담당**: Alpha (Task 1과 병렬 가능)
**파일**: `backend/src/agents/prompts/common.ts`
**작업 내용**:

```
변경 전: "모든 응답은 한국어 표준어로 합니다."
변경 후: "All responses must be in English."

변경 전: "speech: 한국어 발언 (80-180자). 60자 미만은 너무 짧고, 200자 초과는 너무 깁니다."
변경 후: "speech: English statement (30-80 words). Under 15 words is too brief; over 100 words is too long."

변경 전: 시각화 트리거 "시각화", "차트", "그래프", "보여줘", "정리해줘"
변경 후: "visualization", "chart", "graph", "show me", "summarize", "display"

변경 전: 예시 JSON speech (한국어 발언)
변경 후: 영어 발언으로 교체

변경 전: "시간 내에 sophia_request 즉시 실행..." 등 한국어 규칙 전체
변경 후: 영어로 전환 + 동시에 간결화 (토큰 절감)

변경 전: "당신은 BizRoom.ai의 AI 임원입니다..."
변경 후: "You are an AI executive at BizRoom.ai..."
```

**sophia_request query 영어화**:
```
변경 전: {"type": "search", "query": "2026 SaaS 시장 한국"}
변경 후: {"type": "search", "query": "2026 SaaS market global trends"}
```

---

### Task 3: 에이전트 프롬프트 6종 영어 전환
**담당**: Alpha × 3 병렬 에이전트 (coo+cfo / cmo+cto / cdo+clo)
**파일**: `coo-hudson.ts`, `cfo-amelia.ts`, `cmo-yusef.ts`, `cto-kelvin.ts`, `cdo-jonas.ts`, `clo-bradley.ts`

**공통 패턴 (모든 에이전트 동일)**:
```
"## 정체성\n당신은 BizRoom.ai의 COO Hudson입니다."
→ "## Identity\nYou are COO Hudson at BizRoom.ai."

"## 핵심 가치" → "## Core Values"
"## 성격" → "## Personality"
"## 화법 패턴" → "## Speech Style"
"## 전문 분야" → "## Domain Expertise"
"## 다른 임원과의 상호작용" → "## Agent Interactions"
"## 내가 하지 않는 것" → "## Out of Scope"
"기억하세요: 당신은..." → "Remember: You are..."

예시 JSON 내 한국어 speech → 영어로
identityAnchor 한국어 → 영어로
```

**에이전트별 주요 전환**:

| 에이전트 | 핵심 가치 (현재) | 핵심 가치 (변경) |
| -------- | ---------------- | ---------------- |
| COO Hudson | "지금 실행한다. 조율은 즉시 자원을 투입하는 것이다." | "Execute now. Coordination means immediate resource allocation." |
| CFO Amelia | "모든 결정에는 숫자가 있어야 한다." | "Every decision needs a number behind it." |
| CMO Yusef | "고객이 원하는 것이 아니라, 아직 모르는 것을 보여줘라." | "Don't show customers what they want — show them what they don't know they need." |
| CTO Kelvin | 확인 후 작성 | — |
| CDO Jonas | 확인 후 작성 | — |
| CLO Bradley | 확인 후 작성 | — |

---

### Task 4: sophia.ts 영어 전환
**담당**: Alpha (Task 3과 병렬)
**파일**: `backend/src/agents/prompts/sophia.ts`
**작업**: 동일 패턴 적용

---

### Task 5: Beta 검토 (Zero Issue)
**담당**: Beta 팀
**체크리스트**:
- [ ] strings.ts: 한국어 잔존 문자열 없음
- [ ] common.ts: "한국어"/"Korean" 지시 없음, 영어 예시 speech 자연스러움
- [ ] 에이전트 프롬프트 7개: 한국어 잔존 없음
- [ ] identityAnchor 전체 영어
- [ ] sophia_request query 영어
- [ ] 시각화 트리거 키워드 영어 포함
- [ ] speech 길이 지침 조정됨 (30-80 words)
- [ ] 빌드 오류 없음 (`cd frontend && npx tsc --noEmit`)

---

## 실행 순서

```
[병렬 실행]
  Alpha-1: Task 1 (strings.ts)
  Alpha-2: Task 2 (common.ts) + Task 4 (sophia.ts)
  Alpha-3: Task 3-A (coo + cfo)
  Alpha-4: Task 3-B (cmo + cto)
  Alpha-5: Task 3-C (cdo + clo)

[순차]
  → Beta: 전체 검토 + tsc 빌드 확인
  → 완료
```

---

## 예상 결과

- 심사자가 앱 접속 시: 전체 영어 UI
- 에이전트 응답: 영어로 자연스러운 C-Suite 발언
- 데모 영상: 영어 나레이션과 UI 일치
- 프롬프트 토큰: 한국어 대비 약 20-30% 절감 → 응답 속도 개선
