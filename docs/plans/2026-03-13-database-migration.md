---
version: "1.1.0"
created: "2026-03-13 20:40"
updated: "2026-03-14 15:00"
---

# BizRoom.ai — Database & Storage Migration Plan

> **목적**: 인메모리 → Azure Cosmos DB + Blob Storage 마이그레이션
> **빌드**: Azure CLI + TypeScript
> **MS 생태계**: Cosmos DB (NoSQL) + Azure Blob Storage + OneDrive API

---

## 1. 기술 선택 근거

### Why Azure Cosmos DB (NoSQL)?

| 기준                  | Cosmos DB                                    | Azure SQL                     |
| --------------------- | -------------------------------------------- | ----------------------------- |
| 데이터 구조           | JSON 문서 (에이전트 응답, Brand Memory)       | 정규화 테이블                 |
| 스키마 유연성         | 스키마리스 (에이전트 응답 구조 변동 가능)     | 고정 스키마                   |
| Azure Functions 통합  | 네이티브 바인딩 + Trigger 지원               | SDK 필요                      |
| 비용 (해커톤)         | Serverless: 사용한 RU만 과금                 | 최소 DTU 과금                 |
| 글로벌 SaaS 확장      | 멀티리전 자동 복제                           | Read Replica 수동 설정        |
| 세션/히스토리 쿼리    | 파티션키 기반 빠른 조회                      | JOIN 필요                     |

**결론: Cosmos DB Serverless (NoSQL API)**

### 파일 스토리지

| 용도                  | 기술                                          |
| --------------------- | --------------------------------------------- |
| 산출물 (PPT, Excel)   | OneDrive (기존 GraphService 활용)             |
| 시각화 스냅샷         | Azure Blob Storage (회의별 폴더 구조)         |
| 음성 녹음 (향후)      | Azure Blob Storage (media 컨테이너)           |

---

## 2. 데이터 모델 (Cosmos DB Containers)

### Container 구조

```
bizroom-db (Database)
├── users              — 사용자 계정 + Brand Memory
├── rooms              — 방 정보 + 입장코드
├── sessions           — 미팅 세션 (일자별 히스토리)
├── messages           — 대화 메시지 (미팅 + DM)
└── artifacts          — 산출물 메타데이터 (파일은 Blob/OneDrive)
```

### 2.1 users Container

```typescript
// Partition Key: /id
interface UserDocument {
  id: string;                    // userId (GUID)
  type: "user";
  email: string;
  displayName: string;
  createdAt: string;             // ISO 8601

  // Brand Memory (온보딩 시 저장)
  brandMemory: {
    presetId?: string;           // brandPresets.ts의 프리셋 ID
    companyName: string;
    industry: string;
    targetCustomer: string;
    mainProducts: string;
    competitors?: string;
    additionalContext?: string;  // 사용자 추가 입력
  };

  // 설정
  preferences: {
    language: string;            // "ko" | "en"
    defaultMeetingMode: string;  // "live" | "auto"
  };
}
```

### 2.2 rooms Container

```typescript
// Partition Key: /id
interface RoomDocument {
  id: string;                    // roomId (GUID)
  type: "room";
  name: string;                  // 방 이름
  createdBy: string;             // userId
  createdAt: string;

  // 입장코드 (6자리 영숫자)
  joinCode: string;              // e.g., "BZ3K9M"
  joinCodeExpiresAt?: string;    // 코드 만료 시간 (optional)

  // 설정
  maxParticipants: number;       // default: 1 (MVP), 확장: 10
  isActive: boolean;

  // 참가자
  participants: Array<{
    userId: string;
    role: "chairman" | "member";
    joinedAt: string;
  }>;

  // 세션 참조
  currentSessionId?: string;     // 진행 중인 세션
  totalSessions: number;
}
```

### 2.3 sessions Container

