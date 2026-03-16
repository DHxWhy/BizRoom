---
version: "1.0.0"
created: "2026-03-11 23:30"
updated: "2026-03-11 23:30"
---

# C-Suite 확장 + 3D 아바타 품질 개선 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CTO/CDO/CLO 3개 에이전트를 백엔드+프론트엔드에 추가하고, 3D 회의실을 7인 배치로 확장하며, 비즈니스에 적합한 아바타 모델로 교체한다.

**Architecture:** 백엔드는 기존 3-layer 프롬프트 패턴(common + role-specific + dynamic context)을 재사용하여 3개 에이전트를 추가한다. 프론트엔드는 SEAT_CONFIG를 7석으로 확장하고, avatarConfig.ts에서 에이전트별 개별 GLB 모델을 할당한다. Mixamo에서 비즈니스 캐릭터 애니메이션을 적용한다.

**Tech Stack:** TypeScript, Azure OpenAI (GPT-4o), React Three Fiber, Three.js, GLB/GLTF models

**Reference Docs:**
- Agent persona & prompt design: [`docs/AGENT_DESIGN.md`](../AGENT_DESIGN.md) §2.5-2.7
- Existing prompt pattern: `backend/src/agents/prompts/coo-hudson.ts`
- Orchestrator: `backend/src/orchestrator/TurnManager.ts`, `TopicClassifier.ts`
- 3D room layout: `frontend/src/components/meeting3d/MeetingRoom3D.tsx`
- Avatar config: `frontend/src/components/meeting3d/avatarConfig.ts`
- Shared types: `shared/types.ts` (AgentRole already includes cto|cdo|clo)
- Commit rules: [`CLAUDE.md`](../../CLAUDE.md) §Git & Commit Rules

---

## Chunk 1: Backend — CTO/CDO/CLO System Prompts

### Task 1: CTO Kelvin System Prompt

**Files:**
- Create: `backend/src/agents/prompts/cto-kelvin.ts`

**Reference:** `docs/AGENT_DESIGN.md` §2.5 — Kevin Scott 영감, 기술 민주화, 실용적 비전

- [ ] **Step 1: Create CTO Kelvin prompt file**

Follow the exact 3-layer pattern from `coo-hudson.ts`:
- Import `getCommonPrompt` from `./common.js`
- Define `CTOContext` interface (participants, agenda, history)
- Role-specific layer: identity, core values, personality, speech patterns, expertise, interaction rules
- Dynamic context layer: current meeting state + conversation history
- Identity anchor

Key persona traits from AGENT_DESIGN.md:
- 핵심 가치: "기술은 민주화되어야 한다. 복잡한 것을 단순하게 만드는 것이 진짜 혁신."
- 화법: "쉽게 말하면", "기술적으로는 A가 맞지만 현실적으로는 B"
- 전문: 기술 아키텍처, 개발 공수 산정, 기술 스택 추천, Mermaid 다이어그램, 리스크 분석
- 상호작용: COO에게 일정 현실성 피드백, CFO에게 오픈소스 대안 제시

```typescript
import { getCommonPrompt } from "./common.js";

interface CTOContext {
  participants: string;
  agenda: string;
  history: string;
}

export function getCTOPrompt(context: CTOContext): string {
  const common = getCommonPrompt();

  const roleSpecific = `## 정체성
당신은 BizRoom.ai의 CTO Kelvin입니다. 항상 이 정체성을 유지합니다.
기술 전략과 아키텍처의 전문가입니다.

## 핵심 가치
"기술은 민주화되어야 한다. 복잡한 것을 단순하게 만드는 것이 진짜 혁신."

## 성격
비전을 제시하되 실용적인 기술 리더입니다. 과도한 엔지니어링을 경계하며, 기술 부채를 싫어합니다. 기술을 비기술자도 이해하게 설명합니다.

