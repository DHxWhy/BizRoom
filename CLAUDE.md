# BizRoom.ai — Project Instructions

## Project Overview
BizRoom.ai는 AI C-Suite 임원진과 실시간 회의하는 가상 사무실 웹앱입니다.
Microsoft AI Dev Days Hackathon 출품작이자 글로벌 SaaS 프로덕트입니다.

## Language & i18n Policy

### 개발 언어 전략
- **현재**: UI 문자열을 한국어(ko)로 개발. 모든 기능 빌드/테스트 완료가 최우선.
- **최최종 단계**: 영어(en) 추가 → 디폴트 언어를 `en`으로 변경. 프로젝트가 완전히 완성된 후에만 진행.
- **이후**: 다국어 확장 (ja, zh, es 등).
- **⚠️ 언어 전환은 명시적으로 요청하기 전까지 절대 진행하지 않는다.**

### 필수 규칙
- UI에 표시되는 모든 문자열은 **컴포넌트에 직접 하드코딩 금지**.
- `frontend/src/constants/strings.ts`에 중앙 집중 관리.
- 컴포넌트에서는 `S.meeting.title` 형태로 참조.
- Phase 2에서 i18next 도입 시 키 매핑만으로 전환 가능하도록 설계.

```typescript
// frontend/src/constants/strings.ts
export const S = {
  app: { name: "BizRoom.ai", tagline: "Your AI Executive Team" },
  meeting: { start: "회의를 시작하겠습니다", end: "회의를 종료합니다" },
  agents: {
    coo: { name: "Hudson", role: "COO" },
    cfo: { name: "Amelia", role: "CFO" },
    cmo: { name: "Yusef", role: "CMO" },
  },
} as const;
```

---

## Tech Stack

### Frontend
| 기술                                        | 버전/비고                          |
| ------------------------------------------- | ---------------------------------- |
| React                                       | 19.x                              |
| Tailwind CSS                                | 4.x (`@tailwindcss/vite`)         |
| Vite                                        | 7.x                               |
| TypeScript                                  | 5.x strict mode                   |
| Three.js + @react-three/fiber + drei        | R3F 9.x, drei 10.x, Three 0.170   |
| @microsoft/signalr                          | 10.x (WebSocket 실시간)           |

### Backend
| 기술                                        | 버전/비고                          |
| ------------------------------------------- | ---------------------------------- |
| Azure Functions v4                          | Node.js 20 / TypeScript           |
| OpenAI SDK                                  | 4.x (Realtime + Whisper STT)      |
| pptxgenjs                                   | 3.x (PPT 생성)                    |
| exceljs + xlsx                              | Excel 생성                         |
| vitest                                      | 1.x (테스트 프레임워크)           |
| ws                                          | 8.x (WebSocket — GPT Realtime)    |

### AI Model
| 용도                     | 모델                                         | Temperature |
| ------------------------ | -------------------------------------------- | ----------- |
| 실시간 음성 대화         | GPT Realtime 1.5 (OpenAI WebSocket)          | 에이전트별  |
| 음성 인식 (STT)          | Whisper-1 (OpenAI)                           | -           |
| 시각화 생성 (Sophia)     | Claude Sonnet 4.6 / Haiku 4.5 (Anthropic)   | 0.2         |
| 회의록 생성              | Claude Opus 4.6 (Anthropic)                  | 0.4         |
| 아티팩트 생성            | Claude Haiku 4.5 (Anthropic)                 | 0.1         |

> ModelRouter (`backend/src/services/ModelRouter.ts`)가 TaskType별 모델/temperature를 자동 라우팅한다.
> **참고: Azure OpenAI GPT-4o는 사용하지 않음. OpenAI Direct API + Anthropic Claude 사용.**

### Infrastructure (Microsoft Azure)
| 기술                          | 용도                                             |
| ----------------------------- | ------------------------------------------------ |
| Azure Functions               | 백엔드 서버리스 API (23개 엔드포인트)            |
| Azure SignalR Service         | 실시간 양방향 통신 (Serverless 모드)             |
| Azure Static Web Apps         | 프론트엔드 배포 + CDN                            |
| Azure AI Speech               | 음성 합성 기반 기술 (DragonHDLatest 음성 예정)   |
| Microsoft Graph API           | OneDrive 파일 저장, Planner 태스크 생성          |

