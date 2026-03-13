---
version: "2.0.0"
created: "2026-03-12 16:00"
updated: "2026-03-12 17:00"
---

# Brand Memory Set — Design Spec

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에이전트가 회사 정체성을 인지한 상태로 회의에 참여할 수 있도록, 회의 전 Brand Memory를 설정하고 프롬프트에 주입하는 시스템을 구축한다.

**Architecture:** 로비 UI에서 Brand Memory JSON을 입력/편집 → meetingStart API에 전달 → ContextBroker에 저장 → 에이전트 프롬프트 Layer 0로 주입

**Tech Stack:** React (Frontend Form), Azure Functions (API), ContextBroker (State), Agent Prompt System (Injection)

---

## §1. Brand Memory Set — 데이터 스키마

### 1.1 TypeScript Interface

```typescript
/** Brand Memory Set — required fields + optional sections */
export interface BrandMemorySet {
  // ── 필수 필드 (3개) ──
  companyName: string;           // 회사명
  industry: string;              // 업종
  productName: string;           // 제품명

  // ── 기본 정보 (선택) ──
  foundedDate?: string;          // 설립일 (YYYY-MM-DD)
  founderName?: string;          // 대표자
  teamSize?: string;             // 규모 (예: "1인 창업자")
  mission?: string;              // 미션
  vision?: string;               // 비전

  // ── 제품/서비스 (선택) ──
  productDescription?: string;   // 한줄 설명
  coreFeatures?: string[];       // 핵심 기능 (배열)
  targetCustomer?: string;       // 타겟 고객
  techStack?: string;            // 기술 스택
  revenueModel?: string;         // 수익 모델 요약
  pricing?: PricingTier[];       // 가격 체계

  // ── 시장 데이터 (선택) ──
  marketSize?: string;           // 시장 규모
  marketStats?: string[];        // 주요 통계 (배열)
  competitors?: CompetitorInfo[]; // 경쟁사 정보
  differentiation?: string[];   // 차별화 포인트

  // ── 재무 현황 (선택) ──
  currentStage?: string;         // 현재 단계
  funding?: string;              // 투자 현황
  goals?: string;                // 목표

  // ── 외부 링크 (선택) ──
  links?: ExternalLink[];        // 외부 링크 배열

  // ── 현재 도전 & 우선순위 (선택) ──
  challenges?: string[];         // 현재 도전 (배열, 최대 3개)
  quarterGoal?: string;          // 이번 분기 목표
  meetingObjective?: string;     // 이번 회의 목표

  // ── 브랜드 카피 (선택) ──
  brandCopy?: string;            // 메인 카피
  subCopy?: string;              // 서브 카피
  positioning?: string;          // 포지셔닝 한줄
}

export interface PricingTier {
  name: string;                 // 티어명 (Free, Pro, Team)
  price: string;                // 가격 (예: "$39/월")
  features: string;             // 설명
}

export interface CompetitorInfo {
  name: string;                 // 경쟁사명
  weakness: string;             // 약점/한계
}

export interface ExternalLink {
  label: string;                // 표시명
  url: string;                  // URL (빈 문자열 허용 — 런칭 예정 등)
}
```

### 1.2 필수/선택 필드

| 필드            | 필수 여부 | 이유                                       |
| --------------- | --------- | ------------------------------------------ |
| companyName     | 필수      | 에이전트가 "우리 회사"를 인지하는 최소 정보 |
| industry        | 필수      | 역할별 전문성 발휘에 필요                  |
| productName     | 필수      | 회의 주제의 핵심 대상                      |
| 나머지 전부     | 선택      | 없으면 에이전트가 일반적으로 대응           |

---

## §2. Maestiq 프리셋 데이터 (데모용)

