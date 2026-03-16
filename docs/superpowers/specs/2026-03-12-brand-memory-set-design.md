---
version: "3.0.0"
created: "2026-03-12 16:00"
updated: "2026-03-16 14:00"
---

# Brand Memory Set — Design Spec

**Goal:** Enable AI agents to enter meetings with full awareness of the company's identity, product, market, and strategic goals. Brand Memory is configured in the lobby UI and injected as Layer 0 of every agent's system prompt.

**Architecture:** Lobby UI (BrandMemoryForm) collects BrandMemorySet JSON -> meetingStart API validates and stores it -> ContextBroker persists per room -> AgentFactory prepends Layer 0 prompt to every agent invocation.

**Tech Stack:** React 19 (Frontend Form), Azure Functions v4 (API), ContextBroker (In-Memory State), buildBrandMemoryPrompt (Layer 0 Injection)

---

## 1. Brand Memory Data Schema

### 1.1 TypeScript Interface

Defined in `shared/types.ts` (Single Source of Truth):

```typescript
export interface BrandMemorySet {
  // Required (3 fields)
  companyName: string;
  industry: string;
  productName: string;

  // Basic info (optional)
  foundedDate?: string;
  founderName?: string;
  teamSize?: string;
  mission?: string;
  vision?: string;

  // Product/Service (optional)
  productDescription?: string;
  coreFeatures?: string[];
  targetCustomer?: string;
  techStack?: string;
  revenueModel?: string;
  pricing?: PricingTier[];

  // Market data (optional)
  marketSize?: string;
  marketStats?: string[];
  competitors?: CompetitorInfo[];
  differentiation?: string[];

  // Finance (optional)
  currentStage?: string;
  funding?: string;
  goals?: string;

  // External links (optional)
  links?: ExternalLink[];

  // Challenges & priorities (optional)
  challenges?: string[];
  quarterGoal?: string;
  meetingObjective?: string;

  // Brand copy (optional)
  brandCopy?: string;
  subCopy?: string;
  positioning?: string;
}

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
```

### 1.2 Required vs Optional Fields

| Field         | Required | Rationale                                          |
| ------------- | -------- | -------------------------------------------------- |
| companyName   | Yes      | Minimum context for agents to identify "our company" |
| industry      | Yes      | Enables role-specific domain expertise              |
| productName   | Yes      | Core subject of meeting discussions                 |
| All others    | No       | Agents respond generically when absent              |

---

## 2. Maestiq Preset Data (Demo)

A built-in preset for the BizRoom.ai hackathon demo is stored in `frontend/src/constants/brandPresets.ts`:

```json
{
  "companyName": "Maestiq",
  "industry": "AI SaaS / Productivity Tools",
  "foundedDate": "2026-02-11",
  "founderName": "",
  "teamSize": "Solo founder",
  "mission": "Even a one-person business can manage like a Fortune 500",
  "vision": "Democratizing management through AI executives",

  "productName": "BizRoom.ai",
  "productDescription": "3D virtual meeting room with AI C-Suite executives for real-time voice meetings",
  "coreFeatures": [
    "Real-time voice meeting with AI executives + turn-taking",
    "6 C-Suite agents (COO, CFO, CMO, CTO, CDO, CLO) — customizable roles at scale",
    "Real-time data visualization (BigScreen)",
    "Auto-generated meeting minutes / PPT / Excel -> OneDrive"
  ],
  "targetCustomer": "Solo founders, micro-business owners, freelancers",
  "techStack": "Azure Functions, OpenAI Realtime API, Azure SignalR, React Three Fiber, Microsoft Graph API",
  "revenueModel": "Monthly subscription SaaS",
  "pricing": [
    { "name": "Free", "price": "$0", "features": "3 meetings/month, basic summary" },
    { "name": "Pro", "price": "$39/month", "features": "30 meetings + artifacts + OneDrive" },
    { "name": "Team", "price": "$79/month", "features": "Up to 3 participants + custom agent roles" }
  ],

  "marketSize": "150M global solopreneurs, AI SaaS market $30.3B (2026)",
  "competitors": [
    { "name": "ChatGPT", "weakness": "General-purpose AI, no role separation, text-based" },
    { "name": "Microsoft Copilot", "weakness": "1:1 assistant model, no meeting capability" },
    { "name": "Notion AI", "weakness": "Document-centric, no voice meetings" },
    { "name": "Fireflies.ai", "weakness": "Transcription only, no decision participation" }
  ],
  "differentiation": [
    "Role-based AI executives, not a generic chatbot",
    "Real-time voice meetings, not text chat",
    "Decision-making + artifact generation, not just recording",
    "Native Microsoft 365 integration"
  ],

  "currentStage": "MVP complete, hackathon submission ready",
  "funding": "Bootstrapped (self-funded)",
  "goals": "MS AI Dev Days award -> AppSource launch",

  "challenges": [
    "Convey value to hackathon judges within 3 minutes",
    "Ensure real-time demo stability",
    "Build AppSource launch roadmap"
  ],
  "quarterGoal": "Microsoft AI Dev Days hackathon submission and award",
  "meetingObjective": "BizRoom.ai hackathon submission strategy"
}
```