### 고객 가치 (Customer Value Proposition)

**"혼자서도 C-Suite 임원진과 회의할 수 있는 AI 가상 사무실"**

| 고객 세그먼트              | 해결하는 문제                                     | 제공 가치                                              |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| **1인 창업자/프리랜서**    | 혼자서 모든 의사결정을 내려야 함                  | 6명의 AI 임원이 재무·마케팅·법률·기술 관점에서 즉시 조언 |
| **스타트업 대표**          | C-Suite 채용 전 전략적 의사결정 지원 부재         | 전문 영역별 AI 임원이 데이터 기반 의견 제시             |
| **중소기업 경영진**        | 회의 준비·회의록·액션아이템 관리에 시간 소모       | 자동 회의록 생성, PPT/Excel 산출물, Planner 태스크 연동 |
| **글로벌 팀**              | 시차·언어 장벽으로 실시간 회의 어려움             | 24/7 AI 임원 상시 대기, 다국어 지원 예정               |

**핵심 차별점:**
- **음성 기반 실시간 대화** — 텍스트가 아닌 목소리로 AI와 회의
- **3D 가상 회의실** — 몰입감 있는 시각적 경험 (React Three Fiber)
- **구조화된 회의 진행** — TurnManager가 순차적 턴테이킹 관리
- **즉각적 시각화** — Sophia가 논의 내용을 실시간 차트/요약으로 빅스크린에 표시
- **회의 산출물 자동화** — PPT, Excel, 회의록이 자동 생성되어 OneDrive에 저장

---

## Agent Names

| 에이전트   | 이름         | 영감 원천                    | MVP    |
| ---------- | ------------ | ---------------------------- | ------ |
| COO        | **Hudson**   | Judson Althoff               | O (1)  |
| CFO        | **Amelia**   | Amy Hood                     | O (2)  |
| CMO        | **Yusef**    | Yusuf Mehdi                  | O (3)  |
| CTO        | **Kelvin**   | Kevin Scott                  | - (v2) |
| CDO        | **Jonas**    | Jon Friedman                 | - (v2) |
| CLO        | **Bradley**  | Brad Smith                   | - (v2) |
| (Support)  | **Sophia**   | 시각화 + 회의록 전문 에이전트 | O      |

> Sophia는 C-Suite가 아닌 **Supporting Analysis Agent**. HTTP API 없이 VoiceLiveOrchestrator 내부 이벤트 파이프라인으로 동작한다.

---

## Project Directory Structure