```json
{
  "companyName": "Maestiq",
  "industry": "AI SaaS / 생산성 도구",
  "foundedDate": "2026-02-11",
  "founderName": "",
  "teamSize": "1인 창업자",
  "mission": "1인 기업도 대기업처럼 경영할 수 있다",
  "vision": "AI 임원진과 함께하는 경영의 민주화",

  "productName": "BizRoom.ai",
  "productDescription": "AI C-Suite 가상 임원진과 실시간 음성 회의하는 3D 가상 회의실",
  "coreFeatures": [
    "AI 임원진 실시간 음성 회의 + 턴테이킹",
    "기본 C-Suite 6명 (COO, CFO, CMO, CTO, CDO, CLO) — 상용화 시 업종·필요에 맞게 역할 커스텀 가능",
    "실시간 데이터 시각화 (BigScreen)",
    "회의록/PPT/Excel 자동 생성 → OneDrive 저장"
  ],
  "targetCustomer": "1인 창업자, 마이크로 기업 대표, 프리랜서",
  "techStack": "Azure Functions, Azure OpenAI (GPT-4o), Azure SignalR, React Three Fiber, Microsoft Graph API, Azure AI Speech",
  "revenueModel": "월 구독 SaaS",
  "pricing": [
    { "name": "Free", "price": "무료", "features": "월 3회 회의, 기본 요약" },
    { "name": "Pro", "price": "$39/월", "features": "월 30회 회의 + 산출물 생성 + OneDrive 연동" },
    { "name": "Team", "price": "$79/월", "features": "최대 3명 참여 + 커스텀 에이전트 역할" }
  ],

  "marketSize": "글로벌 솔로프리너 1.5억 명, AI SaaS 시장 $303억 (2026)",
  "marketStats": [
    "글로벌 1인 기업 1.5억 명 (2025 기준)",
    "미국 1인 기업 2,980만 명, 연 매출 $1.7조",
    "미국 전체 사업체의 84%가 무고용 사업체",
    "AI SaaS 시장 $303억 (2026), CAGR 36.6%",
    "SMB 소프트웨어 시장 $801억 (2026)",
    "SMB 63%가 매일 AI 사용 (2025 조사)"
  ],
  "competitors": [
    { "name": "ChatGPT", "weakness": "범용 AI, 역할 구분 없음, 텍스트 기반" },
    { "name": "Microsoft Copilot", "weakness": "1:1 어시스턴트 구조, 회의 기능 없음" },
    { "name": "Notion AI", "weakness": "문서 중심, 음성 회의 불가" },
    { "name": "Fireflies.ai", "weakness": "회의록 전사만, 의사결정 참여 불가" }
  ],
  "differentiation": [
    "범용 AI가 아닌 '역할 기반 AI 임원진'",
    "텍스트가 아닌 '실시간 음성 회의'",
    "기록이 아닌 '의사결정 + 산출물 생성'",
    "Microsoft 365 네이티브 통합"
  ],

  "currentStage": "MVP 완성, 해커톤 출품 준비 중",
  "funding": "부트스트래핑 (자기자본)",
  "goals": "MS AI Dev Days 수상 → AppSource 런칭",

  "links": [
    { "label": "GitHub", "url": "https://github.com/maestiq/bizroom" },
    { "label": "AppSource", "url": "(런칭 예정)" },
    { "label": "Azure Portal", "url": "https://portal.azure.com" },
    { "label": "MS AI Dev Days", "url": "https://devdays.microsoft.com" }
  ],

  "challenges": [
    "해커톤 심사위원에게 3분 안에 가치 전달",
    "실시간 데모 안정성 확보",
    "AppSource 런칭 로드맵 수립"
  ],
  "quarterGoal": "Microsoft AI Dev Days 해커톤 출품 및 수상",
  "meetingObjective": "BizRoom.ai 해커톤 출품 전략 준비",

  "brandCopy": "월 $39에 임원진과 오피스를 임대하세요",
  "subCopy": "AI C-Suite와 가상 회의실, 이제 혼자가 아닙니다",
  "positioning": "LLM을 시각화한 경험 플랫폼 — AI 모델이 아닌 AI 경영 경험을 제공"
}
```

---

## §3. 프롬프트 주입 — Layer 0 설계

### 3.1 주입 위치

현재 에이전트 프롬프트는 3-레이어 구조:

```
Layer 1: Common (BizRoom 공통 규칙)
Layer 2: Role-Specific (COO/CFO/CMO 등)
Layer 3: Dynamic Context (참석자, 안건, 대화 이력)
```

Brand Memory를 **Layer 0**로 추가하여 모든 에이전트가 회사 정보를 공유:

```
Layer 0: Brand Memory (회사 정체성)     ← NEW
Layer 1: Common (BizRoom 공통 규칙)
Layer 2: Role-Specific (역할별 전문성)
Layer 3: Dynamic Context (실시간 맥락)
```

### 3.2 Layer 0 프롬프트 빌더

> **NOTE**: 프롬프트 템플릿의 한국어 섹션 헤더는 i18n 대상이 아님 (에이전트 운영 언어).

```typescript
/** Helper — 값이 있을 때만 줄을 추가 */
function line(label: string, value?: string): string {
  return value ? `${label}: ${value}\n` : '';
}
function list(items?: string[]): string {
  return items?.length ? items.map(i => `- ${i}`).join('\n') + '\n' : '';
}

/** Build Layer 0 prompt from Brand Memory (null-safe for optional fields) */
export function buildBrandMemoryPrompt(bm: BrandMemorySet): string {
  const sections: string[] = [];

  // 기본 정보 (필수 3개 + 선택)
  let s = `## 당신이 속한 회사 정보\n\n`;
  s += `회사명: ${bm.companyName}\n`;
  s += `업종: ${bm.industry}\n`;
  s += line('설립일', bm.foundedDate);
  s += line('대표', bm.founderName);
  s += line('규모', bm.teamSize);
  s += line('미션', bm.mission);
  s += line('비전', bm.vision);
  sections.push(s);

  // 제품/서비스
  let p = `## 제품/서비스\n\n`;
  p += `제품명: ${bm.productName}\n`;
  p += line('설명', bm.productDescription);
  if (bm.coreFeatures?.length) p += `핵심 기능:\n${list(bm.coreFeatures)}`;
  p += line('타겟 고객', bm.targetCustomer);
  p += line('기술 스택', bm.techStack);
  p += line('수익 모델', bm.revenueModel);
  if (bm.pricing?.length) p += `가격:\n${bm.pricing.map(t => `- ${t.name} (${t.price}): ${t.features}`).join('\n')}\n`;
  sections.push(p);

  // 시장 (선택) — Review Fix #3: differentiation 독립 게이트
  if (bm.marketSize || bm.marketStats?.length || bm.competitors?.length || bm.differentiation?.length) {
    let m = `## 시장\n\n`;
    m += line('시장 규모', bm.marketSize);
    if (bm.marketStats?.length) m += `주요 통계:\n${list(bm.marketStats)}`;
    if (bm.competitors?.length) m += `경쟁사:\n${bm.competitors.map(c => `- ${c.name}: ${c.weakness}`).join('\n')}\n`;
    if (bm.differentiation?.length) m += `차별화:\n${list(bm.differentiation)}`;
    sections.push(m);
  }

  // 도전 & 목표 (선택) — Review Fix #3: meetingObjective 독립 게이트
  if (bm.challenges?.length || bm.meetingObjective) {
    let c = `## 현재 도전\n\n`;
    if (bm.challenges?.length) c += bm.challenges.map((ch, i) => `${i + 1}. ${ch}`).join('\n') + '\n';
    c += line('이번 회의 목표', bm.meetingObjective);
    sections.push(c);
  }

  // 브랜드 포지셔닝 (선택) — Review Fix #3: subCopy 포함
  if (bm.brandCopy || bm.subCopy || bm.positioning) {
    let b = `## 브랜드 포지셔닝\n\n`;
    if (bm.brandCopy) b += `카피: "${bm.brandCopy}"\n`;
    if (bm.subCopy) b += `서브 카피: "${bm.subCopy}"\n`;
    b += line('포지셔닝', bm.positioning);
    sections.push(b);
  }

  sections.push(`위 정보를 바탕으로 발언하되, 정보를 그대로 나열하지 말고 자연스럽게 맥락에 녹여서 사용하세요.`);

  return sections.join('\n');
}
```

### 3.3 주입 포인트 (Review Fix #1)

> `getCommonPrompt()`는 인자를 받지 않으므로, Layer 0는 **AgentFactory.invokeAgent()** 에서 주입한다.

```typescript
// AgentFactory.ts — invokeAgent() 내부
const systemPrompt = config.getSystemPrompt(context);
const brandPrefix = context.brandMemory
  ? buildBrandMemoryPrompt(context.brandMemory)
  : '';
