---
version: "1.1.0"
created: "2026-03-12 18:00"
updated: "2026-03-12 18:30"
---

# Brand Memory Set — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의 전 Brand Memory를 설정하여 모든 AI 에이전트가 회사 정체성을 인지한 상태로 회의에 참여하도록 한다.

**Architecture:** 로비 UI multi-step wizard → meetingStart API에 brandMemory JSON 전달 → ContextBroker에 저장 → AgentFactory에서 Layer 0 프롬프트로 주입 (에이전트 역할 프롬프트 앞에 prepend)

**Tech Stack:** TypeScript, React, Azure Functions, ContextBroker (in-memory), AgentFactory (OpenAI client)

**Spec:** `docs/superpowers/specs/2026-03-12-brand-memory-set-design.md` v2.0

---

## File Structure

### New Files

| File                                              | Responsibility                           |
| ------------------------------------------------- | ---------------------------------------- |
| `backend/src/agents/prompts/brandMemory.ts`       | buildBrandMemoryPrompt + sanitize        |
| `frontend/src/constants/brandPresets.ts`           | Maestiq demo preset data                 |
| `frontend/src/components/lobby/BrandMemoryForm.tsx`| Brand Memory accordion form + preset btn |

### Modified Files

| File                                             | Change                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `shared/types.ts`                                | +BrandMemorySet +PricingTier +CompetitorInfo +ExternalLink, AgentContext.brandMemory |
| `backend/src/models/index.ts`                    | Re-export new types                           |
| `frontend/src/types/index.ts`                    | Re-export new types                           |
| `backend/src/orchestrator/ContextBroker.ts`      | RoomContext.brandMemory, setBrandMemory()     |
| `backend/src/agents/AgentFactory.ts`             | Layer 0 prepend in invokeAgent/invokeAgentStream |
| `backend/src/functions/meetingStart.ts`           | brandMemory in request, validate, store       |
| `backend/src/functions/message.ts`               | Read brandMemory from ContextBroker           |
| `backend/src/functions/meetingEnd.ts`             | Read brandMemory from ContextBroker           |
| `frontend/src/constants/strings.ts`              | Brand memory form strings                     |
| `frontend/src/context/MeetingContext.tsx`         | brandMemory state + SET_BRAND_MEMORY action   |
| `frontend/src/hooks/useSessionRoom.ts`           | Multi-step: separate create from enter        |
| `frontend/src/components/lobby/LobbyPage.tsx`    | Multi-step wizard flow                        |
| `frontend/src/App.tsx`                           | handleStartMeeting sends roomId+agenda+brandMemory |

---

## Chunk 1: Backend — Types, Prompt Builder, ContextBroker, AgentFactory

### Task 1: Shared Types — BrandMemorySet interfaces + AgentContext update

**Files:**
- Modify: `shared/types.ts:136-140` (AgentContext) + append new interfaces at end
- Modify: `backend/src/models/index.ts:1-31` (add re-exports)
- Modify: `frontend/src/types/index.ts:1-43` (add re-exports)

- [ ] **Step 1: Add BrandMemorySet and supporting interfaces to shared/types.ts**

Append after the existing `MeetingBroadcastEvent` type (line 285):

```typescript
// ──────────────────────────────────────────────
// Brand Memory Set — Spec §1
// ──────────────────────────────────────────────

export interface PricingTier {
  name: string;
  price: string;
  features: string;
}

export interface CompetitorInfo {
  name: string;
  weakness: string;
}

export interface ExternalLink {
  label: string;
  url: string;
}

export interface BrandMemorySet {
  // Required (3)
  companyName: string;
  industry: string;
  productName: string;
  // Basic info
  foundedDate?: string;
  founderName?: string;
  teamSize?: string;
  mission?: string;
  vision?: string;
  // Product
  productDescription?: string;
  coreFeatures?: string[];
  targetCustomer?: string;
  techStack?: string;
  revenueModel?: string;
  pricing?: PricingTier[];
  // Market
  marketSize?: string;
  marketStats?: string[];
  competitors?: CompetitorInfo[];
  differentiation?: string[];
  // Finance
  currentStage?: string;
  funding?: string;
  goals?: string;
  // Links
  links?: ExternalLink[];
  // Challenges
  challenges?: string[];
  quarterGoal?: string;
  meetingObjective?: string;
  // Brand copy
  brandCopy?: string;
  subCopy?: string;
  positioning?: string;
}
```

- [ ] **Step 2: Add brandMemory field to AgentContext**

In `shared/types.ts`, modify `AgentContext` (lines 136-140):

```typescript
export interface AgentContext {
  participants: string;
  agenda: string;
  history: string;
  brandMemory?: BrandMemorySet;
}
```

- [ ] **Step 3: Re-export new types in backend/src/models/index.ts**

Add to the re-export list:

```typescript
  BrandMemorySet,
  PricingTier,
  CompetitorInfo,
  ExternalLink,
```

- [ ] **Step 4: Re-export new types in frontend/src/types/index.ts**

Add to the re-export list:

```typescript
  BrandMemorySet,
  PricingTier,
  CompetitorInfo,
  ExternalLink,
```

- [ ] **Step 5: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts backend/src/models/index.ts frontend/src/types/index.ts
git commit -m "feat(agent): add BrandMemorySet types and AgentContext.brandMemory field