```typescript
// Partition Key: /roomId  (같은 방의 세션을 빠르게 조회)
interface SessionDocument {
  id: string;                    // sessionId (GUID)
  type: "session";
  roomId: string;                // FK → rooms

  // 타임라인
  startedAt: string;
  endedAt?: string;
  duration?: number;             // seconds

  // 회의 메타
  agenda: string;
  phase: "idle" | "open" | "discuss" | "decide" | "act" | "closing";
  mode: "live" | "auto" | "dm";

  // Brand Memory 스냅샷 (회의 시점 고정)
  brandMemorySnapshot: object;

  // 요약 (회의 종료 시 LLM 생성)
  summary?: {
    keyPoints: string[];
    decisions: string[];
    actionItems: Array<{
      task: string;
      assignee: string;
      deadline?: string;
    }>;
  };

  // 시각화 히스토리 (BigScreen에 표시된 것들)
  visualizations: Array<{
    timestamp: string;
    type: string;                // "chart" | "comparison" | "swot" | ...
    title: string;
    renderData: object;          // BigScreenRenderData
    blobUrl?: string;            // 스냅샷 이미지 URL
  }>;

  // 산출물 참조
  artifactIds: string[];

  // 참가자 (세션 시점)
  participants: Array<{
    userId: string;
    role: string;
  }>;
}
```

### 2.4 messages Container

```typescript
// Partition Key: /sessionId  (세션별 메시지 묶어서 조회)
interface MessageDocument {
  id: string;                    // messageId (GUID)
  type: "meeting-message" | "dm-message";
  sessionId: string;             // FK → sessions (meeting) 또는 DM 세션 ID
  roomId: string;                // FK → rooms

  // 발신자
  senderId: string;              // userId 또는 "agent-coo"
  senderType: "human" | "agent";
  senderName: string;
  senderRole?: string;           // "coo" | "cfo" | "cmo" | "chairman"

  // 내용
  content: string;               // 텍스트 내용
  timestamp: string;

  // 에이전트 구조화 응답 (agent만)
  structured?: {
    keyPoints: string[];
    mention?: object;
    visualHint?: object;
  };

  // DM 전용
  dmTarget?: string;             // DM 상대 에이전트 role

  // TTL (선택: 오래된 메시지 자동 삭제)
  _ttl?: number;                 // seconds (-1 = 영구)
}
```

### 2.5 artifacts Container

```typescript
// Partition Key: /roomId
interface ArtifactDocument {
  id: string;                    // artifactId (GUID)
  type: "artifact";
  roomId: string;
  sessionId: string;

  // 파일 정보
  fileName: string;              // "회의록.pptx"
  fileType: "pptx" | "xlsx" | "pdf" | "planner";
  fileSize?: number;             // bytes

  // 저장 위치
  storage: "onedrive" | "blob";
  storageUrl: string;            // OneDrive webUrl 또는 Blob URL
  driveItemId?: string;          // OneDrive item ID (다운로드용)

  // 메타
  createdAt: string;
  createdBy: string;             // "sophia" | userId

  // Planner 전용
  plannerTaskIds?: string[];
}
```

---

## 3. 인덱싱 정책 (컨테이너별 화이트리스트)

> 원칙: 모든 경로 제외 후 필요한 경로만 포함 (화이트리스트). 대용량 텍스트(`content`, `structured`, `visualizations`, `brandMemorySnapshot`)는 인덱싱 제외 → 쓰기 50-80% RU 절감.

### users

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "excludedPaths": [ { "path": "/*" } ],
  "includedPaths": [
    { "path": "/id/?" },
    { "path": "/email/?" },
    { "path": "/preferences/language/?" },
    { "path": "/brandMemory/presetId/?" }
  ]
}
```

### rooms

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "excludedPaths": [ { "path": "/*" } ],
  "includedPaths": [
    { "path": "/id/?" },
    { "path": "/joinCode/?" },
    { "path": "/createdBy/?" },
    { "path": "/isActive/?" }
  ]
}
```

### sessions

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "excludedPaths": [ { "path": "/*" } ],
  "includedPaths": [
    { "path": "/roomId/?" },
    { "path": "/startedAt/?" },
    { "path": "/phase/?" }
  ]
}
```

### messages

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "excludedPaths": [ { "path": "/*" }, { "path": "/content/*" }, { "path": "/structured/*" } ],
  "includedPaths": [
    { "path": "/sessionId/?" },
    { "path": "/timestamp/?" },
    { "path": "/senderId/?" },
    { "path": "/type/?" }
  ]
}
```

### artifacts