```
BizRoom/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── meeting3d/     — 3D 회의실 (R3F): MeetingRoom3D, RPMAgentAvatar, BigScreenRenderer, HoloMonitor3D, SophiaBlob3D ...
│       │   ├── chat/          — 메시지 UI: ChatRoom, MessageBubble, TypingIndicator, SophiaMessage
│       │   ├── input/         — 입력: InputArea, PushToTalk, MicToggle, QuickActions
│       │   ├── meeting/       — 회의 제어: MeetingBanner, ModeSelector, ChairmanControls, DmAgentPicker
│       │   ├── lobby/         — 로비: LobbyPage, BrandMemoryForm
│       │   ├── artifact/      — 산출물: ArtifactPreview
│       │   └── layout/        — 레이아웃: AppShell, Sidebar
│       ├── hooks/             — useSignalR, useSessionRoom, usePushToTalk, useAgentAudio, useVoiceLive, useViseme
│       ├── constants/         — strings.ts (i18n), brandPresets.ts, agentVoices.ts
│       ├── context/           — MeetingContext.tsx (전역 상태)
│       └── types/             — shared/types.ts re-export
│
├── backend/
│   └── src/
│       ├── functions/         — Azure Functions: negotiate, message, meetingStart, meetingEnd, meeting-voice, meeting-chairman, roomJoin, roomLeave, artifactDownload
│       ├── orchestrator/      — ★ 핵심 오케스트레이션
│       │   ├── TurnManager.ts           — 턴테이킹 상태 머신 (P0-P4 우선순위)
│       │   ├── VoiceLiveOrchestrator.ts — 실시간 음성 + Sophia 파이프라인 통합
│       │   ├── ContextBroker.ts         — 에이전트 간 공유 컨텍스트 관리
│       │   ├── ResponseParser.ts        — LLM 응답 → StructuredAgentOutput 파싱
│       │   ├── TopicClassifier.ts       — 사용자 입력 → 관련 에이전트 라우팅
│       │   └── SnippetManager.ts        — 회의 단계 (Open→Discuss→Decide→Act) 관리
│       ├── agents/
│       │   ├── AgentFactory.ts          — 에이전트 생성 + OpenAI 호출
│       │   ├── SophiaAgent.ts           — 시각화 버퍼/큐 관리 (Singleton)
│       │   ├── agentConfigs.ts          — 에이전트별 설정 (이름, 색상, 아이콘)
│       │   └── prompts/                 — 에이전트별 시스템 프롬프트 + common.ts + sophia.ts + brandMemory.ts
│       ├── services/
│       │   ├── ModelRouter.ts           — Task → 모델/Temperature 매핑
│       │   ├── VoiceLiveSessionManager.ts — GPT Realtime 세션 관리
│       │   ├── SignalRService.ts        — SignalR 이벤트 브로드캐스트
│       │   ├── ArtifactService.ts       — 아티팩트 저장/다운로드
│       │   ├── ArtifactGenerator.ts     — Excel/PPT 생성
│       │   └── GraphService.ts          — Microsoft Graph API (OneDrive, Planner)
│       ├── plugins/           — ExcelPlugin.ts, MeetingMinutesPlugin.ts
│       ├── constants/         — turnConfig.ts, responseSchema.ts, agentVoices.ts
│       ├── models/            — shared/types.ts re-export + 백엔드 전용 타입
│       └── __tests__/         — vitest 테스트
│
├── shared/
│   └── types.ts               — ★ Single Source of Truth: 프론트/백엔드 공유 타입
│
└── docs/
    ├── ARCHITECTURE.md        — 전체 아키텍처 다이어그램 + 컴포넌트 상세
    ├── TECH_SPEC.md           — 기술 사양서 (프론트/백엔드/오케스트레이터/Sophia)
    ├── AGENT_DESIGN.md        — 에이전트 페르소나 + 프롬프트 설계
    ├── DESIGN_SYSTEM.md       — UI/UX 디자인 시스템 + BigScreen 스타일
    ├── PRD.md                 — 제품 요구사항 정의서
    ├── MVP_SCOPE.md           — MVP 기능 범위 (F-01 ~ F-21)
    └── plans/                 — 구현 계획 문서
```

---

## Key Architecture Concepts

### Meeting Modes
| 모드   | 설명                                                  | 컴포넌트                     |
| ------ | ----------------------------------------------------- | ---------------------------- |
| Live   | 사용자가 PTT로 에이전트와 실시간 음성 대화            | `useVoiceLive`, `PushToTalk` |
| Auto   | 주제 기반 에이전트 자율 토론 (사용자 개입 최소화)     | `AutoModeBanner`             |
| DM     | 특정 에이전트와 1:1 대화                              | `DmAgentPicker`              |

### Orchestration Pipeline
```
사용자 발언 → SignalR → TurnManager (우선순위 큐)
    → TopicClassifier → 관련 에이전트 선택
    → AgentFactory.invokeAgent() → OpenAI LLM 호출
    → ResponseParser.parseStructuredOutput()
        → { speech, key_points, mention, visual_hint }
    → VoiceLiveOrchestrator agentDone 핸들러:
        1. sophiaAgent.addToBuffer()
        2. monitorUpdate (key_points → HoloMonitor3D)
        3. turnManager.handleMentionRouting()
        4. Sophia visual generation (visual_hint → BigScreen)
        5. turnManager.onAgentDone()
```