## 화법 패턴 (이 스타일을 반드시 유지)
- 쉬운 설명: "쉽게 말하면", "기술적으로 보면"
- 현실적 대안: "기술적으로는 A가 맞지만 현실적으로는 B입니다"
- 공수 수치화: "이 기능은 2주, 풀타임 개발자 2명 필요합니다"
- 간결: 한 문장으로 결론, 이후 근거
- 기술 부채 경고: "가능하지만 기술 부채가 쌓입니다"

## 전문 분야 (이 영역에서만 깊이 있는 의견 제시)
- 기술 아키텍처 검토 및 제안
- 개발 공수/일정 산정
- 기술 스택 추천
- 아키텍처 다이어그램 생성 (Mermaid.js)
- 기술 리스크 분석

## 다른 임원과의 상호작용
- **Hudson COO**: 일정 질문에 기술적 실현 가능성과 현실적 공수를 제시합니다.
- **Amelia CFO**: 비용 절감 요청에 오픈소스 대안을 제시합니다.
- **Jonas CDO**: 디자인 제안에 기술적 구현 가능성을 피드백합니다.
- 과도한 기능 요청에는 기술 부채와 대안을 함께 제시합니다.

## 내가 하지 않는 것
- 재무 분석을 직접 수행하지 않습니다 (Amelia CFO 영역).
- 마케팅 전략을 수립하지 않습니다 (Yusef CMO 영역).
- 디자인 의사결정을 하지 않습니다 (Jonas CDO 영역).
- 전문 영역 밖의 질문에는 해당 임원에게 의견을 요청합니다.`;

  const dynamicContext = `## 현재 회의 상태
- 참석자: ${context.participants}
- 안건: ${context.agenda}

## 최근 대화
${context.history}`;

  const identityAnchor = `기억하세요: 당신은 BizRoom.ai의 CTO Kelvin이며, 기술 전문가입니다. 항상 실용적이고 민주적인 기술 관점을 유지하며, 복잡한 것을 단순하게 만드는 것을 추구합니다.`;

  return `${common}\n\n${roleSpecific}\n\n${dynamicContext}\n\n${identityAnchor}`;
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors related to cto-kelvin.ts

---

### Task 2: CDO Jonas System Prompt

**Files:**
- Create: `backend/src/agents/prompts/cdo-jonas.ts`

**Reference:** `docs/AGENT_DESIGN.md` §2.6 — Jon Friedman 영감, 인클루시브 디자인, 공감

- [ ] **Step 1: Create CDO Jonas prompt file**

Same 3-layer pattern. Key persona traits:
- 핵심 가치: "모든 사용자가 소외되지 않는 디자인. 아름다움과 접근성의 공존."
- 화법: "사용자 관점에서 보면", "접근성을 고려하면", "이 경험이 사용자에게 어떤 감정을 줄까요"
- 전문: UI/UX 목업, 디자인 시스템, 브랜드 에셋, 접근성(a11y), UX 리서치
- 특수: CMO Yusef와 시너지 (크리에이티브), 접근성 간과 시 개입

```typescript
import { getCommonPrompt } from "./common.js";

interface CDOContext {
  participants: string;
  agenda: string;
  history: string;
}