- BrandMemorySet with 3 required + 25 optional fields
- Supporting interfaces: PricingTier, CompetitorInfo, ExternalLink
- AgentContext.brandMemory optional field for Layer 0 injection

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Brand Memory Prompt Builder

**Files:**
- Create: `backend/src/agents/prompts/brandMemory.ts`

- [ ] **Step 1: Create brandMemory.ts with buildBrandMemoryPrompt and sanitizeForPrompt**

```typescript
// Brand Memory → Layer 0 prompt builder
// Ref: Spec §3.2, §3.5

import type { BrandMemorySet } from "../../models/index.js";

const BRAND_MEMORY_MAX_CHARS = 3000;

/** Strip markdown headers and excessive newlines from user input */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/^#{1,6}\s/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Helper — append a labeled line only if value exists */
function line(label: string, value?: string): string {
  return value ? `${label}: ${sanitizeForPrompt(value)}\n` : "";
}

/** Helper — render a bulleted list from an array */
function list(items?: string[]): string {
  return items?.length
    ? items.map((i) => `- ${sanitizeForPrompt(i)}`).join("\n") + "\n"
    : "";
}

/** Build Layer 0 prompt from BrandMemorySet (null-safe for all optional fields) */
export function buildBrandMemoryPrompt(bm: BrandMemorySet): string {
  const sections: string[] = [];

  // Company info (required 3 + optional)
  let s = `## 당신이 속한 회사 정보\n\n`;
  s += `회사명: ${sanitizeForPrompt(bm.companyName)}\n`;
  s += `업종: ${sanitizeForPrompt(bm.industry)}\n`;
  s += line("설립일", bm.foundedDate);
  s += line("대표", bm.founderName);
  s += line("규모", bm.teamSize);
  s += line("미션", bm.mission);
  s += line("비전", bm.vision);
  sections.push(s);

  // Product/Service
  let p = `## 제품/서비스\n\n`;
  p += `제품명: ${sanitizeForPrompt(bm.productName)}\n`;
  p += line("설명", bm.productDescription);
  if (bm.coreFeatures?.length) p += `핵심 기능:\n${list(bm.coreFeatures)}`;
  p += line("타겟 고객", bm.targetCustomer);
  p += line("기술 스택", bm.techStack);
  p += line("수익 모델", bm.revenueModel);
  if (bm.pricing?.length) {
    p += `가격:\n${bm.pricing.map((t) => `- ${sanitizeForPrompt(t.name)} (${sanitizeForPrompt(t.price)}): ${sanitizeForPrompt(t.features)}`).join("\n")}\n`;
  }
  sections.push(p);

  // Market (optional — independent gates per Spec Review Fix #3)
  if (
    bm.marketSize ||
    bm.marketStats?.length ||
    bm.competitors?.length ||
    bm.differentiation?.length
  ) {
    let m = `## 시장\n\n`;
    m += line("시장 규모", bm.marketSize);
    if (bm.marketStats?.length) m += `주요 통계:\n${list(bm.marketStats)}`;
    if (bm.competitors?.length) {
      m += `경쟁사:\n${bm.competitors.map((c) => `- ${sanitizeForPrompt(c.name)}: ${sanitizeForPrompt(c.weakness)}`).join("\n")}\n`;
    }
    if (bm.differentiation?.length) m += `차별화:\n${list(bm.differentiation)}`;
    sections.push(m);
  }

  // Finance (optional — currentStage, funding, goals)
  if (bm.currentStage || bm.funding || bm.goals) {
    let f = `## 재무 현황\n\n`;
    f += line("현재 단계", bm.currentStage);
    f += line("투자 현황", bm.funding);
    f += line("목표", bm.goals);
    sections.push(f);
  }

  // Challenges & goals (optional — meetingObjective + quarterGoal independent gates)
  if (bm.challenges?.length || bm.meetingObjective || bm.quarterGoal) {
    let c = `## 현재 도전\n\n`;
    if (bm.challenges?.length) {
      c +=
        bm.challenges
          .map((ch, i) => `${i + 1}. ${sanitizeForPrompt(ch)}`)
          .join("\n") + "\n";
    }
    c += line("분기 목표", bm.quarterGoal);
    c += line("이번 회의 목표", bm.meetingObjective);
    sections.push(c);
  }

  // Brand positioning (optional — subCopy has independent gate)
  if (bm.brandCopy || bm.subCopy || bm.positioning) {
    let b = `## 브랜드 포지셔닝\n\n`;
    if (bm.brandCopy) b += `카피: "${sanitizeForPrompt(bm.brandCopy)}"\n`;
    if (bm.subCopy) b += `서브 카피: "${sanitizeForPrompt(bm.subCopy)}"\n`;
    b += line("포지셔닝", bm.positioning);
    sections.push(b);
  }

  sections.push(
    `위 정보를 바탕으로 발언하되, 정보를 그대로 나열하지 말고 자연스럽게 맥락에 녹여서 사용하세요.`,
  );

  const result = sections.join("\n");

  // Token budget warning (no auto-truncation — demo safety)
  if (result.length > BRAND_MEMORY_MAX_CHARS) {
    console.warn(
      `[BrandMemory] Layer 0 prompt exceeds ${BRAND_MEMORY_MAX_CHARS} chars (${result.length}). Consider trimming optional fields.`,
    );
  }

  return result;
}
```

- [ ] **Step 2: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/agents/prompts/brandMemory.ts
git commit -m "feat(agent): add Brand Memory Layer 0 prompt builder

- buildBrandMemoryPrompt() converts BrandMemorySet to structured prompt
- sanitizeForPrompt() strips markdown headers + excessive newlines
- 3,000 char budget with warning-only (no truncation for demo safety)
- Null-safe for all optional fields with independent gate conditions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: ContextBroker — brandMemory storage

**Files:**
- Modify: `backend/src/orchestrator/ContextBroker.ts:1-113`

- [ ] **Step 1: Add brandMemory to RoomContext interface and getOrCreateRoom**

In `ContextBroker.ts`, add import and modify `RoomContext` (line 1, lines 19-26):

```typescript
import type { Message, MeetingPhase, BrandMemorySet } from "../models/index.js";
```

Add `brandMemory` to `RoomContext` interface:

```typescript
interface RoomContext {
  roomId: string;
  phase: MeetingPhase;
  agenda: string;
  messages: Message[];
  decisions: Decision[];
  actionItems: ActionItem[];
  brandMemory?: BrandMemorySet;
}
```

- [ ] **Step 2: Add setBrandMemory function**

Add after `setAgenda()` (after line 66):

```typescript
/** Set brand memory for a room */
export function setBrandMemory(roomId: string, brandMemory: BrandMemorySet): void {
  const room = getOrCreateRoom(roomId);
  room.brandMemory = brandMemory;
}