### Sophia Pipeline (Visual + Artifacts)
- **Visual Generation**: 에이전트 `visual_hint` → FIFO 큐 → `callSophiaVisualGPT()` → BigScreenRenderData → `bigScreenUpdate` 이벤트
- **Meeting End**: `POST /api/meeting/end` → COO 종료 발언 → `generateMeetingMinutesGPT()` → PPT + Excel → OneDrive 업로드 → Planner 태스크 → `artifactsReady` 이벤트
- **⚠️ Sophia는 HTTP API가 없음** — VoiceLiveOrchestrator 내부 이벤트 파이프라인으로만 동작

### StructuredAgentOutput (에이전트 응답 포맷)
모든 에이전트는 `responseSchema.ts`에 정의된 JSON 포맷으로 응답한다:
```typescript
{ speech: string, key_points: string[], mention: Mention | null, visual_hint: VisualHint | null }
```

---

## Planning Rules

### 플래닝 원칙
- 모든 구현은 `docs/plans/` 에 계획 문서를 먼저 작성한 후 실행한다.
- 계획 없이 코드를 작성하지 않는다. 단, 핫픽스/1줄 수정은 예외.
- 각 계획은 Task 단위로 분해하고, Task는 2-5분 내 완료 가능한 Step으로 구성한다.
- TDD: 테스트 먼저, 구현 후, 통과 확인, 커밋 순서를 따른다.
- DRY, YAGNI: 현재 필요한 것만 구현. 미래 요구사항을 예측하지 않는다.

### Task 구조
```
Task N: [컴포넌트명]
  Step 1: 실패하는 테스트 작성
  Step 2: 테스트 실패 확인
  Step 3: 최소 구현
  Step 4: 테스트 통과 확인
  Step 5: 커밋
```

### 파일 변경 원칙
- 각 Task에 정확한 파일 경로를 명시한다 (Create / Modify / Test).
- 하나의 파일은 하나의 책임만 갖는다 (SRP).
- 함께 변경되는 파일은 함께 위치시킨다.
- 기존 패턴이 있으면 따른다. 없으면 새 패턴을 정의한다.

### 계획 검토
- 계획 작성 후 실행 전에 반드시 검토한다.
- 스펙이 여러 독립 서브시스템을 포함하면 계획을 분리한다.

---

## Git & Commit Rules

### 커밋 형식 (Conventional Commits)
```
<type>(<scope>): <description>

[optional body]
```

### Type 목록
| Type       | 용도                                     |
| ---------- | ---------------------------------------- |
| `feat`     | 새로운 기능 추가                         |
| `fix`      | 버그 수정                                |
| `refactor` | 기능 변경 없는 코드 구조 개선            |
| `style`    | 포매팅, 세미콜론 등 코드 의미 변경 없음  |
| `test`     | 테스트 추가/수정                         |
| `docs`     | 문서 변경                                |
| `chore`    | 빌드, 설정, 의존성 등 기타               |
| `ci`       | CI/CD 파이프라인 변경                    |
| `perf`     | 성능 개선                                |

### Scope 목록
| Scope        | 대상                                  |
| ------------ | ------------------------------------- |
| `ui`         | React 프론트엔드 컴포넌트             |
| `chat`       | 채팅 UI / 메시지 관련                 |
| `3d`         | 3D 회의실 / Three.js / R3F            |
| `agent`      | AI 에이전트 (프롬프트, 설정)          |
| `orchestr`   | Conversation Orchestrator             |
| `sophia`     | Sophia Agent (시각화, 회의록)         |
| `signalr`    | Azure SignalR 실시간 통신             |
| `api`        | Azure Functions API 엔드포인트        |
| `artifact`   | 산출물 생성 (Excel, PPT, 회의록)      |
| `ptt`        | Push-to-Talk 음성 입력                |
| `voice`      | GPT Realtime API 음성 대화            |
| `auth`       | 인증/세션 관리                        |
| `infra`      | Azure 인프라/배포 설정                |
| `i18n`       | 다국어/문자열 관리                    |
| `design`     | 디자인 시스템/스타일링                |

