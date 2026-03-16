---
version: "1.1.0"
created: "2026-03-11 16:00"
updated: "2026-03-11 17:00"
---

# BizRoom.ai MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI C-Suite 임원진(COO, CFO, CMO)과 실시간 그룹 회의하는 가상 사무실 웹앱 MVP를 구현한다.

**Architecture:** React 18 + Tailwind CSS 4 SPA가 Azure SignalR을 통해 Azure Functions v4 백엔드와 실시간 통신한다. 백엔드는 Semantic Kernel으로 3개 AI 에이전트(COO Hudson, CFO Amelia, CMO Yusef)를 오케스트레이션하며, Azure AI Foundry(GPT-4o)로 추론한다. DialogLab 기반 턴테이킹으로 에이전트 간 자율 토론을 구현한다.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 4, TypeScript 5 (strict), Azure Functions v4 (Node.js 20), Semantic Kernel JS, Azure SignalR, Azure AI Foundry (GPT-4o/GPT-4o-mini), SheetJS (xlsx), Web Speech API

**Reference Docs:**
- [`docs/PRD.md`](../PRD.md) — 제품 요구사항
- [`docs/TECH_SPEC.md`](../TECH_SPEC.md) — 기술 사양
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — 아키텍처
- [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) — MVP 스코프 (F-01~F-11)
- [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) — 디자인 시스템
- [`docs/AGENT_DESIGN.md`](../AGENT_DESIGN.md) — 에이전트 설계
- [`docs/PROMPT_ENGINEERING_ANALYSIS.md`](../PROMPT_ENGINEERING_ANALYSIS.md) — 프롬프트 아키텍처
- [`CLAUDE.md`](../../CLAUDE.md) — 프로젝트 규칙 (커밋, 워크플로우, 코드 컨벤션)

---

## File Structure Map

```
BizRoom/
├── CLAUDE.md
├── .gitignore
├── .env.example
├── package.json                          # root workspace config
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx                      # React entry point
│       ├── App.tsx                       # Root component + Router
│       ├── vite-env.d.ts
│       ├── index.css                     # Tailwind directives
│       ├── constants/
│       │   └── strings.ts               # i18n string constants (ko)
│       ├── types/
│       │   └── index.ts                 # Shared TypeScript interfaces
│       ├── hooks/
│       │   ├── useSignalR.ts            # SignalR connection hook
│       │   └── usePushToTalk.ts         # Web Speech API hook
│       ├── context/
│       │   └── MeetingContext.tsx        # Global state (useReducer)
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.tsx          # 3-column layout shell
│       │   │   └── Sidebar.tsx           # Channel list + participants
│       │   ├── chat/
│       │   │   ├── ChatRoom.tsx          # Message list + auto-scroll
│       │   │   ├── MessageBubble.tsx     # Agent/human message
│       │   │   ├── TypingIndicator.tsx   # "Amelia가 입력 중..."
│       │   │   └── AgentAvatar.tsx       # Avatar with status dot
│       │   ├── input/
│       │   │   ├── InputArea.tsx         # Text input + send + PTT toggle
│       │   │   ├── PushToTalk.tsx        # Space-bar hold STT
│       │   │   └── QuickActions.tsx      # 👍👎⏭️🛑 buttons
│       │   ├── meeting/
│       │   │   └── MeetingBanner.tsx     # Phase progress bar
│       │   └── artifact/
│       │       └── ArtifactPreview.tsx   # Inline artifact card
│       └── __tests__/                   # Frontend tests
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── host.json
│   ├── local.settings.json              # .gitignore'd
│   └── src/
│       ├── functions/
│       │   ├── negotiate.ts             # POST /api/negotiate
│       │   ├── message.ts               # POST /api/message
│       │   ├── meetingStart.ts          # POST /api/meeting/start
│       │   └── meetingEnd.ts            # POST /api/meeting/end
│       ├── agents/
│       │   ├── AgentFactory.ts          # Agent creation factory
│       │   ├── agentConfigs.ts          # Agent role configs
│       │   └── prompts/
│       │       ├── common.ts            # Shared base prompt layer
│       │       ├── coo-hudson.ts        # COO system prompt
│       │       ├── cfo-amelia.ts        # CFO system prompt
│       │       └── cmo-yusef.ts         # CMO system prompt
│       ├── orchestrator/
│       │   ├── TurnManager.ts           # DialogLab turn-taking
│       │   ├── TopicClassifier.ts       # Message → topic mapping
│       │   ├── ContextBroker.ts         # Shared meeting context
│       │   └── SnippetManager.ts        # Meeting phase transitions
│       ├── services/
│       │   ├── SignalRService.ts        # SignalR message dispatch
│       │   ├── ModelRouter.ts           # Task-based model selection
│       │   └── ArtifactService.ts       # Artifact generation
│       ├── plugins/
│       │   ├── MeetingMinutesPlugin.ts  # COO: markdown minutes
│       │   └── ExcelPlugin.ts           # CFO: xlsx generation
│       ├── models/
│       │   └── index.ts                 # Shared data models
│       └── __tests__/                   # Backend tests
│
├── shared/
│   └── types.ts                         # Types shared between FE/BE
│
└── docs/
    └── plans/
        └── 2026-03-11-bizroom-mvp.md    # This file
```

---

## Chunk 1: Scaffolding & Dev Environment

### Task 1: Frontend 프로젝트 초기화 (Vite + React + TypeScript)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 프론트엔드 사양

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/index.css`

**Branch:** `feat/scaffolding`

- [ ] **Step 1: Create feat/scaffolding branch**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
git checkout dev
git checkout -b feat/scaffolding
```

- [ ] **Step 2: Initialize Vite React TypeScript project**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 3: Install frontend dependencies**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend"
npm install
npm install @microsoft/signalr
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 4: Configure Vite with Tailwind plugin**

`frontend/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:7071",
    },
  },
});
```

- [ ] **Step 5: Configure TypeScript strict mode**

Update `frontend/tsconfig.json` — ensure `"strict": true`.

- [ ] **Step 6: Setup Tailwind CSS entry**

`frontend/src/index.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 7: Create minimal App.tsx**

`frontend/src/App.tsx`:
```typescript
function App() {
  return (
    <div className="h-screen bg-neutral-900 text-white flex items-center justify-center">
      <h1 className="text-2xl font-bold">BizRoom.ai</h1>
    </div>
  );
}

export default App;
```

- [ ] **Step 8: Verify frontend starts**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend"
npm run dev
```
Expected: Vite dev server starts, browser shows "BizRoom.ai" on dark background.

- [ ] **Step 9: Commit**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
git add frontend/
git commit -m "feat(ui): initialize frontend with Vite, React 18, TypeScript, Tailwind CSS