/** Get brand memory for a room */
export function getBrandMemory(roomId: string): BrandMemorySet | undefined {
  return getOrCreateRoom(roomId).brandMemory;
}
```

- [ ] **Step 3: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/orchestrator/ContextBroker.ts
git commit -m "feat(orchestr): add brandMemory storage to ContextBroker

- RoomContext.brandMemory optional field
- setBrandMemory() and getBrandMemory() functions
- Brand memory persists for room lifetime (in-memory)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: AgentFactory — Layer 0 injection

**Files:**
- Modify: `backend/src/agents/AgentFactory.ts:1-163`

- [ ] **Step 1: Import buildBrandMemoryPrompt**

Add import at top of `AgentFactory.ts` (after line 5):

```typescript
import { buildBrandMemoryPrompt } from "./prompts/brandMemory.js";
```

- [ ] **Step 2: Modify invokeAgent() to prepend Layer 0**

In `invokeAgent()`, after line 50 (`const systemPrompt = config.getSystemPrompt(context);`), replace with:

```typescript
    const basePrompt = config.getSystemPrompt(context);
    const brandPrefix = context.brandMemory
      ? buildBrandMemoryPrompt(context.brandMemory) + "\n\n"
      : "";
    const systemPrompt = brandPrefix + basePrompt;
```

- [ ] **Step 3: Modify invokeAgentStream() to prepend Layer 0**

In `invokeAgentStream()`, after line 131 (`const systemPrompt = config.getSystemPrompt(context);`), replace with:

```typescript
    const basePrompt = config.getSystemPrompt(context);
    const brandPrefix = context.brandMemory
      ? buildBrandMemoryPrompt(context.brandMemory) + "\n\n"
      : "";
    const systemPrompt = brandPrefix + basePrompt;
```

- [ ] **Step 4: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/AgentFactory.ts
git commit -m "feat(agent): inject Brand Memory as Layer 0 prompt prefix

- invokeAgent() prepends buildBrandMemoryPrompt() before role prompt
- invokeAgentStream() same treatment for streaming path
- No change to role prompt files (Layer 2) — Layer 0 is purely additive

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: meetingStart.ts — Accept and store brandMemory

**Files:**
- Modify: `backend/src/functions/meetingStart.ts:1-91`

- [ ] **Step 1: Add brandMemory to MeetingStartRequest and imports**

Modify the import (line 4) to include `setBrandMemory`:

```typescript
import { getOrCreateRoom, setPhase, setAgenda, addMessage, setBrandMemory } from "../orchestrator/ContextBroker.js";
```

Add import for type (after line 8):

```typescript
import type { Message, BrandMemorySet } from "../models/index.js";
```

Modify `MeetingStartRequest` interface (lines 10-15):

```typescript
interface MeetingStartRequest {
  roomId?: string;
  agenda?: string;
  userId: string;
  userName: string;
  brandMemory?: BrandMemorySet;
}
```

- [ ] **Step 2: Add validateBrandMemory function**

Add before the `meetingStart` function (before line 17):

```typescript
/** Validate brandMemory — returns cleaned object or null */
function validateBrandMemory(bm: unknown): BrandMemorySet | null {
  if (!bm || typeof bm !== "object") return null;
  const b = bm as Record<string, unknown>;
  if (typeof b.companyName !== "string" || !b.companyName.trim()) return null;
  if (typeof b.industry !== "string" || !b.industry.trim()) return null;
  if (typeof b.productName !== "string" || !b.productName.trim()) return null;
  return bm as BrandMemorySet;
}
```

- [ ] **Step 3: Store brandMemory in ContextBroker and pass to invokeAgent**

After `setAgenda(roomId, agenda);` (line 36), add:

```typescript
  // Store brand memory if provided
  const validBrandMemory = validateBrandMemory(body.brandMemory);
  if (validBrandMemory) {
    setBrandMemory(roomId, validBrandMemory);
  }