const fullPrompt = brandPrefix + '\n' + systemPrompt;
```

이 방식의 장점:
- 개별 role prompt 파일 수정 불필요 (6개 파일 무변경)
- `invokeAgentStream()`에도 동일하게 적용
- Layer 0가 시스템 프롬프트 최상단에 위치 (회사 컨텍스트 우선)

### 3.4 모든 호출 사이트 반영 (Review Fix #2)

brandMemory를 전달하는 호출 사이트 3곳 모두 수정 필요:

| 파일                              | 함수            | 조치                                          |
| --------------------------------- | --------------- | --------------------------------------------- |
| `functions/meetingStart.ts`       | `invokeAgent()` | ContextBroker에서 brandMemory 읽어서 context에 포함 |
| `functions/message.ts`            | `invokeAgent()` | 동일                                          |
| `functions/meetingEnd.ts`         | `invokeAgent()` | 동일                                          |

### 3.5 프롬프트 새니타이징 (Review Fix #4)

사용자 입력 필드가 프롬프트 구조를 오염시키지 않도록 기본 새니타이저 적용:

```typescript
/** Strip markdown headers and excessive newlines from user input */
function sanitizeForPrompt(value: string): string {
  return value
    .replace(/^#{1,6}\s/gm, '')     // markdown headers
    .replace(/\n{3,}/g, '\n\n')     // excessive newlines
    .trim();
}
```

`buildBrandMemoryPrompt()` 내 모든 `line()` 호출에서 `sanitizeForPrompt()` 적용.
프리셋 데이터는 이 새니타이저를 통과해도 내용이 변하지 않음 (데모 안전).

### 3.6 토큰 예산 관리

Layer 0 프롬프트는 최대 **3,000자** (약 1,200 토큰)로 설정.
- Maestiq 풀 프리셋: 약 1,800자 → 충분한 여유
- 데모에서 잘리는 일 없도록 넉넉하게 설정
- 초과 시 경고 로그만 출력 (자동 생략하지 않음 — 데모 안전 우선)
- 전체 시스템 프롬프트 예산: Layer 0 (1,200) + Layer 1 (800) + Layer 2 (400) + Layer 3 (1,000) ≈ 3,400 토큰

### 3.3 역할별 Brand Memory 활용 가이드

에이전트마다 Brand Memory의 다른 섹션을 중점 참조:

| 에이전트         | 중점 참조 섹션                           | 활용 예시                                            |
| ---------------- | ---------------------------------------- | ---------------------------------------------------- |
| Hudson (COO)     | 도전 & 우선순위, 제품 전체               | "우리 Maestiq의 현재 최우선 과제는..."               |
| Amelia (CFO)     | 가격 체계, 시장 규모, 재무 현황          | "Pro $39 기준 월 100명 전환 시 MRR $3,900..."        |
| Yusef (CMO)      | 경쟁사, 차별화, 브랜드 카피, 타겟 고객   | "ChatGPT와 달리 우리는 역할 기반 임원진..."          |
| Kelvin (CTO)     | 기술 스택, 외부 링크                     | "Azure Functions + SignalR + Graph API 풀스택..."    |
| Jonas (CDO)      | 제품 설명, 타겟 고객, 핵심 기능          | "솔로프리너의 첫 경험이 중요합니다..."               |
| Bradley (CLO)    | 업종, 경쟁사, 외부 링크                  | "AppSource 등록 시 ISV 약관 검토가..."               |

---

## §4. 데이터 흐름

```
[로비 UI — Brand Memory Form]
    │ BrandMemorySet JSON
    ▼
[POST /api/meeting/start]
    │ body: { roomId, agenda, userId, userName, brandMemory }
    ▼
[ContextBroker.setRoomBrandMemory(roomId, brandMemory)]
    │ room.brandMemory = brandMemory
    ▼
[AgentFactory.invokeAgent(role, message, context)]
    │ context.brandMemory → buildBrandMemoryPrompt()
    ▼
[System Prompt Assembly]
    │ Layer 0: buildBrandMemoryPrompt(context.brandMemory)
    │ Layer 1: getCommonPrompt()
    │ Layer 2: getRolePrompt(role, context)
    │ Layer 3: getDynamicContext(roomId, role)
    ▼
[Azure OpenAI GPT-4o]
    │ Agent responds with company-aware context
    ▼
[SignalR → Frontend]
```

---

## §5. Frontend — Brand Memory 입력 UI

### 5.1 위치

로비 → "회의 시작" 플로우 사이에 Brand Memory 설정 단계 추가:

```
로비 (이름 입력) → Brand Memory 설정 → 안건 입력 → 회의실 입장
```

### 5.2 UI 구성

- **프리셋 선택**: "Maestiq (데모)" 프리셋 버튼 → 자동 채움
- **섹션별 아코디언**: 기본정보 / 제품 / 시장 / 재무 / 링크 / 도전
- **필수 필드 3개만 강조**: 회사명, 업종, 제품명
- **나머지는 접힌 상태**: 펼치면 편집 가능
- **JSON 직접 입력 모드**: 고급 사용자용 토글

### 5.3 프리셋 시스템

```typescript
// constants/brandPresets.ts
export const BRAND_PRESETS: Record<string, BrandMemorySet> = {
  maestiq: { /* §2의 Maestiq 프리셋 데이터 */ },
  // 향후 확장: 업종별 템플릿 (이커머스, 컨설팅, 개발 등)
};
```

---

## §6. 데모 시나리오 스크립트

### 회의 주제
> "Maestiq 신사업 BizRoom.ai — Microsoft AI Dev Days 해커톤 출품 준비"

### 플로우

```
시간   화자          행동/대사                                 시연 기능
─────────────────────────────────────────────────────────────────────────
0:00   Chairman     (로비에서 Brand Memory 프리셋 선택)       Brand Memory UI
                    (Maestiq 데이터 자동 채워짐 확인)
                    (안건 입력: "BizRoom 해커톤 출품 전략")
                    (회의실 입장)
─────────────────────────────────────────────────────────────────────────
0:15   Chairman     "오늘 안건은 우리 신사업 BizRoom.ai를     음성 입력
                     마이크로소프트 해커톤에 출품하는
                     전략입니다"
─────────────────────────────────────────────────────────────────────────
0:30   Hudson(COO)  "네, 해커톤 출품 준비 상황을              TurnManager
                     정리해보겠습니다. 현재 MVP는
                     완성된 상태이고..."
                    → key_points + checklist visual_hint
─────────────────────────────────────────────────────────────────────────
0:45   Sophia       "체크리스트를 빅스크린에 띄웠습니다"      Sophia 알림
       BigScreen    ☑ MVP 기능 완성                          checklist 시각화
                    ☑ 음성 회의 구현
                    ☑ AI 에이전트 6명
                    ☐ 데모 영상 촬영
                    ☐ AppSource 등록
─────────────────────────────────────────────────────────────────────────
       Monitor      [Hudson 발언 요약 key_points]             HoloMonitor3D
─────────────────────────────────────────────────────────────────────────
1:00   Yusef(CMO)   "경쟁 제품 대비 차별점을 강조해야         멘션 기반 발화
                     합니다. ChatGPT, Copilot과 달리
                     우리는 역할 기반 임원진입니다"
                    → comparison visual_hint
─────────────────────────────────────────────────────────────────────────
1:20   Sophia       "비교 자료 준비됐습니다,                  Sophia 알림
                     스크린을 봐주세요"
       BigScreen    ┌──────────┬──────────┬──────────┐       comparison
                    │ BizRoom  │ ChatGPT  │ Copilot  │
                    ├──────────┼──────────┼──────────┤
                    │ 역할기반 │ 범용     │ 어시스턴트│
                    │ 음성회의 │ 텍스트   │ 텍스트   │
                    │ 6명 임원 │ 1명      │ 1명      │
                    │ 산출물   │ 없음     │ 제한적   │
                    └──────────┴──────────┴──────────┘
─────────────────────────────────────────────────────────────────────────
1:40   Amelia(CFO)  "수익 모델 관점에서, Pro $39 기준         재무 분석
                     월 100명 전환 시 MRR $3,900.
                     AI SaaS 시장이 연 36% 성장 중이니..."
                    → bar-chart visual_hint
─────────────────────────────────────────────────────────────────────────
2:00   BigScreen    [MRR 성장 예측 bar-chart]                 bar-chart
                    M1: $1.5K → M3: $5K → M6: $15K
─────────────────────────────────────────────────────────────────────────
2:15   Kelvin(CTO)  "기술 아키텍처 관점에서,                  기술 설명
                     Azure 풀스택이라는 점을
                     심사위원에게 강조하면 좋겠습니다"
                    → architecture visual_hint
─────────────────────────────────────────────────────────────────────────
2:30   BigScreen    [Azure 아키텍처 다이어그램]               architecture
                    React ─→ SignalR ─→ Functions
                                 ↓
                            Azure OpenAI
                                 ↓
                       Graph API → OneDrive
─────────────────────────────────────────────────────────────────────────
2:45   Hudson(COO)  "Chairman, 데모 방향에 대해               Human Callout
                     A: 음성 회의 중심 시연
                     B: 산출물 생성 중심 시연
                     어떤 방향이 좋겠습니까?"
─────────────────────────────────────────────────────────────────────────
3:00   Chairman     "음성 회의 중심으로 가되,                 Awaiting → 응답
                     마지막에 산출물도 보여주죠"
─────────────────────────────────────────────────────────────────────────
3:10   Jonas(CDO)   "데모 UX 흐름을 정리하면...               디자인 관점
                     로비 → 브랜드 설정 → 회의실 →
                     음성 대화 → 시각화 → 산출물"
                    → timeline visual_hint
─────────────────────────────────────────────────────────────────────────
3:25   BigScreen    [데모 플로우 timeline]                     timeline
                    로비 → 설정 → 회의 → 시각화 → 산출물
                     ●      ●      ●       ●        ○
─────────────────────────────────────────────────────────────────────────
3:35   Chairman     "좋습니다. 이 방향으로 마무리하죠"        회의 종료
─────────────────────────────────────────────────────────────────────────
3:40   Hudson(COO)  "정리하겠습니다.                          회의 요약
                     1. 음성 회의 중심 데모
                     2. 경쟁사 대비 차별화 강조
                     3. 산출물 자동 생성으로 마무리"
─────────────────────────────────────────────────────────────────────────
3:50   System       📎 회의록.pptx → OneDrive 저장            Artifact 생성
                    📎 데이터.xlsx → OneDrive 저장            Graph API
       Sophia       "회의록이 OneDrive에 저장되었습니다"
─────────────────────────────────────────────────────────────────────────
```

### 시연 중 자연 발생하는 기능 목록

| 순서 | 기능                       | 발동 조건                    |
| ---- | -------------------------- | ---------------------------- |
| 1    | Brand Memory 프리셋 로드   | 로비에서 프리셋 선택         |
| 2    | 음성 회의 시작             | Chairman 발화                |
| 3    | TurnManager 턴테이킹       | 에이전트 순차 응답           |
| 4    | checklist 시각화           | COO visual_hint              |
| 5    | HoloMonitor 요약           | 모든 에이전트 key_points     |
| 6    | comparison 시각화          | CMO visual_hint              |
| 7    | Sophia 알림                | 시각화 생성 완료 시          |
| 8    | bar-chart 시각화           | CFO visual_hint              |
| 9    | architecture 시각화        | CTO visual_hint              |
| 10   | Human Callout A/B 선택     | COO mention:chairman         |
| 11   | Awaiting → 응답            | Chairman 답변                |
| 12   | timeline 시각화            | CDO visual_hint              |
| 13   | Artifact 생성 (PPT/Excel)  | 회의 종료 트리거             |
| 14   | OneDrive 저장              | Graph API 호출               |

---

## §7. 구현 범위

### Backend 변경

1. **`shared/types.ts`**: `BrandMemorySet`, `PricingTier`, `CompetitorInfo`, `ExternalLink` 인터페이스 추가. `AgentContext`에 `brandMemory?: BrandMemorySet` 필드 추가.
2. **`backend/src/models/index.ts`**: 새 타입들 re-export 추가.
3. **`backend/src/orchestrator/ContextBroker.ts`**: `RoomContext`에 `brandMemory?: BrandMemorySet` 필드 추가, `setBrandMemory(roomId, bm)` 함수 추가, `getContextForAgent()`가 brandMemory를 context에 포함하도록 수정.
4. **`backend/src/agents/prompts/brandMemory.ts`** (NEW): `buildBrandMemoryPrompt()` 함수 — BrandMemorySet → Layer 0 프롬프트 문자열 변환. null-safe, 토큰 예산 2,000자 제한.
5. **`backend/src/agents/AgentFactory.ts`**: `invokeAgent()` 및 `invokeAgentStream()` 내 시스템 프롬프트 앞에 `buildBrandMemoryPrompt()` prepend (§3.3 참조). `common.ts` 수정 불필요.
6. **`backend/src/functions/meetingStart.ts`**: 요청 body에 `brandMemory` 필드 수용, `validateBrandMemory()` 검증 후 ContextBroker에 저장.
7. **`backend/src/functions/message.ts`**: `invokeAgent()` 호출 시 ContextBroker에서 brandMemory 읽어서 context에 포함 (§3.4).
8. **`backend/src/functions/meetingEnd.ts`**: 동일하게 brandMemory를 context에 포함.

### Backend 검증 규칙

```typescript
// meetingStart.ts 내 검증 함수
function validateBrandMemory(bm: unknown): BrandMemorySet | null {
  if (!bm || typeof bm !== 'object') return null;
  const b = bm as Record<string, unknown>;
  // 필수 필드 검증
  if (typeof b.companyName !== 'string' || b.companyName.length > 100) return null;
  if (typeof b.industry !== 'string' || b.industry.length > 100) return null;
  if (typeof b.productName !== 'string' || b.productName.length > 100) return null;
  // 선택 필드 길이 제한 (각 문자열 최대 500자, 배열 최대 10개)
  // ... (구현 시 상세화)
  return b as unknown as BrandMemorySet;
}
```

### Frontend 변경

9. **`frontend/src/types/index.ts`**: BrandMemorySet 등 re-export.
10. **`frontend/src/constants/brandPresets.ts`** (NEW): Maestiq 프리셋 데이터.
11. **`frontend/src/components/lobby/BrandMemoryForm.tsx`** (NEW): Brand Memory 입력/편집 UI (아코디언 폼 + 프리셋 선택).
12. **`frontend/src/components/lobby/LobbyPage.tsx`**: 회의 시작 플로우를 multi-step으로 변경: `step: 'name' | 'brandMemory' | 'agenda' | 'entering'`. Brand Memory + 안건 단계 삽입. brandMemory는 sessionStorage에 저장하여 새로고침 시에도 유지.
13. **`frontend/src/context/MeetingContext.tsx`**: `brandMemory: BrandMemorySet | null` 상태 추가, `SET_BRAND_MEMORY` 액션 추가.
14. **`frontend/src/hooks/useSessionRoom.ts`**: `createRoom()` 분리 — room 생성과 room 입장을 별도 단계로 (multi-step 지원).

### 변경하지 않는 것

- 에이전트 역할별 프롬프트 (Layer 2) — 기존 유지, common.ts에서 Layer 0 주입하므로 수정 불필요
- TurnManager, VoiceLiveOrchestrator — 변경 불필요
- Sophia 파이프라인 — 변경 불필요 (Brand Memory는 에이전트 프롬프트에만 영향)
- BigScreen 렌더러 — 변경 불필요

---

## §8. 데이터 소스

시장 데이터 출처 (Brand Memory 프리셋에 사용):

- [Solopreneur Statistics 2026](https://founderreports.com/solopreneur-statistics/)
- [Solopreneur Market Size Analysis](https://bizstack.tech/solopreneur-market-size/)
- [AI SaaS Market Forecast 2034](https://www.fortunebusinessinsights.com/ai-saas-market-111182)
- [SMB Software Market Report 2026-2035](https://www.globalgrowthinsights.com/market-reports/small-and-medium-business-smb-software-market-100420)
- [AI Statistics for Small Business 2026](https://colorwhistle.com/artificial-intelligence-statistics-for-small-business/)