---

## 3. Prompt Injection — Layer 0 Design

### 3.1 Prompt Layer Architecture

The agent prompt system uses a 4-layer structure:

```
Layer 0: Brand Memory (company identity)       <- Injected by AgentFactory
Layer 1: Common rules (BizRoom shared rules)   <- getCommonPrompt()
Layer 2: Role-specific persona (COO/CFO/CMO)   <- getRolePrompt()
Layer 3: Dynamic context (history, agenda)      <- getContextForAgent()
```

### 3.2 Layer 0 Prompt Builder

Implemented in `backend/src/agents/prompts/brandMemory.ts`:

```typescript
export function buildBrandMemoryPrompt(bm: BrandMemorySet): string
```

Key characteristics:
- **Null-safe**: Every optional field is gated — absent fields produce no output
- **Sanitized**: All user inputs pass through `sanitizeForPrompt()` which strips markdown headers and excessive newlines
- **Budget-aware**: Warns (but does not truncate) when exceeding 3,000 characters (~1,200 tokens)
- **Sections**: Company Info, Product/Service, Market, Finance, Challenges, Brand Positioning, External Links

### 3.3 Injection Point

Brand Memory is injected at the `AgentFactory` level in `buildSystemPrompt()`:

```typescript
// backend/src/agents/AgentFactory.ts
function buildSystemPrompt(role: AgentRole, context: AgentContext): string {
  const config = AGENT_CONFIGS[role];
  const basePrompt = config.getSystemPrompt(context);
  const brandPrefix = context.brandMemory
    ? buildBrandMemoryPrompt(context.brandMemory) + "\n\n"
    : "";
  return brandPrefix + basePrompt;
}
```

This approach:
- Requires no changes to individual role prompt files
- Applies identically to `invokeAgent()` and `invokeAgentStream()` (SSE path)
- Places Layer 0 at the top of the system prompt (company context takes priority)

### 3.4 All Invocation Sites

Brand Memory flows through `AgentContext.brandMemory` at every call site:

| File                           | Function             | How brandMemory Reaches It                     |
| ------------------------------ | -------------------- | ---------------------------------------------- |
| `functions/meetingStart.ts`    | `voiceLiveManager`   | Validated and stored via ContextBroker          |
| `functions/message.ts`         | `invokeAgentStream`  | Retrieved from ContextBroker per room           |
| `functions/meetingEnd.ts`      | `invokeAgent`        | Retrieved from ContextBroker per room           |

### 3.5 Prompt Sanitization

User input fields are sanitized before injection to prevent prompt structure corruption:

```typescript
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/^#{1,6}\s/gm, "")     // strip markdown headers
    .replace(/\n{3,}/g, "\n\n")     // collapse excessive newlines
    .trim();
}
```

### 3.6 Token Budget

| Layer   | Budget         | Description                    |
| ------- | -------------- | ------------------------------ |
| Layer 0 | ~1,200 tokens  | Brand Memory (max 3,000 chars) |
| Layer 1 | ~800 tokens    | Common rules                   |
| Layer 2 | ~400 tokens    | Role-specific persona          |
| Layer 3 | ~1,000 tokens  | Dynamic context                |
| Total   | ~3,400 tokens  | Full system prompt             |

The Maestiq full preset generates ~1,800 characters, well within the 3,000-character budget.

### 3.7 Per-Role Brand Memory Usage

Each agent naturally emphasizes different Brand Memory sections based on their domain:

| Agent          | Primary Sections                               | Example Usage                                        |
| -------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Hudson (COO)   | Challenges & priorities, full product overview  | "Our top priority right now is..."                   |
| Amelia (CFO)   | Pricing tiers, market size, finance status      | "At Pro $39/mo, 100 conversions = $3,900 MRR..."    |
| Yusef (CMO)    | Competitors, differentiation, brand copy        | "Unlike ChatGPT, we offer role-based executives..."  |
| Kelvin (CTO)   | Tech stack, external links                      | "Our Azure full-stack architecture..."               |
| Jonas (CDO)    | Product description, target customer            | "The solopreneur's first experience matters..."      |
| Bradley (CLO)  | Industry, competitors, external links           | "AppSource listing requires ISV agreement review..." |

---

## 4. Data Flow