```

Modify the `invokeAgent` call context (lines 55-59) to include brandMemory:

```typescript
      {
        participants: `${body.userName} (Chairman), Hudson (COO), Amelia (CFO), Yusef (CMO)`,
        agenda,
        history: "",
        brandMemory: validBrandMemory ?? undefined,
      },
```

- [ ] **Step 4: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/functions/meetingStart.ts
git commit -m "feat(api): accept brandMemory in meetingStart and inject into agent context

- MeetingStartRequest.brandMemory optional field
- validateBrandMemory() checks 3 required string fields
- Stores in ContextBroker via setBrandMemory()
- Passes to COO opening invokeAgent() call

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: message.ts — Read brandMemory from ContextBroker

**Files:**
- Modify: `backend/src/functions/message.ts:1-184`

- [ ] **Step 1: Import getBrandMemory**

Modify import (lines 9-13):

```typescript
import {
  getContextForAgent,
  addMessage,
  getOrCreateRoom,
  getBrandMemory,
} from "../orchestrator/ContextBroker.js";
```

- [ ] **Step 2: Add brandMemory to SSE streaming agent context**

In the SSE streaming path, modify the `invokeAgentStream` call context (lines 120-125) to include brandMemory:

```typescript
            const agentStream = invokeAgentStream(
              entry.role,
              userMessage.content,
              {
                participants:
                  "Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO)",
                agenda: room.agenda || userMessage.content,
                history: contextStr,
                brandMemory: getBrandMemory(roomId),
              },
            );
```

- [ ] **Step 3: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/functions/message.ts
git commit -m "feat(api): pass brandMemory to agent context in message handler

- Read brandMemory from ContextBroker via getBrandMemory()
- Include in invokeAgentStream() context for SSE path
- Ensures all mid-meeting agent responses are brand-aware

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: meetingEnd.ts — Read brandMemory from ContextBroker

**Files:**
- Modify: `backend/src/functions/meetingEnd.ts:1-214`

- [ ] **Step 1: Import getBrandMemory**

Modify import (line 4):

```typescript
import { getOrCreateRoom, getContextForAgent, setPhase, getBrandMemory } from "../orchestrator/ContextBroker.js";
```

- [ ] **Step 2: Add brandMemory to COO closing context**

Modify the `invokeAgent` call context (lines 104-108):

```typescript
      {
        participants: "Chairman, Hudson (COO), Amelia (CFO), Yusef (CMO)",
        agenda: room.agenda || "회의 종료",
        history: historyContext,
        brandMemory: getBrandMemory(roomId),
      },