- Vite 5 + React 18 + TypeScript strict mode
- Tailwind CSS 4 with @tailwindcss/vite plugin
- SignalR client SDK installed
- Proxy config for local Azure Functions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Backend 프로젝트 초기화 (Azure Functions v4 + TypeScript)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §2 백엔드 사양

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/host.json`
- Create: `backend/local.settings.json`
- Create: `backend/src/functions/negotiate.ts`

- [ ] **Step 1: Initialize Azure Functions project**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
mkdir -p backend/src/functions backend/src/agents/prompts backend/src/orchestrator backend/src/services backend/src/plugins backend/src/models
```

- [ ] **Step 2: Create backend package.json**

`backend/package.json`:
```json
{
  "name": "bizroom-backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "start": "func start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@azure/functions": "^4.0.0",
    "@microsoft/semantic-kernel": "^1.0.0",
    "openai": "^4.0.0",
    "xlsx": "^0.18.5",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "azure-functions-core-tools": "^4.0.0"
  }
}
```

- [ ] **Step 3: Create backend tsconfig.json**

`backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create host.json**

`backend/host.json`:
```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

- [ ] **Step 5: Create local.settings.json**

`backend/local.settings.json`:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureSignalRConnectionString": "",
    "AZURE_OPENAI_ENDPOINT": "",
    "AZURE_OPENAI_KEY": "",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4o",
    "AZURE_OPENAI_API_VERSION": "2024-08-01-preview"
  },
  "Host": { "CORS": "*" }
}
```

- [ ] **Step 6: Add local.settings.json to .gitignore**

Append to root `.gitignore`:
```
# Azure Functions local settings
local.settings.json
```

- [ ] **Step 7: Create .env.example**

`backend/.env.example`:
```env
AZURE_OPENAI_ENDPOINT=https://YOUR_RESOURCE.openai.azure.com/
AZURE_OPENAI_KEY=your-key-here
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AzureSignalRConnectionString=Endpoint=https://YOUR_SIGNALR.service.signalr.net;AccessKey=...;Version=1.0;
```

- [ ] **Step 8: Install backend dependencies**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend"
npm install
```

- [ ] **Step 9: Commit**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
git add backend/ .gitignore
git commit -m "feat(api): initialize Azure Functions v4 backend with TypeScript

- Azure Functions v4 project structure
- Semantic Kernel + OpenAI SDK dependencies
- SheetJS for Excel artifact generation
- local.settings.json gitignored for security

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Shared Types & i18n Strings

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §5 데이터 모델, [`CLAUDE.md`](../../CLAUDE.md) §Language & i18n Policy

**Files:**
- Create: `shared/types.ts`
- Create: `frontend/src/constants/strings.ts`
- Create: `frontend/src/types/index.ts`
- Create: `backend/src/models/index.ts`

- [ ] **Step 1: Create shared types**

`shared/types.ts`:
```typescript
// Shared types between frontend and backend
// Ref: docs/TECH_SPEC.md §5

export type AgentRole = "coo" | "cfo" | "cmo" | "cto" | "cdo" | "clo";
export type SenderType = "human" | "agent";
export type MeetingPhase = "idle" | "opening" | "briefing" | "discussion" | "decision" | "action" | "closing";
export type ParticipantStatus = "online" | "away" | "busy" | "typing";
export type ArtifactType = "excel" | "markdown" | "image";
export type QuickActionType = "agree" | "disagree" | "next" | "hold";

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderType: SenderType;
  senderName: string;
  senderRole: string;
  content: string;
  artifacts?: Artifact[];
  replyTo?: string;
  timestamp: string;
  isVoiceInput?: boolean;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface Participant {
  id: string;
  name: string;
  type: SenderType;
  role: string;
  status: ParticipantStatus;
  avatar: string;
  inspiredBy?: string;
}

export interface Room {
  id: string;
  name: string;
  type: "meeting" | "channel" | "dm";
  participants: Participant[];
  phase: MeetingPhase;
  createdAt: string;
}

export interface Decision {
  id: string;
  description: string;
  decidedBy: string;
  timestamp: string;
  relatedAgendaItem: number;
}

export interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  deadline?: string;
  status: "pending" | "in_progress" | "done";
}

export interface AgentTypingEvent {
  agentId: string;
  agentName: string;
  isTyping: boolean;
}

export interface PhaseChangedEvent {
  phase: MeetingPhase;
  agendaItem?: string;
}
```

- [ ] **Step 2: Create i18n strings (ko)**

`frontend/src/constants/strings.ts`:
```typescript
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
} as const;
```

- [ ] **Step 3: Create frontend types (re-export shared)**

`frontend/src/types/index.ts`:
```typescript
// Re-export shared types for frontend use
export type {
  AgentRole,
  SenderType,
  MeetingPhase,
  ParticipantStatus,
  ArtifactType,
  QuickActionType,
  Message,
  Artifact,
  Participant,
  Room,
  Decision,
  ActionItem,
  AgentTypingEvent,
  PhaseChangedEvent,
} from "../../shared/types";
```

- [ ] **Step 4: Create backend models (re-export shared)**

`backend/src/models/index.ts`:
```typescript
// Re-export shared types for backend use
export type {
  AgentRole,
  SenderType,
  MeetingPhase,
  ParticipantStatus,
  ArtifactType,
  QuickActionType,
  Message,
  Artifact,
  Participant,
  Room,
  Decision,
  ActionItem,
  AgentTypingEvent,
  PhaseChangedEvent,
} from "../../../shared/types";
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npx tsc --noEmit
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend" && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
git add shared/ frontend/src/constants/ frontend/src/types/ backend/src/models/
git commit -m "feat(i18n): add shared types and Korean UI strings

- Shared TypeScript interfaces for Message, Room, Participant, etc.
- Centralized Korean strings (S.meeting, S.agents, S.input, etc.)
- No hardcoded UI strings per CLAUDE.md i18n policy

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: ESLint + Prettier 설정

> **Ref:** [`CLAUDE.md`](../../CLAUDE.md) §Lint & Format

**Files:**
- Create: `frontend/.eslintrc.cjs`
- Create: `frontend/.prettierrc`
- Create: `backend/.eslintrc.cjs`
- Create: `backend/.prettierrc`

- [ ] **Step 1: Install linting deps (frontend)**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend"
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh prettier eslint-config-prettier
```

- [ ] **Step 2: Install linting deps (backend)**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend"
npm install -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

- [ ] **Step 3: Create shared Prettier config**

Both `frontend/.prettierrc` and `backend/.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 4: Run lint + format**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npx prettier --write src/
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend" && npx prettier --write src/
```

- [ ] **Step 5: Commit**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom"
git add frontend/.eslintrc.cjs frontend/.prettierrc backend/.eslintrc.cjs backend/.prettierrc frontend/package.json frontend/package-lock.json backend/package.json backend/package-lock.json
git commit -m "chore(infra): configure ESLint + Prettier for frontend and backend