```
[Lobby UI — BrandMemoryForm]
    | BrandMemorySet JSON
    v
[POST /api/meeting/start]
    | body: { roomId, agenda, userId, userName, brandMemory }
    | validateBrandMemory() — required fields + 10KB size limit
    v
[ContextBroker.setBrandMemory(roomId, brandMemory)]
    | room.brandMemory = validatedBrandMemory
    v
[AgentFactory.invokeAgent(role, message, context)]
    | context.brandMemory -> buildBrandMemoryPrompt()
    v
[System Prompt Assembly]
    | Layer 0: buildBrandMemoryPrompt(context.brandMemory)
    | Layer 1: getCommonPrompt()
    | Layer 2: getRolePrompt(role, context)
    | Layer 3: getContextForAgent(roomId, role)
    v
[LLM Call — Anthropic Claude / OpenAI / Azure AI Foundry]
    | Agent responds with company-aware context
    v
[SignalR -> Frontend]
```

---

## 5. Frontend — Brand Memory Input UI

### 5.1 Multi-Step Lobby Flow

Implemented in `frontend/src/components/lobby/LobbyPage.tsx`:

```
Step 1: Name Input  ->  Step 2: Brand Memory  ->  Step 3: Agenda  ->  Meeting Room
```

The lobby uses a `LobbyStep` type: `"name" | "brandMemory" | "agenda" | "entering"`, with a visual progress indicator (3-step bar).

### 5.2 BrandMemoryForm Component

Located at `frontend/src/components/lobby/BrandMemoryForm.tsx`:

- **Preset selection**: "Maestiq (Demo)" button auto-fills all fields
- **Section-based accordion UI**: Basic Info / Product / Market / Finance / Links / Challenges
- **Only 3 fields highlighted as required**: companyName, industry, productName
- **Skip option**: Users can proceed without filling Brand Memory (agents respond generically)
- **Persistence**: Brand Memory is saved to `sessionStorage` for refresh resilience

### 5.3 Preset System

```typescript
// frontend/src/constants/brandPresets.ts
export const BRAND_PRESETS: Record<string, BrandMemorySet> = {
  maestiq: { /* Full Maestiq preset data */ },
};
export function createEmptyBrandMemory(): BrandMemorySet { ... }
```

---

## 6. Backend Validation

Implemented in `backend/src/functions/meetingStart.ts`:

```typescript
const BRAND_MEMORY_MAX_SIZE = 10_000; // 10KB limit

function validateBrandMemory(bm: unknown): BrandMemorySet | null {
  if (!bm || typeof bm !== "object") return null;
  const b = bm as Record<string, unknown>;
  if (typeof b.companyName !== "string" || !b.companyName.trim()) return null;
  if (typeof b.industry !== "string" || !b.industry.trim()) return null;
  if (typeof b.productName !== "string" || !b.productName.trim()) return null;
  if (JSON.stringify(bm).length > BRAND_MEMORY_MAX_SIZE) return null;
  return bm as BrandMemorySet;
}
```

Validation rules:
- 3 required string fields must be non-empty
- Total serialized payload must not exceed 10KB
- Invalid payloads are silently dropped (meeting proceeds without Brand Memory)

---

## 7. Scope Boundaries

### Modified Files

| Layer    | File                                       | Change                                   |
| -------- | ------------------------------------------ | ---------------------------------------- |
| Shared   | `shared/types.ts`                          | BrandMemorySet + related interfaces      |
| Backend  | `agents/prompts/brandMemory.ts`            | buildBrandMemoryPrompt() Layer 0 builder |
| Backend  | `agents/AgentFactory.ts`                   | buildSystemPrompt() with brand prefix    |
| Backend  | `orchestrator/ContextBroker.ts`            | setBrandMemory / getBrandMemory          |
| Backend  | `functions/meetingStart.ts`                | validateBrandMemory + store              |
| Frontend | `components/lobby/LobbyPage.tsx`           | Multi-step flow with brand memory step   |
| Frontend | `components/lobby/BrandMemoryForm.tsx`     | Accordion form + preset system           |
| Frontend | `constants/brandPresets.ts`                | Maestiq preset data                      |
| Frontend | `context/MeetingContext.tsx`               | SET_BRAND_MEMORY action                  |

### Unchanged (by design)

- Agent role prompts (Layer 2) — no modifications needed
- TurnManager / VoiceLiveOrchestrator — brand memory is prompt-only
- Sophia pipeline — operates on conversation context, not brand memory directly
- BigScreen renderer — no changes
- 3D scene — no changes

---

## 8. Market Data Sources

Market statistics used in the Maestiq demo preset:

- [Solopreneur Statistics 2026](https://founderreports.com/solopreneur-statistics/)
- [Solopreneur Market Size Analysis](https://bizstack.tech/solopreneur-market-size/)
- [AI SaaS Market Forecast 2034](https://www.fortunebusinessinsights.com/ai-saas-market-111182)
- [SMB Software Market Report 2026-2035](https://www.globalgrowthinsights.com/market-reports/small-and-medium-business-smb-software-market-100420)
- [AI Statistics for Small Business 2026](https://colorwhistle.com/artificial-intelligence-statistics-for-small-business/)