```

- [ ] **Step 3: Build check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/functions/meetingEnd.ts
git commit -m "feat(api): pass brandMemory to agent context in meetingEnd

- COO closing summary now receives brand context
- Ensures closing remarks reference company identity

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Frontend — Presets, Form, Multi-step Lobby

### Task 8: Brand Presets — Maestiq demo data

**Files:**
- Create: `frontend/src/constants/brandPresets.ts`

- [ ] **Step 1: Create brandPresets.ts with Maestiq preset**

```typescript
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
        "Azure Functions, Azure OpenAI (GPT-4o), Azure SignalR, React Three Fiber, Microsoft Graph API, Azure AI Speech",
      revenueModel: "월 구독 SaaS",
      pricing: [
        { name: "Free", price: "무료", features: "월 3회 회의, 기본 요약" },
        { name: "Pro", price: "$39/월", features: "월 30회 회의 + 산출물 생성 + OneDrive 연동" },
        { name: "Team", price: "$79/월", features: "최대 3명 참여 + 커스텀 에이전트 역할" },
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
        { name: "ChatGPT", weakness: "범용 AI, 역할 구분 없음, 텍스트 기반" },
        { name: "Microsoft Copilot", weakness: "1:1 어시스턴트 구조, 회의 기능 없음" },
        { name: "Notion AI", weakness: "문서 중심, 음성 회의 불가" },
        { name: "Fireflies.ai", weakness: "회의록 전사만, 의사결정 참여 불가" },
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/brandPresets.ts
git commit -m "feat(ui): add Maestiq brand preset for demo

- Full BrandMemorySet with company, product, market, pricing data
- createEmptyBrandMemory() helper for blank form state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Frontend Strings — Brand Memory form labels

**Files:**
- Modify: `frontend/src/constants/strings.ts:1-129`

- [ ] **Step 1: Add brandMemory section to S object**

Add after the `lobby` section (after line 101, before `overlay`):

```typescript
  brandMemory: {
    stepTitle: "회사 정보 설정",
    stepSubtitle: "AI 임원진이 회사를 이해하고 회의에 참여합니다",
    presetButton: "데모 프리셋 적용",
    presetApplied: "Maestiq 프리셋이 적용되었습니다",
    required: "필수",
    companyName: "회사명",
    industry: "업종",
    productName: "제품/서비스명",
    foundedDate: "설립일",
    founderName: "대표자",
    teamSize: "규모",
    mission: "미션",
    vision: "비전",
    productDescription: "제품 한줄 설명",
    targetCustomer: "타겟 고객",
    techStack: "기술 스택",
    revenueModel: "수익 모델",
    marketSize: "시장 규모",
    currentStage: "현재 단계",
    funding: "투자 현황",
    goals: "목표",
    brandCopy: "브랜드 카피",
    positioning: "포지셔닝",
    sectionBasic: "기본 정보",
    sectionProduct: "제품/서비스",
    sectionMarket: "시장 & 경쟁",
    sectionFinance: "재무 & 목표",
    sectionBrand: "브랜드 카피",
    next: "다음",
    back: "이전",
    skip: "건너뛰기",
  },
  agenda: {
    stepTitle: "회의 안건",
    stepSubtitle: "오늘 논의할 주제를 입력하세요",
    placeholder: "예: BizRoom.ai 해커톤 출품 전략 준비",
  },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/strings.ts
git commit -m "feat(i18n): add brand memory and agenda step strings

- Brand memory form labels (required fields, sections, actions)
- Agenda step strings for multi-step lobby flow

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: MeetingContext — brandMemory state

**Files:**
- Modify: `frontend/src/context/MeetingContext.tsx:1-277`

- [ ] **Step 1: Add BrandMemorySet import**

Modify import (line 2):

```typescript
import type { Message, Participant, MeetingPhase, MeetingMode, Artifact, AgentRole, BigScreenUpdateEvent, MonitorUpdateEvent, SophiaMessageEvent, ArtifactsReadyEvent, HumanCalloutEvent, BrandMemorySet } from "../types";
```

- [ ] **Step 2: Add brandMemory to MeetingState**

Add after `humanCallout` (line 46):

```typescript
  /** Brand memory for current meeting session */
  brandMemory: BrandMemorySet | null;
  /** Agenda set in lobby (used by handleStartMeeting in App.tsx) */
  lobbyAgenda: string;
```

- [ ] **Step 3: Add SET_BRAND_MEMORY and SET_AGENDA actions**

Add to `MeetingAction` union (after line 94):

```typescript
  | { type: "SET_BRAND_MEMORY"; payload: BrandMemorySet | null }
  | { type: "SET_LOBBY_AGENDA"; payload: string };
```

- [ ] **Step 4: Add brandMemory and lobbyAgenda to initialState**

Add after `humanCallout: null` (line 119):

```typescript
  brandMemory: null,
  lobbyAgenda: "",
```

- [ ] **Step 5: Add reducer cases**

Add before the `default` case (before line 251):

```typescript
    case "SET_BRAND_MEMORY":
      return { ...state, brandMemory: action.payload };
    case "SET_LOBBY_AGENDA":
      return { ...state, lobbyAgenda: action.payload };
```

- [ ] **Step 6: Reset brandMemory and lobbyAgenda in LEAVE_ROOM**

Add `brandMemory: null,` and `lobbyAgenda: "",` to the LEAVE_ROOM case (inside the return object around line 210).

- [ ] **Step 7: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/context/MeetingContext.tsx
git commit -m "feat(ui): add brandMemory state to MeetingContext

- MeetingState.brandMemory field (BrandMemorySet | null)
- SET_BRAND_MEMORY action for reducer
- Reset to null on LEAVE_ROOM

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: useSessionRoom — Multi-step support

**Files:**
- Modify: `frontend/src/hooks/useSessionRoom.ts:1-127`

- [ ] **Step 1: Split createRoom into prepareRoom + enterRoom**

Modify `createRoom` (lines 73-88) to only set user and room (NOT enter):

```typescript
  /** Create a new room as Chairman (sets user + room, does NOT enter yet) */
  const createRoom = useCallback(
    (userName: string) => {
      const userId = getOrCreateUserId();
      const roomId = generateRoomId();

      saveUserName(userName);
      dispatch({ type: "SET_USER", payload: { userId, userName } });
      dispatch({ type: "SET_ROOM", payload: { roomId, isChairman: true } });

      setRoomIdInUrl(roomId);

      return roomId;
    },
    [dispatch],
  );

  /** Enter the room (call after multi-step setup is complete) */
  const enterRoom = useCallback(() => {
    dispatch({ type: "ENTER_ROOM" });
  }, [dispatch]);
```

- [ ] **Step 2: Update return object**

Add `enterRoom` to the return:

```typescript
  return {
    initUser,
    createRoom,
    enterRoom,
    joinRoom,
    leaveRoom,
    getShareUrl,
    getRoomIdFromUrl,
    savedUserName,
  };
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: May show errors in LobbyPage.tsx (will fix in Task 13)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSessionRoom.ts
git commit -m "feat(ui): split createRoom into prepare + enter for multi-step lobby

- createRoom() no longer dispatches ENTER_ROOM
- New enterRoom() for explicit room entry after setup steps
- Enables name → brandMemory → agenda → enter flow

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: BrandMemoryForm Component

**Files:**
- Create: `frontend/src/components/lobby/BrandMemoryForm.tsx`

- [ ] **Step 1: Create BrandMemoryForm with preset button + required fields + accordion sections**

```typescript
import { useState, useCallback, memo } from "react";
import { S } from "../../constants/strings";
import { BRAND_PRESETS, createEmptyBrandMemory } from "../../constants/brandPresets";
import type { BrandMemorySet } from "../../types";

interface BrandMemoryFormProps {
  value: BrandMemorySet;
  onChange: (bm: BrandMemorySet) => void;
  onNext: () => void;
  onBack: () => void;
}

export const BrandMemoryForm = memo(function BrandMemoryForm({
  value,
  onChange,
  onNext,
  onBack,
}: BrandMemoryFormProps) {
  const [presetApplied, setPresetApplied] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const handlePreset = useCallback(() => {
    const preset = BRAND_PRESETS.maestiq;
    if (preset) {
      onChange(preset.data);
      setPresetApplied(true);
      setTimeout(() => setPresetApplied(false), 2000);
    }
  }, [onChange]);

  const updateField = useCallback(
    <K extends keyof BrandMemorySet>(key: K, val: BrandMemorySet[K]) => {
      onChange({ ...value, [key]: val });
    },
    [value, onChange],
  );

  const isValid =
    value.companyName.trim() !== "" &&
    value.industry.trim() !== "" &&
    value.productName.trim() !== "";

  const toggleSection = useCallback((section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white">{S.brandMemory.stepTitle}</h2>
        <p className="text-neutral-400 text-sm mt-1">{S.brandMemory.stepSubtitle}</p>
      </div>

      {/* Preset button */}
      <button
        type="button"
        onClick={handlePreset}
        className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl text-purple-300 text-sm font-medium transition-all"
      >
        {presetApplied ? S.brandMemory.presetApplied : S.brandMemory.presetButton}
      </button>

      {/* Required fields */}
      <div className="space-y-3">
        <RequiredInput
          label={S.brandMemory.companyName}
          value={value.companyName}
          onChange={(v) => updateField("companyName", v)}
        />
        <RequiredInput
          label={S.brandMemory.industry}
          value={value.industry}
          onChange={(v) => updateField("industry", v)}
        />
        <RequiredInput
          label={S.brandMemory.productName}
          value={value.productName}
          onChange={(v) => updateField("productName", v)}
        />
      </div>

      {/* Accordion sections */}
      <AccordionSection
        title={S.brandMemory.sectionBasic}
        isOpen={openSection === "basic"}
        onToggle={() => toggleSection("basic")}
      >
        <OptionalInput label={S.brandMemory.foundedDate} value={value.foundedDate ?? ""} onChange={(v) => updateField("foundedDate", v || undefined)} />
        <OptionalInput label={S.brandMemory.founderName} value={value.founderName ?? ""} onChange={(v) => updateField("founderName", v || undefined)} />
        <OptionalInput label={S.brandMemory.teamSize} value={value.teamSize ?? ""} onChange={(v) => updateField("teamSize", v || undefined)} />
        <OptionalInput label={S.brandMemory.mission} value={value.mission ?? ""} onChange={(v) => updateField("mission", v || undefined)} />
        <OptionalInput label={S.brandMemory.vision} value={value.vision ?? ""} onChange={(v) => updateField("vision", v || undefined)} />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionProduct}
        isOpen={openSection === "product"}
        onToggle={() => toggleSection("product")}
      >
        <OptionalInput label={S.brandMemory.productDescription} value={value.productDescription ?? ""} onChange={(v) => updateField("productDescription", v || undefined)} />
        <OptionalInput label={S.brandMemory.targetCustomer} value={value.targetCustomer ?? ""} onChange={(v) => updateField("targetCustomer", v || undefined)} />
        <OptionalInput label={S.brandMemory.techStack} value={value.techStack ?? ""} onChange={(v) => updateField("techStack", v || undefined)} />
        <OptionalInput label={S.brandMemory.revenueModel} value={value.revenueModel ?? ""} onChange={(v) => updateField("revenueModel", v || undefined)} />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionMarket}
        isOpen={openSection === "market"}
        onToggle={() => toggleSection("market")}
      >
        <OptionalInput label={S.brandMemory.marketSize} value={value.marketSize ?? ""} onChange={(v) => updateField("marketSize", v || undefined)} />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionFinance}
        isOpen={openSection === "finance"}
        onToggle={() => toggleSection("finance")}
      >
        <OptionalInput label={S.brandMemory.currentStage} value={value.currentStage ?? ""} onChange={(v) => updateField("currentStage", v || undefined)} />
        <OptionalInput label={S.brandMemory.funding} value={value.funding ?? ""} onChange={(v) => updateField("funding", v || undefined)} />
        <OptionalInput label={S.brandMemory.goals} value={value.goals ?? ""} onChange={(v) => updateField("goals", v || undefined)} />
      </AccordionSection>

      <AccordionSection
        title={S.brandMemory.sectionBrand}
        isOpen={openSection === "brand"}
        onToggle={() => toggleSection("brand")}
      >
        <OptionalInput label={S.brandMemory.brandCopy} value={value.brandCopy ?? ""} onChange={(v) => updateField("brandCopy", v || undefined)} />
        <OptionalInput label={S.brandMemory.positioning} value={value.positioning ?? ""} onChange={(v) => updateField("positioning", v || undefined)} />
      </AccordionSection>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 font-medium transition-all"
        >
          {S.brandMemory.back}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded-xl text-white font-semibold transition-all"
        >
          {S.brandMemory.next}
        </button>
      </div>

      {/* Skip link */}
      <button
        type="button"
        onClick={onNext}
        className="w-full text-center text-neutral-500 text-xs hover:text-neutral-400 transition-colors"
      >
        {S.brandMemory.skip}
      </button>
    </div>
  );
});

/** Required field input with badge */
function RequiredInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
        {label} <span className="text-red-400 text-[10px]">{S.brandMemory.required}</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all text-sm"
      />
    </div>
  );
}

/** Optional field input */
function OptionalInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-500 mb-1 tracking-wider">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-neutral-900/40 border border-neutral-800/40 rounded-lg text-white/80 placeholder-neutral-700 focus:outline-none focus:border-indigo-500/30 transition-all text-sm"
      />
    </div>
  );
}

/** Collapsible section */
function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-neutral-800/40 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between bg-neutral-900/30 hover:bg-neutral-900/50 transition-colors"
      >
        <span className="text-sm text-neutral-300 font-medium">{title}</span>
        <span className="text-neutral-500 text-xs">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="px-4 py-3 space-y-2.5">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lobby/BrandMemoryForm.tsx
git commit -m "feat(ui): add BrandMemoryForm with preset button and accordion sections

- Maestiq preset one-click auto-fill
- 3 required fields (companyName, industry, productName)
- Collapsible accordion for optional sections
- Skip button for users who want to proceed without brand info

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 13: LobbyPage — Multi-step wizard flow

**Files:**
- Modify: `frontend/src/components/lobby/LobbyPage.tsx:1-170`

- [ ] **Step 1: Rewrite LobbyPage with multi-step flow**

Replace the entire LobbyPage component with the multi-step version:

```typescript
import { useState, useCallback, useEffect, useRef } from "react";
import { S } from "../../constants/strings";
import { useSessionRoom } from "../../hooks/useSessionRoom";
import { useMeetingDispatch, useMeetingState } from "../../context/MeetingContext";
import { BrandMemoryForm } from "./BrandMemoryForm";
import { createEmptyBrandMemory } from "../../constants/brandPresets";
import type { BrandMemorySet } from "../../types";

type LobbyStep = "name" | "brandMemory" | "agenda" | "entering";

const SESSION_KEY_BRAND_MEMORY = "bizroom_brand_memory";

interface LobbyPageProps {
  initialRoomCode?: string;
}

/** Load brand memory from sessionStorage */
function loadBrandMemory(): BrandMemorySet {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_BRAND_MEMORY);
    if (raw) return JSON.parse(raw) as BrandMemorySet;
  } catch { /* ignore */ }
  return createEmptyBrandMemory();
}