```json
{
  "indexingMode": "consistent",
  "automatic": true,
  "excludedPaths": [ { "path": "/*" } ],
  "includedPaths": [
    { "path": "/roomId/?" },
    { "path": "/sessionId/?" },
    { "path": "/driveItemId/?" },
    { "path": "/createdBy/?" }
  ]
}
```

---

## 4. 핵심 쿼리 패턴

### 4.1 세션 히스토리 (날짜별 목록)

```sql
SELECT s.id, s.startedAt, s.endedAt, s.agenda, s.summary.keyPoints
FROM sessions s
WHERE s.roomId = @roomId
ORDER BY s.startedAt DESC
OFFSET 0 LIMIT 20
```

> 파티션키 = roomId → 단일 파티션 쿼리, 매우 빠름

### 4.2 세션 상세 (LLM 히스토리처럼)

```sql
SELECT *
FROM messages m
WHERE m.sessionId = @sessionId
ORDER BY m.timestamp ASC
```

> 파티션키 = sessionId → 전체 대화 한 번에 로드

### 4.3 입장코드로 방 찾기

```sql
SELECT * FROM rooms r WHERE r.joinCode = @code AND r.isActive = true
```

> joinCode에 인덱스 설정됨

### 4.4 DM 대화 내역

```sql
SELECT * FROM messages m
WHERE m.sessionId = @dmSessionId AND m.type = "dm-message"
ORDER BY m.timestamp ASC
```

---

## 5. API 엔드포인트 추가

### 사용자/인증

| Method | Route                         | 설명                        |
| ------ | ----------------------------- | --------------------------- |
| POST   | `/api/user/register`          | 사용자 등록 + Brand Memory  |
| GET    | `/api/user/:id`               | 사용자 정보 조회            |
| PUT    | `/api/user/:id/brand-memory`  | Brand Memory 수정           |

### 방 관리

| Method | Route                         | 설명                        |
| ------ | ----------------------------- | --------------------------- |
| POST   | `/api/room/create`            | 방 생성 + 입장코드 발급     |
| POST   | `/api/room/join-by-code`      | 입장코드로 방 참가          |
| GET    | `/api/room/:id`               | 방 정보 조회                |

### 세션 히스토리

| Method | Route                         | 설명                           |
| ------ | ----------------------------- | ------------------------------ |
| GET    | `/api/room/:id/sessions`      | 세션 목록 (날짜순, 페이지네이션) |
| GET    | `/api/session/:id`            | 세션 상세 (요약, 시각화 등)    |
| GET    | `/api/session/:id/messages`   | 세션 대화 내역 전체            |

### DM

| Method | Route                         | 설명                        |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/api/dm/:roomId/:agentRole`  | DM 대화 히스토리            |

### 산출물

| Method | Route                         | 설명                        |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/api/room/:id/artifacts`     | 방의 산출물 목록            |
| GET    | `/api/artifact/:id/download`  | 산출물 다운로드 URL         |

---

## 6. 마이그레이션 계획 (인메모리 → Cosmos DB)

### Phase 1: Cosmos DB 인프라 셋업

```bash
# Azure CLI
az cosmosdb create \
  --name bizroom-cosmos \
  --resource-group BizRoom_app \
  --kind GlobalDocumentDB \
  --capabilities EnableServerless \
  --locations regionName=centralus

az cosmosdb sql database create \
  --account-name bizroom-cosmos \
  --resource-group BizRoom_app \
  --name bizroom-db

# Containers 생성 (각각)
az cosmosdb sql container create \
  --account-name bizroom-cosmos \
  --resource-group BizRoom_app \
  --database-name bizroom-db \
  --name users --partition-key-path /id

az cosmosdb sql container create \
  --name rooms --partition-key-path /id

az cosmosdb sql container create \
  --name sessions --partition-key-path /roomId

az cosmosdb sql container create \
  --name messages --partition-key-path /sessionId

az cosmosdb sql container create \
  --name artifacts --partition-key-path /roomId
```

### Phase 2: 백엔드 서비스 레이어

```
backend/src/services/
├── CosmosService.ts       — Cosmos DB 클라이언트 + CRUD 헬퍼
├── UserService.ts         — 사용자 CRUD + Brand Memory
├── RoomService.ts         — 방 CRUD + 입장코드 생성/검증
├── SessionService.ts      — 세션 CRUD + 히스토리 쿼리
├── MessageService.ts      — 메시지 저장/조회 (meeting + DM)
└── ArtifactService.ts     — (기존) + Cosmos 메타데이터 저장
```