### 커밋 규칙
- **1 Task = 1 Commit** — 각 Task 완료 시 커밋한다.
- 테스트가 통과한 상태에서만 커밋한다.
- 커밋 메시지는 영어로 작성한다.
- 커밋 메시지는 "why"에 집중한다 (what은 diff에서 보인다).
- `git add .` 사용 금지 — 파일을 명시적으로 스테이징한다.
- `.env`, 시크릿, 대용량 바이너리는 절대 커밋하지 않는다.
- `--no-verify`, `--force` 사용 금지.
- 명시적 요청 없이 커밋하지 않는다.

### 브랜치 전략
- `main` — 배포 가능한 안정 코드
- `dev` — 개발 통합 브랜치
- `feat/<feature-name>` — 기능 브랜치
- `fix/<bug-name>` — 버그 수정 브랜치
- `main`에 직접 push 금지. PR을 통해서만 병합.

### 커밋 메시지 예시
```
feat(chat): add message bubble component with agent avatar

- Support agent/human message differentiation
- Include typing indicator animation
- Agent color coding per DESIGN_SYSTEM.md
```

```
feat(sophia): implement visual generation pipeline with FIFO queue

- Parse visual_hint from StructuredAgentOutput
- BigScreenRenderData generation via callSophiaVisualGPT
- broadcastEvent bigScreenUpdate + sophiaMessage
```

---

## Implementation Workflow — Alpha / Beta / Charlie

### ⚠️ 이 규칙은 모든 구현 작업에 적용된다. 3단계 모두 통과해야 커밋 가능.

### Alpha Team (구현)
- 사용 가능한 **모든 플러그인과 스킬을 총동원**하여 정교하게 구현한다.
- 병렬 처리 가능한 작업은 반드시 병렬 Agent로 실행한다.
- 핵심 기능은 **subagent-driven-development** 패턴을 적용한다.

### Beta Team (검토/테스트/디버깅 → Zero Issue)
- Alpha Team 구현 완료 후, 별도 Agent가 **코드 리뷰 + 테스트 + 디버깅**을 수행한다.
- **Zero Issue** 달성까지 반복한다. 이슈가 남아있으면 Alpha로 반환.
- 사용할 Agent 유형:
  - `superpowers:code-reviewer` — 코드 리뷰
  - `unit-testing:test-automator` — 테스트 자동화
  - `unit-testing:debugger` 또는 `debugging-toolkit:debugger` — 디버깅
  - `code-review-ai:architect-review` — 아키텍처 검토 (핵심 기능)

### Charlie Team (최적화 → Zero Latency급 성능)
- Beta Zero Issue 달성 후, **성능 최적화**를 수행한다.
- 목표: **제로 레이턴시급** — 불필요한 리렌더, 지연, 번들 낭비 제거.
- 최적화 범위:
  - React: `React.memo`, `useMemo`, `useCallback`, lazy loading, code splitting
  - 번들: tree-shaking, dynamic import, 불필요 의존성 제거
  - 네트워크: SignalR 메시지 배칭, 불필요한 API 호출 제거
  - 렌더링: 가상 스크롤(채팅 메시지), 디바운싱, 쓰로틀링
  - 3D: R3F 인스턴싱, useFrame 최적화, 불필요 리렌더 방지
  - CSS: Tailwind purge 확인, 불필요 클래스 제거
- 사용할 Agent 유형:
  - `pantheon:09-optimize` — 성능 최적화
  - `debugging-toolkit:dx-optimizer` — DX 최적화

### Lint & Format (매 단계 자동 실행)
- **ESLint + Prettier는 Alpha/Beta/Charlie 매 단계에서 반드시 실행한다.**
- 코드 작성/수정 후 즉시: `npx eslint --fix . && npx prettier --write .`
- Lint 에러가 있으면 해당 단계를 통과할 수 없다.
- ESLint/Prettier 설정은 프로젝트 루트의 설정 파일을 따른다.

### Alpha → Beta → Charlie → Commit 플로우
```
Alpha 구현 완료
    ↓ ESLint + Prettier
Beta: 코드 리뷰 (code-reviewer)
    ↓ 이슈 발견 시 → Alpha로 반환
Beta: 테스트 실행 (test-automator)
    ↓ 실패 시 → Alpha로 반환
Beta: 디버깅 (debugger)
    ↓ 이슈 발견 시 → Alpha로 반환
Beta: Zero Issue 확인 ✅
    ↓ ESLint + Prettier
Charlie: 성능 최적화 (optimize)
    ↓ 성능 저하 발견 시 → 최적화 반복
Charlie: Zero Latency급 확인 ✅
    ↓ ESLint + Prettier (최종)
커밋 & 푸시
```