- TypeScript-ESLint with strict rules
- Prettier: double quotes, semicolons, trailing commas
- React hooks + refresh ESLint plugins

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Frontend Core UI Components

### Task 5: App Shell — 3-Column Layout

> **Ref:** [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) §4 레이아웃, [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 컴포넌트 아키텍처

**Files:**
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create AppShell layout**

`frontend/src/components/layout/AppShell.tsx`:
```typescript
import { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  main: ReactNode;
  artifact?: ReactNode;
}

export function AppShell({ sidebar, main, artifact }: AppShellProps) {
  return (
    <div className="h-screen flex bg-neutral-900 text-neutral-100 overflow-hidden">
      {/* Sidebar — 260px fixed */}
      <aside className="w-[260px] flex-shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col">
        {sidebar}
      </aside>

      {/* Main chat area — flexible */}
      <main className="flex-1 flex flex-col min-w-0">
        {main}
      </main>

      {/* Artifact panel — 400px, conditional */}
      {artifact && (
        <aside className="w-[400px] flex-shrink-0 bg-neutral-950 border-l border-neutral-800 flex flex-col">
          {artifact}
        </aside>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Sidebar**

`frontend/src/components/layout/Sidebar.tsx`:
```typescript
import { S } from "../../constants/strings";
import type { Participant } from "../../types";

interface SidebarProps {
  participants: Participant[];
  roomName: string;
}

const AGENT_ICONS: Record<string, string> = {
  coo: "📋",
  cfo: "💰",
  cmo: "📣",
};

export function Sidebar({ participants, roomName }: SidebarProps) {
  const agents = participants.filter((p) => p.type === "agent");
  const humans = participants.filter((p) => p.type === "human");

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <h1 className="text-lg font-bold">{S.app.name}</h1>
        <p className="text-xs text-neutral-400 mt-0.5">{S.app.tagline}</p>
      </div>

      {/* Room name */}
      <div className="p-3">
        <div className="px-3 py-2 rounded-lg bg-neutral-800/50 text-sm font-medium">
          # {roomName}
        </div>
      </div>

      {/* AI Agents */}
      <div className="px-4 mt-2">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          {S.sidebar.agents}
        </h3>
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-800/50">
            <span>{AGENT_ICONS[agent.role] ?? "🤖"}</span>
            <span className="text-sm">{agent.name}</span>
            <span className="text-xs text-neutral-500 ml-auto">{agent.role.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* Human participants */}
      <div className="px-4 mt-4">
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          {S.sidebar.humans}
        </h3>
        {humans.map((human) => (
          <div key={human.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-800/50">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">{human.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Update App.tsx with shell**

```typescript
import { AppShell } from "./components/layout/AppShell";
import { Sidebar } from "./components/layout/Sidebar";
import type { Participant } from "./types";

const MOCK_PARTICIPANTS: Participant[] = [
  { id: "agent-coo", name: "Hudson", type: "agent", role: "coo", status: "online", avatar: "📋" },
  { id: "agent-cfo", name: "Amelia", type: "agent", role: "cfo", status: "online", avatar: "💰" },
  { id: "agent-cmo", name: "Yusef", type: "agent", role: "cmo", status: "online", avatar: "📣" },
  { id: "user-1", name: "Chairman", type: "human", role: "chairman", status: "online", avatar: "" },
];

function App() {
  return (
    <AppShell
      sidebar={<Sidebar participants={MOCK_PARTICIPANTS} roomName="임원회의" />}
      main={
        <div className="flex-1 flex items-center justify-center text-neutral-500">
          채팅 영역
        </div>
      }
    />
  );
}

export default App;
```

- [ ] **Step 4: Verify layout renders**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npm run dev
```
Expected: Dark 3-column layout with sidebar showing agents and participant.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat(ui): add AppShell 3-column layout with Sidebar

- Sidebar: BizRoom.ai header, room name, agent list, human list
- AppShell: 260px sidebar + flexible main + optional 400px artifact panel
- Dark theme matching Fluent 2 design system
- Mock participants for development

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: ChatRoom + MessageBubble + TypingIndicator

> **Ref:** [`docs/DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) §5 컴포넌트, [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 ChatRoom/MessageBubble

**Files:**
- Create: `frontend/src/components/chat/ChatRoom.tsx`
- Create: `frontend/src/components/chat/MessageBubble.tsx`
- Create: `frontend/src/components/chat/AgentAvatar.tsx`
- Create: `frontend/src/components/chat/TypingIndicator.tsx`

- [ ] **Step 1: Create AgentAvatar**

`frontend/src/components/chat/AgentAvatar.tsx`:
```typescript
import type { ParticipantStatus } from "../../types";

interface AgentAvatarProps {
  icon: string;
  name: string;
  status: ParticipantStatus;
}

const STATUS_COLORS: Record<ParticipantStatus, string> = {
  online: "bg-green-500",
  typing: "bg-yellow-500 animate-pulse",
  busy: "bg-red-500",
  away: "bg-neutral-500",
};

export function AgentAvatar({ icon, name, status }: AgentAvatarProps) {
  return (
    <div className="relative flex-shrink-0">
      <div className="w-9 h-9 rounded-lg bg-neutral-700 flex items-center justify-center text-lg" title={name}>
        {icon}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${STATUS_COLORS[status]}`}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create MessageBubble**

`frontend/src/components/chat/MessageBubble.tsx`:
```typescript
import type { Message } from "../../types";
import { AgentAvatar } from "./AgentAvatar";

interface MessageBubbleProps {
  message: Message;
}

const AGENT_ICONS: Record<string, string> = {
  coo: "📋", cfo: "💰", cmo: "📣", cto: "🛠️", cdo: "🎨", clo: "⚖️",
};

const AGENT_COLORS: Record<string, string> = {
  coo: "border-l-blue-500",
  cfo: "border-l-emerald-500",
  cmo: "border-l-orange-500",
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAgent = message.senderType === "agent";
  const icon = AGENT_ICONS[message.senderRole] ?? "👤";
  const borderColor = isAgent ? (AGENT_COLORS[message.senderRole] ?? "border-l-neutral-500") : "";

  return (
    <div className={`flex gap-3 px-4 py-2 hover:bg-neutral-800/30 ${isAgent ? "items-start" : "items-start flex-row-reverse"}`}>
      {isAgent ? (
        <AgentAvatar icon={icon} name={message.senderName} status="online" />
      ) : (
        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {message.senderName.charAt(0)}
        </div>
      )}

      <div className={`max-w-[70%] ${isAgent ? "" : "text-right"}`}>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold">{message.senderName}</span>
          {isAgent && (
            <span className="text-xs text-neutral-500 uppercase">{message.senderRole}</span>
          )}
          <span className="text-xs text-neutral-600">
            {new Date(message.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className={`text-sm text-neutral-200 leading-relaxed ${isAgent ? `border-l-2 ${borderColor} pl-3` : ""}`}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TypingIndicator**

`frontend/src/components/chat/TypingIndicator.tsx`:
```typescript
import { S } from "../../constants/strings";

interface TypingIndicatorProps {
  typingAgents: string[];
}

export function TypingIndicator({ typingAgents }: TypingIndicatorProps) {
  if (typingAgents.length === 0) return null;

  const text = typingAgents.length === 1
    ? S.typing.single(typingAgents[0])
    : S.typing.multiple(typingAgents);

  return (
    <div className="px-4 py-2 text-xs text-neutral-400 flex items-center gap-2">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:300ms]" />
      </span>
      {text}
    </div>
  );
}
```

- [ ] **Step 4: Create ChatRoom**

`frontend/src/components/chat/ChatRoom.tsx`:
```typescript
import { useEffect, useRef } from "react";
import type { Message } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface ChatRoomProps {
  messages: Message[];
  typingAgents: string[];
}

export function ChatRoom({ messages, typingAgents }: ChatRoomProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingAgents.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="py-4 space-y-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <TypingIndicator typingAgents={typingAgents} />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire ChatRoom into App.tsx with mock messages**

Add mock messages array and render `<ChatRoom>` in the main slot.

- [ ] **Step 6: Verify chat renders**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npm run dev
```
Expected: Chat messages displayed with agent avatars, colors, timestamps.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/
git commit -m "feat(chat): add ChatRoom, MessageBubble, AgentAvatar, TypingIndicator

- Agent messages: left-aligned with role icon, color-coded border
- Human messages: right-aligned with initial avatar
- Auto-scroll on new messages
- Animated typing indicator with agent names

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: InputArea + QuickActions + MeetingBanner

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 InputArea/QuickActions/MeetingBanner

**Files:**
- Create: `frontend/src/components/input/InputArea.tsx`
- Create: `frontend/src/components/input/QuickActions.tsx`
- Create: `frontend/src/components/meeting/MeetingBanner.tsx`

- [ ] **Step 1: Create InputArea**

`frontend/src/components/input/InputArea.tsx`:
```typescript
import { useState, KeyboardEvent } from "react";
import { S } from "../../constants/strings";

interface InputAreaProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-neutral-800 p-4">
      <div className="flex items-end gap-2 bg-neutral-800 rounded-xl px-4 py-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={S.input.placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-500 resize-none outline-none max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {S.input.send}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create QuickActions**

`frontend/src/components/input/QuickActions.tsx`:
```typescript
import { S } from "../../constants/strings";
import type { QuickActionType } from "../../types";

interface QuickActionsProps {
  onAction: (action: QuickActionType) => void;
  disabled?: boolean;
}

const ACTIONS: { type: QuickActionType; icon: string; label: string }[] = [
  { type: "agree", icon: "👍", label: S.quickActions.agree },
  { type: "disagree", icon: "👎", label: S.quickActions.disagree },
  { type: "next", icon: "⏭️", label: S.quickActions.next },
  { type: "hold", icon: "🛑", label: S.quickActions.hold },
];

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  return (
    <div className="flex gap-2 px-4 pb-2">
      {ACTIONS.map((action) => (
        <button
          key={action.type}
          onClick={() => onAction(action.type)}
          disabled={disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-sm transition-colors"
          title={action.label}
        >
          <span>{action.icon}</span>
          <span className="text-neutral-300">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create MeetingBanner**

`frontend/src/components/meeting/MeetingBanner.tsx`:
```typescript
import { S } from "../../constants/strings";
import type { MeetingPhase } from "../../types";

interface MeetingBannerProps {
  phase: MeetingPhase;
  agenda?: string;
}

const PHASES: MeetingPhase[] = ["opening", "briefing", "discussion", "decision", "action", "closing"];

export function MeetingBanner({ phase, agenda }: MeetingBannerProps) {
  if (phase === "idle") return null;

  const currentIndex = PHASES.indexOf(phase);
  const progress = ((currentIndex + 1) / PHASES.length) * 100;

  return (
    <div className="border-b border-neutral-800 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium">
            {S.meeting.phase[phase]}
          </span>
        </div>
        {agenda && <span className="text-xs text-neutral-400">{agenda}</span>}
      </div>
      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate all into App.tsx**

Wire MeetingBanner, ChatRoom, QuickActions, InputArea into AppShell main slot.

- [ ] **Step 5: Verify full UI renders**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npm run dev
```
Expected: Complete chat UI — sidebar, banner, messages, quick actions, input area.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/input/ frontend/src/components/meeting/ frontend/src/App.tsx
git commit -m "feat(ui): add InputArea, QuickActions, MeetingBanner components

- InputArea: textarea with Enter-to-send, auto-resize
- QuickActions: agree/disagree/next/hold buttons
- MeetingBanner: phase progress bar with live indicator
- All strings from centralized S constants

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: MeetingContext — Global State Management

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 상태 관리 구조

**Files:**
- Create: `frontend/src/context/MeetingContext.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create MeetingContext with useReducer**

`frontend/src/context/MeetingContext.tsx`:
```typescript
import { createContext, useContext, useReducer, ReactNode, Dispatch } from "react";
import type { Message, Participant, MeetingPhase, Artifact } from "../types";

interface MeetingState {
  roomId: string;
  roomName: string;
  messages: Message[];
  participants: Participant[];
  meetingPhase: MeetingPhase;
  typingAgents: string[];
  artifacts: Artifact[];
  isRecording: boolean;
}

type MeetingAction =
  | { type: "ADD_MESSAGE"; payload: Message }
  | { type: "SET_MESSAGES"; payload: Message[] }
  | { type: "SET_TYPING"; payload: { agentName: string; isTyping: boolean } }
  | { type: "SET_PHASE"; payload: MeetingPhase }
  | { type: "ADD_ARTIFACT"; payload: Artifact }
  | { type: "SET_RECORDING"; payload: boolean }
  | { type: "SET_PARTICIPANTS"; payload: Participant[] };

const initialState: MeetingState = {
  roomId: "room-default",
  roomName: "임원회의",
  messages: [],
  participants: [],
  meetingPhase: "idle",
  typingAgents: [],
  artifacts: [],
  isRecording: false,
};

function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "SET_TYPING": {
      const { agentName, isTyping } = action.payload;
      const typingAgents = isTyping
        ? [...state.typingAgents.filter((n) => n !== agentName), agentName]
        : state.typingAgents.filter((n) => n !== agentName);
      return { ...state, typingAgents };
    }
    case "SET_PHASE":
      return { ...state, meetingPhase: action.payload };
    case "ADD_ARTIFACT":
      return { ...state, artifacts: [...state.artifacts, action.payload] };
    case "SET_RECORDING":
      return { ...state, isRecording: action.payload };
    case "SET_PARTICIPANTS":
      return { ...state, participants: action.payload };
    default:
      return state;
  }
}

const MeetingStateContext = createContext<MeetingState>(initialState);
const MeetingDispatchContext = createContext<Dispatch<MeetingAction>>(() => {});

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(meetingReducer, initialState);
  return (
    <MeetingStateContext.Provider value={state}>
      <MeetingDispatchContext.Provider value={dispatch}>
        {children}
      </MeetingDispatchContext.Provider>
    </MeetingStateContext.Provider>
  );
}

export function useMeetingState() {
  return useContext(MeetingStateContext);
}

export function useMeetingDispatch() {
  return useContext(MeetingDispatchContext);
}
```

- [ ] **Step 2: Wrap App with MeetingProvider, refactor to use context**

- [ ] **Step 3: Verify state flows correctly**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/ frontend/src/App.tsx
git commit -m "feat(ui): add MeetingContext global state with useReducer

- MeetingProvider wraps app with shared state
- Actions: ADD_MESSAGE, SET_TYPING, SET_PHASE, ADD_ARTIFACT
- useMeetingState/useMeetingDispatch hooks for access

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Backend — Agent Layer & API

### Task 9: Agent System Prompts (3-Layer Architecture)

> **Ref:** [`docs/PROMPT_ENGINEERING_ANALYSIS.md`](../PROMPT_ENGINEERING_ANALYSIS.md) §3 아키텍처, [`docs/AGENT_DESIGN.md`](../AGENT_DESIGN.md) §2, [`docs/PERSONA_SOURCES.md`](../PERSONA_SOURCES.md)

**Files:**
- Create: `backend/src/agents/prompts/common.ts`
- Create: `backend/src/agents/prompts/coo-hudson.ts`
- Create: `backend/src/agents/prompts/cfo-amelia.ts`
- Create: `backend/src/agents/prompts/cmo-yusef.ts`

- [ ] **Step 1: Create common base prompt layer (~500 tokens)**

`backend/src/agents/prompts/common.ts` — shared identity, BizRoom rules, response format, safety guardrails. All agents share this base.

- [ ] **Step 2: Create COO Hudson prompt (~600 tokens)**

`backend/src/agents/prompts/coo-hudson.ts` — role-specific layer. Meeting orchestrator, action items, structured summaries. Inspired by Judson Althoff's execution-first philosophy. Ref: `docs/PERSONA_SOURCES.md` Althoff quotes.

- [ ] **Step 3: Create CFO Amelia prompt (~600 tokens)**

`backend/src/agents/prompts/cfo-amelia.ts` — financial analysis, data-driven, conservative risk. Inspired by Amy Hood's fiscal discipline. Ref: `docs/PERSONA_SOURCES.md` Hood quotes.

- [ ] **Step 4: Create CMO Yusef prompt (~600 tokens)**

`backend/src/agents/prompts/cmo-yusef.ts` — marketing strategy, AI-first, customer-centric. Inspired by Yusuf Mehdi's consumer vision. Ref: `docs/PERSONA_SOURCES.md` Mehdi quotes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/prompts/
git commit -m "feat(agent): add 3-layer system prompts for COO, CFO, CMO

- Common base: BizRoom identity, response rules, safety guardrails
- COO Hudson: execution-focused, meeting orchestration (Althoff-inspired)
- CFO Amelia: data-driven, fiscal discipline (Hood-inspired)
- CMO Yusef: AI-first marketing, customer-centric (Mehdi-inspired)
- ~1,500 tokens per agent (base + role-specific + dynamic)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: AgentFactory + Model Router

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §4 에이전트 생성 패턴, §Model Router

**Files:**
- Create: `backend/src/agents/AgentFactory.ts`
- Create: `backend/src/agents/agentConfigs.ts`
- Create: `backend/src/services/ModelRouter.ts`

- [ ] **Step 1: Create ModelRouter**

`backend/src/services/ModelRouter.ts` — task-based model selection: chat→gpt-4o-mini, artifact→gpt-4o, research→gpt-4o. Per `docs/TECH_SPEC.md` §Model Router.

- [ ] **Step 2: Create agentConfigs**

`backend/src/agents/agentConfigs.ts` — map of AgentRole → { name, systemPrompt, plugins }.

- [ ] **Step 3: Create AgentFactory**

`backend/src/agents/AgentFactory.ts` — creates Semantic Kernel ChatCompletionAgent per role. Uses OpenAI SDK with Azure endpoint.

- [ ] **Step 4: Write test for AgentFactory**

`backend/src/__tests__/AgentFactory.test.ts` — verify agent creation returns correct name/role.

- [ ] **Step 5: Run test**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend" && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/agents/ backend/src/services/ModelRouter.ts backend/src/__tests__/
git commit -m "feat(agent): add AgentFactory, agent configs, and ModelRouter

- AgentFactory creates SK agents per role with system prompts
- ModelRouter selects gpt-4o-mini for chat, gpt-4o for artifacts
- Agent configs map: role → name + prompt + plugins

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Azure Functions — negotiate + message endpoints

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §2 API 엔드포인트, §8 API 계약

**Files:**
- Create: `backend/src/functions/negotiate.ts`
- Create: `backend/src/functions/message.ts`
- Create: `backend/src/services/SignalRService.ts`

- [ ] **Step 1: Create SignalR negotiate function**

`backend/src/functions/negotiate.ts` — Azure Functions SignalR input binding for connection negotiation. Per `docs/TECH_SPEC.md` §POST /api/negotiate.

- [ ] **Step 2: Create SignalRService**

`backend/src/services/SignalRService.ts` — wraps SignalR output binding to send messages to room groups.

- [ ] **Step 3: Create message handler function**

`backend/src/functions/message.ts` — receives user message via POST, triggers orchestrator, streams agent responses via SignalR. Per `docs/TECH_SPEC.md` §POST /api/message and §6 메시지 처리 파이프라인.

- [ ] **Step 4: Commit**

```bash
git add backend/src/functions/ backend/src/services/SignalRService.ts
git commit -m "feat(api): add negotiate and message Azure Function endpoints

- /api/negotiate: SignalR connection negotiation
- /api/message: user message → orchestrator → agent responses via SignalR
- SignalRService: room-scoped message broadcasting

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Meeting Start/End Functions

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §8 API 계약 — POST /api/meeting/start, /api/meeting/end

**Files:**
- Create: `backend/src/functions/meetingStart.ts`
- Create: `backend/src/functions/meetingEnd.ts`

- [ ] **Step 1: Create meetingStart function**

Initializes meeting session, sets phase to "opening", returns agent list.

- [ ] **Step 2: Create meetingEnd function**

Triggers COO summary generation, returns decisions + action items.

- [ ] **Step 3: Commit**

```bash
git add backend/src/functions/meetingStart.ts backend/src/functions/meetingEnd.ts
git commit -m "feat(api): add meeting start/end Azure Function endpoints

- /api/meeting/start: initialize session, set phase to opening
- /api/meeting/end: trigger COO summary, return decisions + action items

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Orchestration & Real-time Communication

### Task 13: TopicClassifier

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §3.1 Turn Manager — 주제 분류

**Files:**
- Create: `backend/src/orchestrator/TopicClassifier.ts`
- Create: `backend/src/__tests__/TopicClassifier.test.ts`

- [ ] **Step 1: Write failing test**

Test that "마케팅 예산 늘리자" → "marketing", "서버 아키텍처" → "tech", "계약서 검토" → "legal".

- [ ] **Step 2: Implement TopicClassifier**

Keyword-based classifier with fallback to "general". Maps message content to topic → primary/secondary agents. Per `docs/TECH_SPEC.md` §3.1 에이전트-주제 매핑 table.

- [ ] **Step 3: Run test, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(orchestr): add TopicClassifier for message → agent routing

- Keyword-based topic classification (finance, marketing, tech, etc.)
- Maps topics to primary/secondary agent roles
- Fallback to 'general' topic (COO primary)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: ContextBroker

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §3.3 Context Broker

**Files:**
- Create: `backend/src/orchestrator/ContextBroker.ts`

- [ ] **Step 1: Implement ContextBroker**

Maintains SharedContext per room: recent messages (max 50), decisions, action items, agenda, phase. Provides `getContextForAgent(role)` slice. Per `docs/TECH_SPEC.md` §3.3.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(orchestr): add ContextBroker for shared meeting state

- Maintains recent messages (MAX_CONTEXT_MESSAGES=50)
- Tracks decisions, action items, agenda, phase per room
- getContextForAgent() provides role-filtered context slice

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 15: SnippetManager (Meeting Phases)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §3.2 Snippet Manager

**Files:**
- Create: `backend/src/orchestrator/SnippetManager.ts`

- [ ] **Step 1: Implement SnippetManager**

Manages phase transitions: idle→opening→briefing→discussion→decision→action→closing. Phase transition rules per `docs/TECH_SPEC.md` §3.2 canTransitionPhase. COO and Chairman can trigger transitions.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(orchestr): add SnippetManager for meeting phase transitions

- 6 phases: opening → briefing → discussion → decision → action → closing
- Chairman can transition any phase, COO has limited transitions
- Phase change emits SignalR phaseChanged event

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 16: TurnManager (DialogLab Core)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §3.1 Turn Manager, [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §Orchestration Layer

**DEEP THINK REQUIRED** — per CLAUDE.md §Deep Think Rules

**Files:**
- Create: `backend/src/orchestrator/TurnManager.ts`
- Create: `backend/src/__tests__/TurnManager.test.ts`

- [ ] **Step 1: Deep Think — read official docs**

Read Semantic Kernel JS SDK docs (Context7 or WebFetch) for ChatCompletionAgent invocation pattern. Compare with `docs/ARCHITECTURE.md` orchestration layer.

- [ ] **Step 2: Write failing test**

Test: given a "marketing" message, TurnManager returns CMO as primary, CFO/CDO as secondary.

- [ ] **Step 3: Implement TurnManager**

Core orchestrator: receives message → updates context → classifies topic → selects agents → generates responses sequentially → checks A2A follow-ups. Priority: P0 Human > P1 COO > P2 Mentioned > P3 Relevant > P4 Others. Per `docs/TECH_SPEC.md` §3.1.

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(orchestr): add TurnManager with DialogLab turn-taking

- Message → topic classify → agent select → sequential response
- Priority queue: Human > COO > Mentioned > Relevant > Others
- A2A follow-up check after each agent response
- Integrates TopicClassifier, ContextBroker, SnippetManager

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 17: SignalR Client Hook (useSignalR)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §6 SignalR 연결 관리

**Files:**
- Create: `frontend/src/hooks/useSignalR.ts`

- [ ] **Step 1: Implement useSignalR hook**

Manages HubConnection lifecycle: connect on mount, auto-reconnect, event handlers for newMessage/agentTyping/artifactReady/phaseChanged, disconnect on unmount. Per `docs/TECH_SPEC.md` §6 SignalR 연결 관리.

- [ ] **Step 2: Wire into MeetingContext — dispatch actions on SignalR events**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(signalr): add useSignalR hook for real-time communication

- HubConnection with auto-reconnect [0, 2s, 5s, 10s, 30s]
- Event handlers: newMessage, agentTyping, artifactReady, phaseChanged
- Dispatches to MeetingContext on events
- Clean disconnect on unmount

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 18: End-to-End Integration — Frontend ↔ Backend

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/context/MeetingContext.tsx`

- [ ] **Step 1: Connect InputArea.onSend → POST /api/message**

- [ ] **Step 2: Connect QuickActions.onAction → POST /api/message with action content**

- [ ] **Step 3: Verify end-to-end flow**

```bash
# Terminal 1: Backend
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend" && npm run build && npm start

# Terminal 2: Frontend
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/frontend" && npm run dev
```
Expected: Type message → agent responses appear in chat via SignalR.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(signalr): connect frontend to backend for end-to-end messaging

- InputArea sends to POST /api/message
- SignalR receives agent responses in real-time
- Quick actions send as structured messages

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: Features — PTT, Artifacts, A2A, Polish

### Task 19: Push-to-Talk (Web Speech API)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 PushToTalk, [`docs/PRD.md`](../PRD.md) §5.2 Push-to-Talk

**Files:**
- Create: `frontend/src/hooks/usePushToTalk.ts`
- Create: `frontend/src/components/input/PushToTalk.tsx`
- Modify: `frontend/src/components/input/InputArea.tsx`

- [ ] **Step 1: Create usePushToTalk hook**

Space-bar hold → start SpeechRecognition (ko-KR), release → stop → return transcript. State: idle/recording/processing. Per `docs/TECH_SPEC.md` §1 PushToTalk.

- [ ] **Step 2: Create PushToTalk component**

Visual mic indicator with red pulse animation during recording.

- [ ] **Step 3: Integrate into InputArea**

Add PTT toggle button. When PTT active, space-bar triggers recording instead of scroll.

- [ ] **Step 4: Verify voice input works**

Expected: Hold space → speak → release → text appears in input → send.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ptt): add Push-to-Talk voice input with Web Speech API

- Space-bar hold to record, release to transcribe
- SpeechRecognition with ko-KR and en-US support
- Visual recording indicator with pulse animation
- Transcribed text auto-fills input area

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 20: Artifact Generation — Meeting Minutes (COO)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §4 Excel 생성 플러그인, [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) F-06

**Files:**
- Create: `backend/src/plugins/MeetingMinutesPlugin.ts`
- Create: `backend/src/services/ArtifactService.ts`

- [ ] **Step 1: Create ArtifactService**

Handles artifact storage (in-memory for MVP, later Azure Blob).

- [ ] **Step 2: Create MeetingMinutesPlugin**

Generates structured markdown meeting minutes from ContextBroker data: participants, agenda, discussions, decisions, action items.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(artifact): add meeting minutes generation plugin for COO

- MeetingMinutesPlugin generates structured Markdown from meeting context
- ArtifactService manages artifact storage and retrieval
- Minutes include: participants, agenda, discussions, decisions, action items

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 21: Artifact Generation — Excel (CFO)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §4 Excel 생성 플러그인, [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) F-07

**Files:**
- Create: `backend/src/plugins/ExcelPlugin.ts`

- [ ] **Step 1: Create ExcelPlugin**

Uses SheetJS (xlsx) to generate .xlsx files. Budget comparison, financial report templates. Per `docs/TECH_SPEC.md` §4 ExcelPlugin.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(artifact): add Excel generation plugin for CFO

- ExcelPlugin generates .xlsx with SheetJS
- Budget comparison and financial report templates
- Multi-sheet workbook support (summary + details)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 22: ArtifactPreview Component

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §1 ArtifactPreview

**Files:**
- Create: `frontend/src/components/artifact/ArtifactPreview.tsx`
- Modify: `frontend/src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Create ArtifactPreview**

Inline card showing artifact name, type icon, download button. Renders inside MessageBubble when message has artifacts.

- [ ] **Step 2: Add artifact rendering to MessageBubble**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(artifact): add ArtifactPreview inline card in chat messages

- Artifact card with type icon, filename, download button
- Renders inside MessageBubble for messages with artifacts
- Supports excel, markdown artifact types

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 23: Agent-to-Agent Interaction (A2A)

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §3.1 A2A 로직, [`docs/PRD.md`](../PRD.md) §6.3 상호작용 매트릭스

**Files:**
- Modify: `backend/src/orchestrator/TurnManager.ts`
- Create: `backend/src/__tests__/A2A.test.ts`

- [ ] **Step 1: Write failing test**

Test: CMO proposes budget → CFO auto-responds with cost analysis.

- [ ] **Step 2: Implement checkFollowUp in TurnManager**

After each agent response, check if another agent should react: financial content → CFO verify, legal risk → CLO review, tech claims → CTO assess, budget exceed → CFO warn. Per `docs/TECH_SPEC.md` §3.1 checkFollowUp.

- [ ] **Step 3: Run test, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(orchestr): add A2A agent-to-agent follow-up interactions

- checkFollowUp: auto-trigger agent reactions to other agents' responses
- CFO verifies financial claims, CLO reviews legal risks
- CTO assesses tech feasibility, COO coordinates
- Max 2 follow-up rounds to prevent infinite loops

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 6: Polish, Deploy, Demo

### Task 23-B: Artifact Download Endpoint + Tests for Plugins

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §8 GET /api/artifacts/:id

**Files:**
- Create: `backend/src/functions/artifactDownload.ts`
- Create: `backend/src/__tests__/ExcelPlugin.test.ts`
- Create: `backend/src/__tests__/MeetingMinutesPlugin.test.ts`
- Create: `backend/src/__tests__/ContextBroker.test.ts`
- Create: `backend/src/__tests__/SnippetManager.test.ts`

- [ ] **Step 1: Create artifact download endpoint**

`backend/src/functions/artifactDownload.ts` — GET /api/artifacts/:id, returns file from ArtifactService with correct Content-Type and Content-Disposition headers.

- [ ] **Step 2: Write test for ExcelPlugin**

`backend/src/__tests__/ExcelPlugin.test.ts` — verify .xlsx buffer is generated with correct sheets.

- [ ] **Step 3: Write test for MeetingMinutesPlugin**

`backend/src/__tests__/MeetingMinutesPlugin.test.ts` — verify markdown output contains participants, decisions, action items.

- [ ] **Step 4: Write test for ContextBroker**

`backend/src/__tests__/ContextBroker.test.ts` — verify message buffer cap (50), decision recording, context slice.

- [ ] **Step 5: Write test for SnippetManager**

`backend/src/__tests__/SnippetManager.test.ts` — verify phase transitions, permission checks (chairman vs COO).

- [ ] **Step 6: Run all tests**

```bash
cd "E:/■  Maestiq/Microsoft hackathon/BizRoom/backend" && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(api): add artifact download endpoint and missing tests

- GET /api/artifacts/:id with Content-Disposition for download
- Tests: ExcelPlugin, MeetingMinutesPlugin, ContextBroker, SnippetManager
- TDD compliance for all orchestrator and plugin components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 23-C: Room Join/Leave + @Mention Parsing

> **Ref:** [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §8 POST /api/room/join, /api/room/leave, [`docs/PRD.md`](../PRD.md) US-005

**Files:**
- Create: `backend/src/functions/roomJoin.ts`
- Create: `backend/src/functions/roomLeave.ts`
- Modify: `backend/src/orchestrator/TopicClassifier.ts`

- [ ] **Step 1: Create roomJoin function**

POST /api/room/join — adds user to SignalR group, returns room info. Per `docs/TECH_SPEC.md` §8.

- [ ] **Step 2: Create roomLeave function**

POST /api/room/leave — removes user from SignalR group.

- [ ] **Step 3: Add @mention parsing to TopicClassifier**

Parse `@COO`, `@CFO`, `@CMO` from message content → force that agent as primary responder regardless of topic classification.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(api): add room join/leave endpoints and @mention parsing

- POST /api/room/join: add user to SignalR group
- POST /api/room/leave: remove user from SignalR group
- @mention parsing: @COO/@CFO/@CMO forces agent as primary responder

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 24: Error Handling + Loading States

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/chat/ChatRoom.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

`frontend/src/components/ErrorBoundary.tsx` — React class component catching render errors, showing friendly fallback UI.

- [ ] **Step 2: Add loading skeleton to ChatRoom**

Show animated skeleton pulses while messages are loading.

- [ ] **Step 3: Add SignalR connection status to Sidebar**

Show 🟢 Connected / 🔴 Disconnected / 🟡 Reconnecting indicator.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ui): add error boundaries, loading skeletons, connection status

- ErrorBoundary wraps App with friendly fallback
- Chat skeleton animation during initial load
- SignalR connection status indicator in sidebar header

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 25: Azure Resource Provisioning + Deployment

> **Ref:** [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) F-09, [`docs/TECH_SPEC.md`](../TECH_SPEC.md) §7 Azure 리소스

**Files:**
- Create: `staticwebapp.config.json`
- Create: `infra/provision.sh`

- [ ] **Step 1: Provision Azure resources**

```bash
# Resource Group
az group create --name rg-bizroom --location koreacentral

# Azure OpenAI (GPT-4o)
az cognitiveservices account create --name bizroom-openai --resource-group rg-bizroom --kind OpenAI --sku S0 --location eastus2

# Azure SignalR Service
az signalr create --name bizroom-signalr --resource-group rg-bizroom --sku Free_F1 --service-mode Serverless

# Azure Static Web Apps (via GitHub or CLI)
az staticwebapp create --name bizroom-app --resource-group rg-bizroom --source https://github.com/DHxWhy/BizRoom --branch main --app-location "/frontend" --api-location "/backend" --output-location "dist"
```

- [ ] **Step 2: Create Static Web App config**

`staticwebapp.config.json` — route fallback to index.html, API proxy to /api/*.

- [ ] **Step 3: Create provision script**

`infra/provision.sh` — above az commands wrapped in a script for reproducibility.

- [ ] **Step 4: Configure backend environment variables in Azure**

Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AzureSignalRConnectionString in Azure Functions app settings.

- [ ] **Step 5: Commit**

```bash
git add staticwebapp.config.json infra/
git commit -m "ci(infra): add Azure resource provisioning and SWA deployment config

- Provision script for OpenAI, SignalR, Static Web Apps
- staticwebapp.config.json with SPA fallback and API proxy
- Azure Functions production environment configuration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 26: Demo Scenario Integration Test

> **Ref:** [`docs/DEMO_SCRIPT.md`](../DEMO_SCRIPT.md), [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) §7 완료 정의

**Files:**
- Test: manual verification against DoD checklist

- [ ] **Step 1: Verify DoD checklist**

Per `docs/MVP_SCOPE.md` §7:
- [ ] Web UI에서 메시지 → 3개 에이전트 순차 응답
- [ ] 에이전트 간 상호 참조/반박 발생
- [ ] Push-to-Talk 음성 → 텍스트 전송
- [ ] 2명 이상 동시 참여 (SignalR)
- [ ] COO 회의록 생성
- [ ] CFO Excel 생성/다운로드
- [ ] Azure 배포 URL 접근 가능

- [ ] **Step 2: Run demo scenario**

Per `docs/DEMO_SCRIPT.md` flow.

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit on feat/scaffolding**

```bash
git commit -m "test: verify MVP DoD checklist and demo scenario

- All 7 must-pass criteria verified
- Demo scenario runs end-to-end successfully

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 27: README + Architecture Diagram (F-11)

> **Ref:** [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) F-11, [`docs/SUBMISSION_CHECKLIST.md`](../SUBMISSION_CHECKLIST.md)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

Include: project title, tagline, architecture diagram (ASCII from `docs/ARCHITECTURE.md` §2.1), tech stack, setup instructions, demo screenshot, team info, hackathon context.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with architecture diagram for hackathon submission

- Project overview and value proposition
- ASCII architecture diagram (5-layer system)
- Tech stack and setup instructions
- Hackathon context and demo link

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 28: Demo Video Recording (F-10)

> **Ref:** [`docs/MVP_SCOPE.md`](../MVP_SCOPE.md) F-10, [`docs/DEMO_SCRIPT.md`](../DEMO_SCRIPT.md)

- [ ] **Step 1: Prepare demo scenario**

Follow `docs/DEMO_SCRIPT.md` — rehearse full flow: login → meeting start → user question → agent sequential response → A2A interaction → artifact generation → PTT voice input → meeting end with minutes.

- [ ] **Step 2: Record 2-minute demo video**

Screen capture with narration. Upload to YouTube.

- [ ] **Step 3: Add demo link to README.md**

---

### Task 29: Merge to dev, then to main

- [ ] **Step 1: Merge feat/scaffolding → dev**

```bash
git checkout dev
git merge feat/scaffolding --no-ff -m "merge: feat/scaffolding into dev — MVP implementation complete"
git push origin dev
```

- [ ] **Step 2: Create PR dev → main**

```bash
gh pr create --base main --head dev --title "MVP: BizRoom.ai AI C-Suite Virtual Boardroom" --body "..."
```

---

## Execution Checklist — Git Flow Overview

| Task   | Branch              | Commit Scope    | Key Deliverable                      |
| ------ | ------------------- | --------------- | ------------------------------------ |
| 1      | feat/scaffolding    | feat(ui)        | Vite + React + Tailwind initialized  |
| 2      | feat/scaffolding    | feat(api)       | Azure Functions v4 initialized       |
| 3      | feat/scaffolding    | feat(i18n)      | Shared types + Korean strings        |
| 4      | feat/scaffolding    | chore(infra)    | ESLint + Prettier configured         |
| 5      | feat/scaffolding    | feat(ui)        | AppShell + Sidebar layout            |
| 6      | feat/scaffolding    | feat(chat)      | ChatRoom + MessageBubble             |
| 7      | feat/scaffolding    | feat(ui)        | InputArea + QuickActions + Banner    |
| 8      | feat/scaffolding    | feat(ui)        | MeetingContext global state          |
| 9      | feat/scaffolding    | feat(agent)     | 3-layer system prompts (COO/CFO/CMO) |
| 10     | feat/scaffolding    | feat(agent)     | AgentFactory + ModelRouter           |
| 11     | feat/scaffolding    | feat(api)       | negotiate + message endpoints        |
| 12     | feat/scaffolding    | feat(api)       | meeting start/end endpoints          |
| 13     | feat/scaffolding    | feat(orchestr)  | TopicClassifier                      |
| 14     | feat/scaffolding    | feat(orchestr)  | ContextBroker                        |
| 15     | feat/scaffolding    | feat(orchestr)  | SnippetManager                       |
| 16     | feat/scaffolding    | feat(orchestr)  | TurnManager (DialogLab core)         |
| 17     | feat/scaffolding    | feat(signalr)   | useSignalR client hook               |
| 18     | feat/scaffolding    | feat(signalr)   | E2E frontend ↔ backend              |
| 19     | feat/scaffolding    | feat(ptt)       | Push-to-Talk voice input             |
| 20     | feat/scaffolding    | feat(artifact)  | Meeting minutes (COO)                |
| 21     | feat/scaffolding    | feat(artifact)  | Excel generation (CFO)               |
| 22     | feat/scaffolding    | feat(artifact)  | ArtifactPreview component            |
| 23     | feat/scaffolding    | feat(orchestr)  | A2A follow-up interactions           |
| 23-B   | feat/scaffolding    | feat(api)       | Artifact download + missing tests    |
| 23-C   | feat/scaffolding    | feat(api)       | Room join/leave + @mention parsing   |
| 24     | feat/scaffolding    | feat(ui)        | Error handling + loading states      |
| 25     | feat/scaffolding    | ci(infra)       | Azure provisioning + deployment      |
| 26     | feat/scaffolding    | test            | DoD verification + demo              |
| 27     | feat/scaffolding    | docs            | README + architecture diagram (F-11) |
| 28     | feat/scaffolding    | —               | Demo video recording (F-10)          |
| 29     | dev → main          | merge           | PR to main                           |