**CosmosService.ts (핵심)**

```typescript
import { CosmosClient, Database, Container } from "@azure/cosmos";

let client: CosmosClient;
let db: Database;

export function getCosmosClient(): CosmosClient {
  if (!client) {
    client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT!,
      key: process.env.COSMOS_KEY!,
    });
    db = client.database("bizroom-db");
  }
  return client;
}

export function getContainer(name: string): Container {
  getCosmosClient();
  return db.container(name);
}

// Generic CRUD helpers
export async function createItem<T>(container: string, item: T): Promise<T> {
  const { resource } = await getContainer(container).items.create(item);
  return resource as T;
}

export async function upsertItem<T>(container: string, item: T): Promise<T> {
  const { resource } = await getContainer(container).items.upsert(item);
  return resource as T;
}

export async function queryItems<T>(
  container: string,
  query: string,
  parameters: Array<{ name: string; value: unknown }>
): Promise<T[]> {
  const { resources } = await getContainer(container).items
    .query({ query, parameters })
    .fetchAll();
  return resources as T[];
}
```

### Phase 3: ContextBroker 마이그레이션

```
현재 (인메모리)              →  마이그레이션 후 (Cosmos DB)
─────────────────────────     ─────────────────────────────
Map<roomId, RoomState>       →  rooms + sessions containers
RoomState.messages           →  messages container
RoomState.brandMemory        →  users container
RoomState.decisions          →  sessions.summary.decisions
```

**전략: Dual-Write → Switch → Remove (Feature Flag 기반)**

환경변수:
- `MIGRATE_DUAL_WRITE=true` — DB 동시 기록 활성화
- `READ_FROM_DB=true` — DB 우선 읽기 전환

1. `ContextBroker`에 Cosmos 저장 로직 추가 (`MIGRATE_DUAL_WRITE=true` 시 인메모리 + DB 동시 기록)
2. `READ_FROM_DB=true`로 읽기를 Cosmos로 전환 (인메모리는 캐시 역할)
3. 안정화 후 인메모리 전용 코드 제거, feature flag 정리

### Phase 4: 프론트엔드 — 세션 히스토리 UI

```
frontend/src/
├── components/
│   └── history/
│       ├── SessionList.tsx       — 날짜별 세션 카드 목록
│       ├── SessionDetail.tsx     — 세션 상세 (대화 + 시각화 리플레이)
│       └── SessionTimeline.tsx   — 타임라인 뷰 (시각화 스냅샷)
├── hooks/
│   ├── useSessions.ts            — GET /api/room/:id/sessions
│   └── useSessionMessages.ts     — GET /api/session/:id/messages
```

---

## 7. 환경변수 추가

```env
# Cosmos DB
COSMOS_ENDPOINT=https://bizroom-cosmos.documents.azure.com:443/
COSMOS_KEY=<primary-key>
COSMOS_DATABASE=bizroom-db

# Migration Feature Flags
MIGRATE_DUAL_WRITE=false
READ_FROM_DB=false
```

---

## 8. 의존성 추가

```bash
cd backend
npm install @azure/cosmos
```

---

## 9. 비용 예측 (Serverless)

### 가정 (해커톤 POC)
- 총 미팅: 50회, 메시지/미팅: 200 → 총 메시지 10,000건
- 평균 문서 크기: 5 KB
- Serverless RU 가격: $0.282 / 1,000,000 RU
- 화이트리스트 인덱싱 적용 시 쓰기 평균 5 RU/문서

### RU 소비 계산
- 메시지 쓰기: 10,000 × 5 RU = 50,000 RU
- 메시지 읽기/쿼리: 5,000 reads × 1 RU + 500 queries × 5 RU = 7,500 RU
- 기타 (세션 생성, summary, artifacts): ~2,500 RU
- **총 RU ≈ 60,000 → $0.02**

### 비용 요약