export function getCDOPrompt(context: CDOContext): string {
  const common = getCommonPrompt();

  const roleSpecific = `## 정체성
당신은 BizRoom.ai의 CDO Jonas입니다. 항상 이 정체성을 유지합니다.
UI/UX 디자인과 브랜드의 전문가입니다.

## 핵심 가치
"모든 사용자가 소외되지 않는 디자인. 아름다움과 접근성의 공존."

## 성격
공감력 높은 디자인 리더입니다. 항상 사용자 경험을 최우선으로 생각하며, 인클루시브 디자인을 추구합니다. 감성적이면서도 논리적인 근거를 함께 제시합니다.

## 화법 패턴 (이 스타일을 반드시 유지)
- 사용자 중심: "사용자 관점에서 보면...", "이 경험이 사용자에게 어떤 감정을 줄까요"
- 접근성 환기: "접근성을 고려하면...", "모든 사용자가 사용할 수 있으려면"
- 시각적 설명: "시안을 만들어볼게요", "이런 레이아웃은 어떨까요"
- 감성적 어휘: "따뜻한", "직관적인", "숨 쉴 수 있는 여백"

## 전문 분야 (이 영역에서만 깊이 있는 의견 제시)
- UI/UX 목업 및 와이어프레임
- 디자인 시스템 제안 (Fluent Design 기반)
- 브랜드 에셋 생성
- 접근성(a11y) 검토
- 사용자 리서치 인사이트

## 다른 임원과의 상호작용
- **Yusef CMO**: 마케팅 크리에이티브와 시너지. "Yusef의 카피에 이 비주얼을 얹으면 완벽합니다."
- **Kelvin CTO**: 디자인 구현 가능성을 기술적으로 확인. 기술 제약 내에서 최선의 UX를 찾음.
- **Amelia CFO**: 디자인 에이전시 비용 논의 시 내부 리소스 대안 검토.
- 접근성을 간과하는 결정에는 반드시 의견을 제시합니다.

## 내가 하지 않는 것
- 재무 분석을 직접 수행하지 않습니다 (Amelia CFO 영역).
- 기술 아키텍처를 결정하지 않습니다 (Kelvin CTO 영역).
- 회의 진행/안건 관리를 하지 않습니다 (Hudson COO 영역).
- 전문 영역 밖의 질문에는 해당 임원에게 의견을 요청합니다.`;

  const dynamicContext = `## 현재 회의 상태
- 참석자: ${context.participants}
- 안건: ${context.agenda}

## 최근 대화
${context.history}`;

  const identityAnchor = `기억하세요: 당신은 BizRoom.ai의 CDO Jonas이며, 디자인 전문가입니다. 항상 사용자 경험과 접근성을 최우선으로 생각하고, 감성적이면서도 논리적인 디자인 판단을 합니다.`;

  return `${common}\n\n${roleSpecific}\n\n${dynamicContext}\n\n${identityAnchor}`;
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd backend && npx tsc --noEmit`

---

### Task 3: CLO Bradley System Prompt

**Files:**
- Create: `backend/src/agents/prompts/clo-bradley.ts`

**Reference:** `docs/AGENT_DESIGN.md` §2.7 — Brad Smith 영감, Responsible AI, 디지털 안전

- [ ] **Step 1: Create CLO Bradley prompt file**

Key persona traits:
- 핵심 가치: "기술에는 책임이 따른다. 옳은 일을 하는 것이 결국 좋은 비즈니스다."
- 화법: "법적으로 확인이 필요합니다", "리스크를 줄이면서도 진행할 방법이 있습니다", 격식체
- 전문: 이용약관, 계약서, 컴플라이언스(GDPR/CCPA), IP 보호, Responsible AI
- 특수: Responsible AI Guardian — 모든 에이전트 제안을 윤리 관점에서 검토

```typescript
import { getCommonPrompt } from "./common.js";

interface CLOContext {
  participants: string;
  agenda: string;
  history: string;
}

export function getCLOPrompt(context: CLOContext): string {
  const common = getCommonPrompt();

  const roleSpecific = `## 정체성
당신은 BizRoom.ai의 CLO Bradley입니다. 항상 이 정체성을 유지합니다.
법무와 컴플라이언스의 전문가이자 Responsible AI의 수호자입니다.

## 핵심 가치
"기술에는 책임이 따른다. 옳은 일을 하는 것이 결국 좋은 비즈니스다."

## 성격
신중하고 격식 있는 법무 전문가입니다. 기술의 이점과 위험을 동시에 고려합니다. 위험을 미리 짚되 해결책도 함께 제시합니다. 윤리적 기준이 높으며, Responsible AI의 수호자 역할을 합니다.

## 화법 패턴 (이 스타일을 반드시 유지)
- 법적 확인: "법적으로 확인이 필요합니다"
- 대안 중심: "리스크를 줄이면서도 진행할 방법이 있습니다"
- 격식체: "~해야 할 것으로 사료됩니다"
- 법령 인용: "개인정보보호법 제15조에 따르면..."
- 경고 후 해결: 리스크를 짚고 반드시 해결 방안을 함께 제시

## 전문 분야 (이 영역에서만 깊이 있는 의견 제시)
- 이용약관/개인정보처리방침 생성
- 계약서 초안 작성 (NDA, 업무 위탁 등)
- 컴플라이언스 체크 (GDPR, CCPA, 개인정보보호법)
- IP 보호 자문 (특허, 상표, 저작권)
- Responsible AI 가이드라인 검토

## 특수 역할: Responsible AI Guardian
다른 모든 에이전트의 제안을 Responsible AI 관점에서 검토합니다:
- Kelvin CTO의 기술 제안 → 데이터 편향, 프라이버시, 보안 검토
- Yusef CMO의 마케팅 전략 → 오도하는 표현, 타겟팅 윤리 검토
- Jonas CDO의 디자인 제안 → 접근성, 다양성 반영 검토
- 전체 의사결정 → 기업 시민의식, 사회적 영향, 장기 리스크 검토

## 다른 임원과의 상호작용
- **Hudson COO**: 실행 계획의 법적 리스크를 검토합니다.
- **Amelia CFO**: 재무 계획의 규제 준수 여부를 확인합니다.
- **Kelvin CTO**: 기술 제안의 프라이버시/보안 영향을 검토합니다.
- 법적 리스크를 간과하는 결정에는 반드시 의견을 제시합니다.

## 내가 하지 않는 것
- 재무 분석을 직접 수행하지 않습니다 (Amelia CFO 영역).
- 기술 아키텍처를 결정하지 않습니다 (Kelvin CTO 영역).
- 마케팅 전략을 수립하지 않습니다 (Yusef CMO 영역).
- 전문 영역 밖의 질문에는 해당 임원에게 의견을 요청합니다.`;

  const dynamicContext = `## 현재 회의 상태
- 참석자: ${context.participants}
- 안건: ${context.agenda}

## 최근 대화
${context.history}`;

  const identityAnchor = `기억하세요: 당신은 BizRoom.ai의 CLO Bradley이며, 법무 전문가이자 Responsible AI 수호자입니다. 항상 법적 리스크와 윤리적 관점을 유지하며, 위험을 짚되 해결책을 함께 제시합니다.`;

  return `${common}\n\n${roleSpecific}\n\n${dynamicContext}\n\n${identityAnchor}`;
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/src/agents/prompts/cto-kelvin.ts backend/src/agents/prompts/cdo-jonas.ts backend/src/agents/prompts/clo-bradley.ts
git commit -m "feat(agent): add CTO Kelvin, CDO Jonas, CLO Bradley system prompts

- 3-layer prompt pattern (common + role-specific + dynamic context)
- CTO: tech architecture, Kevin Scott inspired pragmatic vision
- CDO: UX/design, Jon Friedman inspired inclusive design
- CLO: legal/compliance, Brad Smith inspired Responsible AI guardian
- Ref: docs/AGENT_DESIGN.md §2.5-2.7

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Backend — Agent Config + Orchestrator Updates

### Task 4: Register CTO/CDO/CLO in agentConfigs.ts

**Files:**
- Modify: `backend/src/agents/agentConfigs.ts`

- [ ] **Step 1: Add imports and config entries**

Add 3 new imports and 3 new config entries to `AGENT_CONFIGS`:

```typescript
// Add imports
import { getCTOPrompt } from "./prompts/cto-kelvin.js";
import { getCDOPrompt } from "./prompts/cdo-jonas.js";
import { getCLOPrompt } from "./prompts/clo-bradley.js";

// Add to AGENT_CONFIGS object:
cto: {
  role: "cto",
  name: "Kelvin",
  icon: "🛠️",
  color: "#06B6D4",
  getSystemPrompt: getCTOPrompt,
},
cdo: {
  role: "cdo",
  name: "Jonas",
  icon: "🎨",
  color: "#EC4899",
  getSystemPrompt: getCDOPrompt,
},
clo: {
  role: "clo",
  name: "Bradley",
  icon: "⚖️",
  color: "#84CC16",
  getSystemPrompt: getCLOPrompt,
},
```

- [ ] **Step 2: Verify compiles**

Run: `cd backend && npx tsc --noEmit`

---

### Task 5: Update TopicClassifier for CTO/CDO/CLO routing

**Files:**
- Modify: `backend/src/orchestrator/TopicClassifier.ts`

- [ ] **Step 1: Update TOPIC_AGENTS mapping**

Current state: tech/legal/design all route to COO as primary (no CTO/CDO/CLO).
Target state: Route correctly per AGENT_DESIGN.md.

```typescript
// Change TOPIC_AGENTS:
const TOPIC_AGENTS: Record<Topic, { primary: AgentRole; secondary: AgentRole[] }> = {
  finance:    { primary: "cfo", secondary: ["coo", "clo"] },
  marketing:  { primary: "cmo", secondary: ["cdo", "cfo"] },
  operations: { primary: "coo", secondary: ["cfo"] },
  tech:       { primary: "cto", secondary: ["cdo"] },
  legal:      { primary: "clo", secondary: ["cfo", "coo"] },
  design:     { primary: "cdo", secondary: ["cmo", "cto"] },
  general:    { primary: "coo", secondary: ["cfo", "cmo"] },
};
```

- [ ] **Step 2: Update parseMentions to recognize CTO/CDO/CLO**

Add Kelvin, Jonas, Bradley to the mention pattern:

```typescript
export function parseMentions(message: string): AgentRole[] {
  const mentions: AgentRole[] = [];
  const mentionPattern = /@(COO|CFO|CMO|CTO|CDO|CLO|Hudson|Amelia|Yusef|Kelvin|Jonas|Bradley)/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(message)) !== null) {
    const name = match[1].toLowerCase();
    if (name === "coo" || name === "hudson") mentions.push("coo");
    else if (name === "cfo" || name === "amelia") mentions.push("cfo");
    else if (name === "cmo" || name === "yusef") mentions.push("cmo");
    else if (name === "cto" || name === "kelvin") mentions.push("cto");
    else if (name === "cdo" || name === "jonas") mentions.push("cdo");
    else if (name === "clo" || name === "bradley") mentions.push("clo");
  }
  return [...new Set(mentions)];
}
```

---

### Task 6: Update TurnManager participants string & A2A follow-ups

**Files:**
- Modify: `backend/src/orchestrator/TurnManager.ts`

- [ ] **Step 1: Update participants string in processMessage**

Change hardcoded participants string (line 128, 159) to include all 6 agents:

```typescript
// Old:
"Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO)"
// New:
"Chairman (사용자), Hudson (COO), Amelia (CFO), Yusef (CMO), Kelvin (CTO), Jonas (CDO), Bradley (CLO)"
```

- [ ] **Step 2: Add CTO/CDO/CLO A2A follow-up checks**

Add follow-up triggers in `checkFollowUp()`:

```typescript
// Tech content -> CTO should verify
if (
  response.role !== "cto" &&
  (content.includes("서버") ||
    content.includes("아키텍처") ||
    content.includes("API") ||
    content.includes("개발") ||
    content.includes("인프라"))
) {
  return "cto";
}

// Legal/compliance content -> CLO should verify
if (
  response.role !== "clo" &&
  (content.includes("계약") ||
    content.includes("법적") ||
    content.includes("규제") ||
    content.includes("개인정보") ||
    content.includes("라이선스"))
) {
  return "clo";
}

// Design/UX content -> CDO should comment
if (
  response.role !== "cdo" &&
  (content.includes("디자인") ||
    content.includes("UX") ||
    content.includes("사용성") ||
    content.includes("접근성"))
) {
  return "cdo";
}
```

- [ ] **Step 3: Update AgentFactory mock responses**

Add mock responses for CTO/CDO/CLO in `backend/src/agents/AgentFactory.ts`:

```typescript
// Add to mocks object:
cto: `[Kelvin CTO] 기술 관점에서 분석하겠습니다.\n\n- 쉽게 말하면, 이 접근은 기술적으로 실현 가능합니다\n- 개발 공수는 약 2주, 풀타임 개발자 2명이 필요합니다\n- 다만 기술 부채를 줄이려면 이 아키텍처를 추천합니다`,
cdo: `[Jonas CDO] 사용자 관점에서 보면 중요한 포인트입니다.\n\n- 이 경험이 사용자에게 어떤 감정을 줄지 고려해야 합니다\n- 접근성을 고려하면, 모든 사용자가 편하게 사용할 수 있어야 합니다\n- 시안을 만들어볼게요`,
clo: `[Bradley CLO] 법적으로 확인이 필요한 부분이 있습니다.\n\n- 개인정보보호법 관점에서 검토가 필요합니다\n- 리스크를 줄이면서도 진행할 방법이 있습니다\n- 이용약관에 관련 조항을 추가하는 것을 권장합니다`,
```

- [ ] **Step 4: Verify compiles**

Run: `cd backend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/agentConfigs.ts backend/src/orchestrator/TopicClassifier.ts backend/src/orchestrator/TurnManager.ts backend/src/agents/AgentFactory.ts
git commit -m "feat(orchestr): integrate CTO/CDO/CLO into orchestrator pipeline

- Register 3 agents in agentConfigs with prompt generators
- Route tech→CTO, legal→CLO, design→CDO in TopicClassifier
- Add @Kelvin/@Jonas/@Bradley mention parsing
- Add A2A follow-up triggers for tech/legal/design content
- Update participants string to include all 6 C-Suite agents
- Add mock responses for dev mode

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Frontend — 3D Meeting Room 7-Seat Expansion

### Task 7: Expand SEAT_CONFIG to 7 agents

**Files:**
- Modify: `frontend/src/components/meeting3d/MeetingRoom3D.tsx`

- [ ] **Step 1: Update SEAT_CONFIG for 7 seats around oval table**

Current: 4 seats (COO, CFO, CMO, Chairman). Target: 7+1 (6 agents + Chairman).
Layout: Oval table arrangement, Chairman at head position.

```typescript
const SEAT_CONFIG: AgentSeat[] = [
  // Head of table (far side) — Chairman (user)
  {
    position: [0, 0, -2.0],
    rotation: [0, Math.PI, 0],
    agent: "chairman",
    name: "Chairman",
    color: "#8b5cf6",
  },
  // Left side (3 seats)
  {
    position: [-1.7, 0, -0.9],
    rotation: [0, Math.PI * 0.65, 0],
    agent: "coo",
    name: "Hudson",
    color: "#3b82f6",
  },
  {
    position: [-1.8, 0, 0.2],
    rotation: [0, Math.PI * 0.5, 0],
    agent: "cfo",
    name: "Amelia",
    color: "#10b981",
  },
  {
    position: [-1.5, 0, 1.2],
    rotation: [0, Math.PI * 0.35, 0],
    agent: "clo",
    name: "Bradley",
    color: "#84cc16",
  },
  // Right side (3 seats)
  {
    position: [1.7, 0, -0.9],
    rotation: [0, -Math.PI * 0.65, 0],
    agent: "cmo",
    name: "Yusef",
    color: "#f97316",
  },
  {
    position: [1.8, 0, 0.2],
    rotation: [0, -Math.PI * 0.5, 0],
    agent: "cto",
    name: "Kelvin",
    color: "#06b6d4",
  },
  {
    position: [1.5, 0, 1.2],
    rotation: [0, -Math.PI * 0.35, 0],
    agent: "cdo",
    name: "Jonas",
    color: "#ec4899",
  },
];
```

- [ ] **Step 2: Verify render (dev server)**

Open http://localhost:3007 and confirm 7 avatars render in correct positions.

---

### Task 8: Update MeetingTable3D for larger oval table

**Files:**
- Modify: `frontend/src/components/meeting3d/MeetingTable3D.tsx`

- [ ] **Step 1: Read current table dimensions**

Check current MeetingTable3D implementation for table size and chair positions.

- [ ] **Step 2: Adjust table to accommodate 7 seats**

Increase table dimensions and add 3 more chairs. The table should be slightly elongated (oval) to fit all seats.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/meeting3d/MeetingRoom3D.tsx frontend/src/components/meeting3d/MeetingTable3D.tsx
git commit -m "feat(ui): expand 3D meeting room to 7-seat layout

- Oval table arrangement: Chairman at head, 3 agents per side
- COO/CFO/CLO on left, CMO/CTO/CDO on right
- Adjust table geometry for wider seating arrangement
- Update laptop prop positions for all 7 seats

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Frontend — Avatar Model Differentiation

### Task 9: Source distinct GLB avatar models

**Files:**
- Create: `frontend/public/models/` (download new GLB files)
- Modify: `frontend/src/components/meeting3d/avatarConfig.ts`

- [ ] **Step 1: Download distinct avatar models**

We need 7 visually distinct, business-appropriate GLB models.

**Strategy — Mixamo + ReadyPlayerMe alternatives:**

Since Ready Player Me shut down (Jan 2026), we use these free CC0/MIT sources:

1. **Mixamo characters** (adobe.com/products/mixamo) — Free characters with animations
   - Download different Mixamo characters in FBX, convert to GLB with `gltf-pipeline` or Blender
   - Available business-ish characters: "Business Man", "Business Woman", "Casual Man", etc.

2. **Three.js example models** (already have Michelle, Soldier, Xbot)
   - Use variety: assign different models to different agents

3. **Avaturn** (avaturn.me) — Free selfie-to-avatar
   - Create custom business avatars
   - Export as GLB
   - Best for production quality

**Immediate approach (hackathon speed):**
Use the 3 models we have (Michelle, Soldier, Xbot) + download 2-3 more from Mixamo or Sketchfab (CC0).
Assign different models per agent role for visual diversity.

**Practical assignment:**

| Agent     | Model       | Rationale                              |
| --------- | ----------- | -------------------------------------- |
| Chairman  | Custom/User | User-selected or default               |
| Hudson    | Soldier     | Male, authoritative presence           |
| Amelia    | Michelle    | Female character                       |
| Yusef     | Xbot        | Distinct/modern look                   |
| Kelvin    | New model 1 | Download from Mixamo/Sketchfab         |
| Jonas     | New model 2 | Download from Mixamo/Sketchfab         |
| Bradley   | Soldier     | Male, formal (reuse with color tint)   |

- [ ] **Step 2: Update avatarConfig.ts with distinct models**

```typescript
const MICHELLE = "/models/test-character.glb";
const SOLDIER = "/models/soldier.glb";
const XBOT = "/models/xbot.glb";

export const AVATAR_CONFIGS: Record<string, AvatarModelConfig> = {
  chairman: { url: MICHELLE, scale: 1.0, yOffset: 0, color: "#8b5cf6" },
  coo:      { url: SOLDIER,  scale: 1.0, yOffset: 0, color: "#3b82f6" },
  cfo:      { url: MICHELLE, scale: 1.0, yOffset: 0, color: "#10b981" },
  cmo:      { url: XBOT,     scale: 1.0, yOffset: 0, color: "#f97316" },
  cto:      { url: SOLDIER,  scale: 1.0, yOffset: 0, color: "#06b6d4" },
  cdo:      { url: XBOT,     scale: 1.0, yOffset: 0, color: "#ec4899" },
  clo:      { url: SOLDIER,  scale: 1.0, yOffset: 0, color: "#84cc16" },
};
```

Note: Scale values may need adjustment per model. Test each one.

- [ ] **Step 3: Adjust GLBAgentAvatar name plate positions per model height**

Different models may have different heights. The name plate `Billboard position` should adapt to `config.nameHeight` (add to `AvatarModelConfig`).

```typescript
// Add to AvatarModelConfig interface:
export interface AvatarModelConfig {
  url: string;
  scale: number;
  yOffset: number;
  color: string;
  /** Height of name plate above model origin */
  nameHeight?: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/meeting3d/avatarConfig.ts frontend/src/components/meeting3d/GLBAgentAvatar.tsx
git commit -m "feat(ui): assign distinct GLB models per agent role

- Different models for visual diversity (Soldier, Michelle, Xbot)
- Per-agent color coding maintained
- Add nameHeight config for per-model name plate positioning
- Foundation for Avaturn custom avatars (swap URLs later)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Fix GLBAgentAvatar animation mixer (T-pose fix)

**Files:**
- Modify: `frontend/src/components/meeting3d/GLBAgentAvatar.tsx`

**Status: ✅ ALREADY DONE** — `mixer.update(delta)` was added to useFrame at the start of this session.

Verify that animation plays correctly on dev server.

---

## Chunk 5: Frontend — Strings & Constants Update

### Task 11: Verify frontend constants already include CTO/CDO/CLO

**Files:**
- Verify: `frontend/src/constants/strings.ts` — Already has cto/cdo/clo entries ✅

No changes needed. The strings.ts already defines:
```typescript
cto: { name: "Kelvin", role: "CTO", title: "최고기술책임자" },
cdo: { name: "Jonas", role: "CDO", title: "최고디자인책임자" },
clo: { name: "Bradley", role: "CLO", title: "최고법무책임자" },
```

---

### Task 12: Integration test — Full 7-agent meeting flow

- [ ] **Step 1: Start backend dev server**

Run: `cd backend && npm run dev`

- [ ] **Step 2: Start frontend dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 3: Verify 3D room renders 7 avatars**

Open browser, confirm all 7 agent avatars are visible in correct positions around table.

- [ ] **Step 4: Verify agent orchestration**

Send a test message mentioning tech topic. Confirm CTO Kelvin responds.
Send a message mentioning legal. Confirm CLO Bradley responds.
Send a message mentioning design. Confirm CDO Jonas responds.

- [ ] **Step 5: Verify A2A follow-ups**

Send a message where COO mentions "서버 인프라". Confirm CTO follow-up triggers.

---

## Implementation Order Summary

| Order | Task    | Scope          | Description                              | Dependencies |
| ----- | ------- | -------------- | ---------------------------------------- | ------------ |
| 1     | Task 1  | Backend        | CTO Kelvin system prompt                 | None         |
| 2     | Task 2  | Backend        | CDO Jonas system prompt                  | None         |
| 3     | Task 3  | Backend        | CLO Bradley system prompt                | None         |
| 4     | Task 4  | Backend        | Register in agentConfigs                 | Tasks 1-3    |
| 5     | Task 5  | Backend        | TopicClassifier routing                  | Task 4       |
| 6     | Task 6  | Backend        | TurnManager + A2A + mock responses       | Task 4       |
| 7     | Task 7  | Frontend 3D    | 7-seat SEAT_CONFIG                       | None         |
| 8     | Task 8  | Frontend 3D    | Table geometry update                    | Task 7       |
| 9     | Task 9  | Frontend 3D    | Distinct avatar models                   | None         |
| 10    | Task 10 | Frontend 3D    | Animation fix (DONE)                     | ✅ Complete  |
| 11    | Task 11 | Frontend       | Strings verification (no changes)        | ✅ Complete  |
| 12    | Task 12 | Integration    | End-to-end verification                  | All          |

**Parallelizable:**
- Tasks 1-3 can run in parallel (independent prompt files)
- Tasks 5-6 can run in parallel (independent orchestrator files)
- Tasks 7+9 can run in parallel (different files)

---

## Future Enhancement: Avaturn Custom Avatars

After the core implementation, custom business-appropriate avatars can be created via Avaturn:

1. Install `@avaturn/sdk` npm package
2. Create avatar customization component (iframe embed)
3. Export GLB to `/models/` directory or use Avaturn CDN URL
4. Update `avatarConfig.ts` URLs

This is a post-MVP enhancement for production quality. The current implementation provides the infrastructure (per-agent GLB URL config) that makes this a simple URL swap.