/** Save brand memory to sessionStorage */
function saveBrandMemory(bm: BrandMemorySet): void {
  sessionStorage.setItem(SESSION_KEY_BRAND_MEMORY, JSON.stringify(bm));
}

export function LobbyPage({ initialRoomCode }: LobbyPageProps) {
  const { createRoom, enterRoom, joinRoom, savedUserName } = useSessionRoom();
  const dispatch = useMeetingDispatch();
  const state = useMeetingState();

  const [step, setStep] = useState<LobbyStep>("name");
  const [mode, setMode] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
  const [name, setName] = useState(savedUserName);
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [agenda, setAgenda] = useState("");
  const [brandMemory, setBrandMemory] = useState<BrandMemorySet>(loadBrandMemory);
  const [error, setError] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const agendaInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === "name") nameInputRef.current?.focus();
    if (step === "agenda") agendaInputRef.current?.focus();
  }, [step]);

  // Step 1: Name
  const handleNameSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError(S.lobby.nameLabel);
        return;
      }
      if (mode === "join") {
        const code = roomCode.trim().toUpperCase();
        if (!code || !/^BZ-[A-Z0-9]{4}$/.test(code)) {
          setError(S.lobby.roomIdPlaceholder);
          return;
        }
        joinRoom(code, trimmedName);
        return;
      }
      // Create mode: proceed to brand memory step
      createRoom(trimmedName);
      setStep("brandMemory");
    },
    [name, roomCode, mode, createRoom, joinRoom],
  );

  // Step 2: Brand Memory → next
  const handleBrandMemoryNext = useCallback(() => {
    saveBrandMemory(brandMemory);
    dispatch({ type: "SET_BRAND_MEMORY", payload: brandMemory.companyName ? brandMemory : null });
    setStep("agenda");
  }, [brandMemory, dispatch]);

  // Step 3: Agenda → enter room
  const handleAgendaSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      dispatch({ type: "SET_LOBBY_AGENDA", payload: agenda.trim() || "일반 회의" });
      enterRoom();
    },
    [enterRoom, agenda, dispatch],
  );

  const handleRoomCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().slice(0, 7);
    setRoomCode(val);
  }, []);

  return (
    <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/5 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-purple-600/4 blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-neutral-950/70 backdrop-blur-2xl rounded-2xl border border-neutral-700/30 shadow-2xl shadow-black/50 p-8">
          {/* Logo (always visible) */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {S.lobby.title}
              <span className="text-indigo-400">.ai</span>
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{S.lobby.subtitle}</p>
          </div>

          {/* Step indicator */}
          {mode === "create" && step !== "name" && (
            <div className="flex justify-center gap-2 mb-6">
              {["name", "brandMemory", "agenda"].map((s, i) => (
                <div
                  key={s}
                  className={`h-1 w-12 rounded-full transition-colors ${
                    ["name", "brandMemory", "agenda"].indexOf(step) >= i
                      ? "bg-indigo-500"
                      : "bg-neutral-800"
                  }`}
                />
              ))}
            </div>
          )}

          {/* ═══ STEP: NAME ═══ */}
          {step === "name" && (
            <>
              {/* Tab toggle */}
              <div className="flex bg-neutral-900/60 rounded-xl p-1 mb-6">
                <button
                  type="button"
                  onClick={() => { setMode("create"); setError(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    mode === "create"
                      ? "bg-indigo-600/80 text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {S.lobby.createRoomTab}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("join"); setError(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    mode === "join"
                      ? "bg-indigo-600/80 text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {S.lobby.joinRoomTab}
                </button>
              </div>

              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div>
                  <label htmlFor="lobby-name-input" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                    {S.lobby.nameLabel}
                  </label>
                  <input
                    ref={nameInputRef}
                    id="lobby-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={S.lobby.namePlaceholder}
                    maxLength={20}
                    className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  />
                </div>

                {mode === "join" && (
                  <div>
                    <label htmlFor="lobby-room-input" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                      {S.lobby.roomCode}
                    </label>
                    <input
                      id="lobby-room-input"
                      type="text"
                      value={roomCode}
                      onChange={handleRoomCodeChange}
                      placeholder={S.lobby.roomIdPlaceholder}
                      className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all font-mono text-center text-lg tracking-widest"
                    />
                  </div>
                )}

                {error && <p className="text-red-400/80 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {mode === "create" ? S.brandMemory.next : S.lobby.enterRoom}
                </button>
              </form>

              <p className="text-center text-neutral-600 text-xs mt-6">
                {mode === "create" ? S.lobby.createHint : S.lobby.joinHint}
              </p>
            </>
          )}

          {/* ═══ STEP: BRAND MEMORY ═══ */}
          {step === "brandMemory" && (
            <div className="max-h-[60vh] overflow-y-auto pr-1 -mr-1">
              <BrandMemoryForm
                value={brandMemory}
                onChange={(bm) => { setBrandMemory(bm); saveBrandMemory(bm); }}
                onNext={handleBrandMemoryNext}
                onBack={() => setStep("name")}
              />
            </div>
          )}

          {/* ═══ STEP: AGENDA ═══ */}
          {step === "agenda" && (
            <form onSubmit={handleAgendaSubmit} className="space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white">{S.agenda.stepTitle}</h2>
                <p className="text-neutral-400 text-sm mt-1">{S.agenda.stepSubtitle}</p>
              </div>

              <textarea
                ref={agendaInputRef}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder={S.agenda.placeholder}
                rows={3}
                className="w-full px-4 py-3 bg-neutral-900/60 border border-neutral-700/40 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("brandMemory")}
                  className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 font-medium transition-all"
                >
                  {S.brandMemory.back}
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  {S.lobby.enterRoom}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Visual verification**

Run: `cd frontend && npm run dev`
Verify:
- Name step renders with create/join tabs
- Clicking "다음" goes to Brand Memory step
- Preset button auto-fills all fields
- Accordion sections expand/collapse
- Next goes to Agenda step
- "입장하기" enters the room

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/lobby/LobbyPage.tsx
git commit -m "feat(ui): rewrite LobbyPage as multi-step wizard

- Step flow: name → brandMemory → agenda → enter
- Step indicator dots for progress visualization
- Brand memory persisted in sessionStorage
- Join mode skips brand/agenda steps (direct entry)
- Scrollable brand memory form for long preset data

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: App.tsx — Wire brandMemory + agenda to meetingStart API

**Files:**
- Modify: `frontend/src/App.tsx:344-372` (handleStartMeeting function)

- [ ] **Step 1: Modify handleStartMeeting to include roomId, agenda, and brandMemory**

In `App.tsx`, modify the `handleStartMeeting` function (lines 344-372).

Replace the `fetch` body (lines 350-353):

```typescript
        body: JSON.stringify({
          userId: state.userId || "user-1",
          userName: state.userName || "Chairman",
        }),
```

With:

```typescript
        body: JSON.stringify({
          roomId: state.roomId,
          userId: state.userId || "user-1",
          userName: state.userName || "Chairman",
          agenda: state.lobbyAgenda || "일반 회의",
          brandMemory: state.brandMemory,
        }),
```

- [ ] **Step 2: Update handleStartMeeting dependency array**

Update the useCallback dependency array (line 372) to include `state.lobbyAgenda` and `state.brandMemory`:

```typescript
  }, [dispatch, state.userId, state.userName, state.roomId, state.lobbyAgenda, state.brandMemory]);
```

- [ ] **Step 3: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ui): send brandMemory and agenda to meetingStart API

- handleStartMeeting includes roomId, agenda, brandMemory in request body
- Completes the frontend→backend data path for brand-aware meetings

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Post-Implementation Checklist

- [ ] Full backend build: `cd backend && npx tsc --noEmit`
- [ ] Full frontend build: `cd frontend && npx tsc --noEmit`
- [ ] Lint: `cd frontend && npx eslint . --fix && cd ../backend && npx eslint . --fix`
- [ ] Format: `cd frontend && npx prettier --write . && cd ../backend && npx prettier --write .`
- [ ] Manual test: Lobby → Preset → Agenda → Meeting → Verify agent speaks with brand awareness
- [ ] Clean up `fix-utils.js` from project root if still present