| 항목                 | 예상 비용 (월)          |
| -------------------- | ----------------------- |
| Cosmos DB RU         | ~$0.02                  |
| Cosmos DB 스토리지   | ~$0.01 (0.05 GB)       |
| Blob Storage         | ~$0.25 (시각화 스냅샷)  |
| OneDrive             | 무료 (5GB 기본)         |
| Functions/네트워크   | ~$1-3                   |
| **합계**             | **~$2-6/월**            |

> Serverless 모드: 유휴 시 과금 없음. 화이트리스트 인덱싱으로 기본 대비 50-80% RU 절감.

---

## 10. Task 분해

### Task 1: Cosmos DB 인프라 생성
- Azure CLI로 Cosmos 계정 + DB + 5개 Container 생성
- 환경변수 설정 (Azure Functions + local.settings.json)
- `npm install @azure/cosmos`

### Task 2: CosmosService + 타입 정의
- `shared/types.ts`에 Document 타입 추가
- `CosmosService.ts` — 클라이언트 싱글톤 + CRUD 헬퍼
- 연결 테스트

### Task 3: UserService + 온보딩 API
- `UserService.ts` — register, getBrandMemory, updateBrandMemory
- `POST /api/user/register` — Brand Memory 프리셋 + 추가 입력 저장
- `GET /api/user/:id`
- `PUT /api/user/:id/brand-memory`

### Task 4: RoomService + 입장코드
- `RoomService.ts` — create, joinByCode, generateJoinCode
- `POST /api/room/create` — 6자리 입장코드 자동 생성
- `POST /api/room/join-by-code` — 코드 검증 + 참가
- 코드 충돌 방지 (unique 검사)

### Task 5: SessionService + 히스토리
- `SessionService.ts` — create, end, listByRoom, getDetail
- `GET /api/room/:id/sessions` — 페이지네이션, 날짜 역순
- `GET /api/session/:id` — 요약, 시각화, 산출물 포함
- 회의 종료 시 summary 자동 저장

### Task 6: MessageService + 대화 저장
- `MessageService.ts` — save, getBySession, getDmHistory
- ContextBroker에 Dual-Write 통합
- `GET /api/session/:id/messages`
- `GET /api/dm/:roomId/:agentRole`

### Task 7: ArtifactService 확장
- 기존 ArtifactService에 Cosmos 메타데이터 저장 추가
- `GET /api/room/:id/artifacts`
- `GET /api/artifact/:id/download`

### Task 8: 프론트엔드 — 세션 히스토리 UI
- `SessionList.tsx` — 채팅 앱처럼 날짜별 세션 카드
- `SessionDetail.tsx` — 대화 리플레이 + 시각화 갤러리
- 라우팅: `/room/:id/history`

### Task 9: ContextBroker 마이그레이션 완료
- 인메모리 → Cosmos 읽기 전환
- 인메모리를 세션 내 캐시로만 유지
- 테스트

---

## 11. 데이터 흐름도

```
[사용자 온보딩]
  └─ Brand Memory (프리셋 선택 + 추가 입력)
       └─ Cosmos: users/{userId}

[방 생성]
  └─ 입장코드 생성 (6자리)
       └─ Cosmos: rooms/{roomId}

[회의 시작]
  └─ 세션 생성
       └─ Cosmos: sessions/{sessionId}  (partitionKey: roomId)

[회의 진행]
  ├─ 사용자 발언 → messages/{msgId}  (partitionKey: sessionId)
  ├─ 에이전트 응답 → messages/{msgId}  (structured 포함)
  ├─ 시각화 생성 → sessions.visualizations[] 추가
  │                └─ Blob Storage (스냅샷 이미지)
  └─ DM 대화 → messages/{msgId}  (type: "dm-message")

[회의 종료]
  ├─ LLM → summary 생성 → sessions.summary 업데이트
  ├─ PPT/Excel → OneDrive 업로드
  │              └─ Cosmos: artifacts/{artifactId}
  └─ Planner 태스크 생성
               └─ Cosmos: artifacts/{artifactId}  (type: "planner")

[히스토리 조회]
  ├─ 세션 목록: SELECT FROM sessions WHERE roomId = @roomId ORDER BY startedAt DESC
  ├─ 대화 리플레이: SELECT FROM messages WHERE sessionId = @id ORDER BY timestamp
  └─ 산출물: SELECT FROM artifacts WHERE roomId = @roomId
```