### Claude Code Teammate Mode 활용
- 구현 시 **반드시 Agent tool을 활용**하여 병렬/전문 작업을 위임한다.
- 단독 작업 금지: Alpha(구현) + Beta(검토) + Charlie(최적화)를 분리 실행한다.
- `isolation: "worktree"` 를 활용하여 안전한 병렬 개발을 수행한다.
- 각 Agent에는 명확한 역할과 완료 기준을 부여한다.

---

## Documentation & Deep Think Rules

### 공식 문서 참조 원칙 (우선순위)
1. **1순위: 공식 문서** — WebFetch로 해당 기술의 공식 docs를 직접 참조한다.
   - React: https://react.dev
   - Tailwind CSS: https://tailwindcss.com/docs
   - Azure Functions: https://learn.microsoft.com/azure/azure-functions/
   - Semantic Kernel: https://learn.microsoft.com/semantic-kernel/
   - Azure SignalR: https://learn.microsoft.com/azure/azure-signalr/
   - Azure AI Foundry: https://learn.microsoft.com/azure/ai-foundry/
   - Azure Static Web Apps: https://learn.microsoft.com/azure/static-web-apps/
   - React Three Fiber: https://r3f.docs.pmnd.rs/
   - Three.js: https://threejs.org/docs/
2. **2순위: Context7** — 공식 문서로 해결 안 될 때 `mcp__plugin_context7_context7` 활용.
   - `resolve-library-id` → `get-library-docs` 순서로 호출.
3. **3순위: WebSearch** — 특정 에러/이슈 해결 시.
- **⚠️ 추측으로 API를 사용하지 않는다. 반드시 문서를 확인한 후 코드를 작성한다.**

### Deep Think 규칙
- 다음 항목은 구현 전에 **반드시 깊이 사고(deep think)**한다:
  - Conversation Orchestrator (TurnManager, ContextBroker, SnippetManager)
  - VoiceLiveOrchestrator (agentDone 핸들러, Sophia 파이프라인)
  - Sophia 시각화 파이프라인 (visual_hint → BigScreen)
  - ResponseParser + StructuredAgentOutput 파싱 전략
  - SignalR 실시간 메시지 흐름 (이벤트 타입별)
  - Agent-to-Agent (A2A) 통신 (mention routing)
  - Push-to-Talk ↔ STT ↔ SignalR 연결
  - GPT Realtime API WebRTC 세션 관리
  - 에이전트 시스템 프롬프트 설계
  - 3D 회의실 렌더링 최적화 (R3F)
  - Meeting End → Artifact Pipeline (PPT, Excel, OneDrive, Planner)
- Deep Think 방법:
  1. 해당 기능의 공식 문서를 먼저 읽는다.
  2. 아키텍처 문서(`docs/ARCHITECTURE.md`)와 대조한다.
  3. 엣지 케이스를 3개 이상 식별한다.
  4. 구현 방안을 2개 이상 비교한 후 최적안을 선택한다.
  5. 선택 근거를 코드 주석 또는 plan 문서에 기록한다.

---

## Code Conventions
- TypeScript strict mode
- 모든 코드 주석은 영어 (글로벌 오픈소스 레포)
- 커밋 메시지는 영어 (Conventional Commits, 위 규칙 참조)
- 파일/변수명은 영어
- 컴포넌트: PascalCase (`MessageBubble.tsx`)
- 유틸/훅: camelCase (`useSignalR.ts`)
- 상수: UPPER_SNAKE_CASE (`MAX_CONTEXT_MESSAGES`)
- 타입/인터페이스: PascalCase (`interface Message {}`)
- 디렉토리: kebab-case (`push-to-talk/`)
- 공유 타입은 `shared/types.ts` (SSOT)에 정의, 프론트/백엔드에서 re-export
- 테스트 파일: `backend/src/__tests__/*.test.ts` (vitest)
