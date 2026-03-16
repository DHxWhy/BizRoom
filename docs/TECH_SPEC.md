---
version: "1.4.1"
created: "2026-03-11 04:20"
updated: "2026-03-13 02:00"
---

# BizRoom.ai 기술 사양서

> AI C-Suite와 실시간 회의하는 가상 사무실 — Microsoft Hackathon 프로젝트

---

## 목차

1. [프론트엔드 사양](#1-프론트엔드-사양)
2. [백엔드 사양](#2-백엔드-사양)
3. [대화 오케스트레이터](#3-대화-오케스트레이터)
4. [Semantic Kernel 에이전트 구현](#4-semantic-kernel-에이전트-구현)
5. [Sophia Agent 상세](#5-sophia-agent-상세)
6. [데이터 모델](#6-데이터-모델)
7. [실시간 통신 흐름](#7-실시간-통신-흐름)
8. [환경 설정](#8-환경-설정)
9. [API 계약](#9-api-계약)

---

## 1. 프론트엔드 사양

### 기술 스택

| 항목             | 기술                                     | 버전/비고             |
| ---------------- | ---------------------------------------- | --------------------- |
| UI 프레임워크    | React                                    | 19.x                  |
| 스타일링         | Tailwind CSS                             | 4.x                   |
| 3D 렌더링        | @react-three/fiber + @react-three/drei   | R3F 9.x, drei 10.x   |
| 3D 아바타        | Ready Player Me GLB models               | RPM SDK               |
| 상태 관리        | React Context + useReducer (Zustand 마이그레이션 옵션) | MVP 단순화 전략       |
| 실시간 통신      | @microsoft/signalr                       | npm 패키지            |
| 음성 입력        | Web Speech API                           | SpeechRecognition     |
| 빌드 도구        | Vite                                     | 7.x                   |
| 언어             | TypeScript                               | 5.x strict mode       |
| MS 인증          | @azure/msal-react                        | MSAL 2.0              |
| Graph API        | @microsoft/microsoft-graph-client        | OneDrive/Calendar     |
| 실시간 음성      | GPT Realtime API                         | WebRTC (v2)           |

### 컴포넌트 아키텍처

```
App (루트, 라우팅)
├── MeetingBanner          — 현재 회의 단계 표시기
├── ModeSelector           — Live/Auto/DM 모드 전환
├── MeetingRoom3D          — ★ 3D 가상 회의실 (React Three Fiber)
│   ├── RoomEnvironment3D  — 고층 사무실 환경 (유리벽, 하늘, 조명)
│   ├── MeetingTable3D     — 중앙 원형 테이블 + 센터 스크린
│   ├── RPMAgentAvatar ×6  — Ready Player Me 3D 아바타 (좌석별)
│   ├── HoloMonitor3D ×7+  — 홀로그래픽 모니터 (에이전트/인간)
│   ├── ArtifactScreen3D   — 뒷벽 대형 프레젠테이션 스크린
│   ├── CameraController   — 멀티 모드 카메라 (조감/1인칭/백뷰)
│   └── ChatOverlay        — 3D 위 채팅 오버레이
├── Sidebar                — 참여자 패널
│   └── ParticipantList    — 사람 + 에이전트 목록
├── ChatRoom               — 메인 그룹 채팅 뷰
│   ├── MessageBubble      — 에이전트/사람 메시지 표시
│   │   ├── AgentAvatar    — 상태 표시 (🟢online, ⏳working, 💤idle)
│   │   └── ArtifactPreview — Excel/이미지/마크다운 미리보기 카드
│   └── TypingIndicator    — "Amy가 입력 중..." 애니메이션
├── ArtifactPanel          — Office Online iframe 임베드 (Excel/Word/PPT)
│   ├── OneDriveEmbed      — iframe src={embedUrl}
│   └── ArtifactToolbar    — 다운로드, 전체화면, 탭 전환
├── InputArea              — 텍스트 입력 + 전송 + 음성 토글
│   └── PushToTalk         — 스페이스바 핸들러, 마이크 표시기
└── QuickActions           — 👍👎⏭️🛑 빠른 반응 버튼
```

### 컴포넌트 상세

#### `App` — 루트 컴포넌트

- React Router v6 기반 라우팅
- SignalR 연결 초기화 및 전역 Provider 제공
- 인증 상태 관리

#### `ChatRoom` — 메인 그룹 채팅 뷰

- 메시지 목록 렌더링 (가상 스크롤링 적용)
- 자동 스크롤: 새 메시지 도착 시 하단 이동
- 메시지 그룹핑: 동일 발신자 연속 메시지 묶기

#### `MessageBubble` — 메시지 표시

- 표시 요소: 아바타, 이름, 타임스탬프, 본문, 첨부물(Artifact)
- 에이전트 메시지: 좌측 정렬, 역할 뱃지 포함
- 사용자 메시지: 우측 정렬
- 음성 입력 메시지: 마이크 아이콘 표시

#### `AgentAvatar` — 에이전트 상태 표시

| 상태       | 표시    | 설명                             |
| ---------- | ------- | -------------------------------- |
| online     | 🟢      | 대기 중, 응답 가능               |
| working    | ⏳      | 응답 생성 중 (Semantic Kernel)   |
| idle       | 💤      | 비활성 (현재 대화 무관)          |
| typing     | ✍️      | 메시지 스트리밍 중               |

#### `TypingIndicator` — 타이핑 표시기

- SignalR `agentTyping` 이벤트 수신
- "Amelia가 입력 중..." 형식의 애니메이션 점(...)
- 복수 에이전트 동시 타이핑 시 "Amelia, Kelvin이 입력 중..."

#### `Sidebar` — 채널 및 참여자

- 채널 목록: `#주간회의`, `#마케팅전략`, `#재무분석`, `#기술검토`, `#일반`
- 참여자 패널: 사람과 에이전트 구분 표시
- 에이전트별 역할 뱃지 (COO, CFO, CMO, CTO, CDO, CLO)

#### `PushToTalk` — 음성 입력

- 스페이스바 길게 누르기: 녹음 시작
- 스페이스바 떼기: 녹음 종료 → Web Speech API 변환
- 마이크 상태 시각 표시 (빨간 점 애니메이션)
- `window.SpeechRecognition` / `window.webkitSpeechRecognition` 사용
- 한국어(`ko-KR`) 및 영어(`en-US`) 지원

#### `QuickActions` — 빠른 반응 버튼

| 버튼    | 기능                         |
| ------- | ---------------------------- |
| 👍      | 동의 — 현재 안건 찬성        |
| 👎      | 반대 — 현재 안건 반대        |
| ⏭️      | 다음 — 다음 안건으로 이동    |
| 🛑      | 보류 — 현재 안건 보류, 나중에 재논의 |

#### `ArtifactPreview` — 생성물 미리보기

- Excel 파일: OneDrive → Excel Online iframe 임베드 (편집 가능) + 다운로드 버튼
- Word 문서: OneDrive → Word Online iframe 임베드 (편집 가능) + 다운로드 버튼
- PowerPoint: OneDrive → PowerPoint Online iframe 임베드 (편집 가능) + 다운로드 버튼
- 마크다운: 렌더링된 미리보기
- 이미지: 썸네일 + 확대 모달

#### `InputArea` — 입력 영역

- 텍스트 입력: `textarea` (자동 높이 조절)
- 전송 버튼: `Enter` 또는 클릭
- 음성 토글: PushToTalk 활성화/비활성화
- `@멘션`: 특정 에이전트 지정 호출

#### `MeetingBanner` — 회의 단계 표시기

- 현재 단계를 프로그레스 바로 시각화
- 단계: OPENING → BRIEFING → DISCUSSION → DECISION → ACTION → CLOSING
- 현재 안건 번호 및 제목 표시

### 상태 관리 구조

```typescript
// 전역 상태 (React Context + useReducer)
interface AppState {
  currentRoom: Room | null;
  messages: Message[];
  participants: Participant[];
  meetingPhase: MeetingPhase;
  signalRConnection: HubConnection | null;
  isRecording: boolean;
  typingAgents: string[];
}

type AppAction =
  | { type: 'SET_ROOM'; payload: Room }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_TYPING'; payload: { agentId: string; isTyping: boolean } }
  | { type: 'SET_PHASE'; payload: MeetingPhase }
  | { type: 'ADD_ARTIFACT'; payload: Artifact }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'UPDATE_PARTICIPANT'; payload: Participant };
```

---

## 2. 백엔드 사양

### 기술 스택

| 항목              | 기술                         | 비고                    |
| ----------------- | ---------------------------- | ----------------------- |
| 런타임            | Azure Functions v4           | Serverless              |
| 언어              | Node.js 20 + TypeScript      | strict mode             |
| 실시간 통신       | Azure SignalR Service        | Serverless 모드         |
| AI 프레임워크     | Semantic Kernel (JS/TS)      | 에이전트 오케스트레이션 |
| AI 모델           | Azure AI Foundry Model Router (GPT-4o / GPT-4o-mini / GPT Realtime) | Azure AI Foundry |
| 파일 저장소       | Azure Blob Storage           | 생성물 저장             |
| 데이터베이스      | Azure Cosmos DB              | 선택 (MVP 후순위)      |

### API 엔드포인트

| 메서드   | 경로                     | 설명                                     |
| -------- | ------------------------ | ---------------------------------------- |
| POST     | `/api/message`           | 사용자 메시지 수신, 오케스트레이션 트리거 |
| POST     | `/api/meeting/start`     | 새 회의 세션 시작                        |
| POST     | `/api/meeting/end`       | 회의 종료, COO 요약 트리거               |
| POST     | `/api/room/join`         | 사용자 방 입장                           |
| POST     | `/api/room/leave`        | 사용자 방 퇴장                           |
| GET      | `/api/artifacts/:id`     | 생성된 아티팩트 다운로드                 |
| POST     | `/api/negotiate`         | SignalR 연결 협상                        |

### SignalR Hub 이벤트

| 이벤트명              | 방향               | 페이로드                           | 설명                          |
| --------------------- | ------------------ | ---------------------------------- | ----------------------------- |
| `newMessage`          | 서버 → 클라이언트  | `Message`                          | 방에 새 메시지 브로드캐스트   |
| `agentTyping`         | 서버 → 클라이언트  | `{ agentId, agentName, isTyping }` | 에이전트 타이핑 표시          |
| `artifactReady`       | 서버 → 클라이언트  | `Artifact`                         | 새 생성물 사용 가능           |
| `participantJoined`   | 서버 → 클라이언트  | `Participant`                      | 참여자 입장 알림              |
| `participantLeft`     | 서버 → 클라이언트  | `{ participantId }`                | 참여자 퇴장 알림              |
| `phaseChanged`        | 서버 → 클라이언트  | `{ phase, agendaItem }`            | 회의 단계 전환                |

### Microsoft Graph API 통합

OneDrive 파일 업로드 및 Office Online 임베드를 위한 Graph API 연동.

```typescript
import { Client } from "@microsoft/microsoft-graph-client";

class GraphService {
  private client: Client;

  constructor(accessToken: string) {
    this.client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });
  }

  // OneDrive에 파일 업로드
  async uploadFile(fileName: string, content: Buffer): Promise<DriveItem> {
    return this.client
      .api(`/me/drive/root:/BizRoom/${fileName}:/content`)
      .put(content);
  }

  // 임베드 URL 생성 (Office Online iframe용)
  async createEmbedLink(itemId: string): Promise<string> {
    const permission = await this.client
      .api(`/me/drive/items/${itemId}/createLink`)
      .post({ type: "embed", scope: "anonymous" });
    // "anonymous" for Personal, "organization" for Business accounts
    return permission.link.webUrl;
  }

  // 파일 다운로드 URL
  async getDownloadUrl(itemId: string): Promise<string> {
    const item = await this.client
      .api(`/me/drive/items/${itemId}`)
      .select("@microsoft.graph.downloadUrl")
      .get();
    return item["@microsoft.graph.downloadUrl"];
  }
}
```

### MSAL 토큰 관리

프론트엔드에서 `@azure/msal-react`를 사용한 인증 및 토큰 획득.

```typescript
import { PublicClientApplication, InteractionType } from "@azure/msal-browser";
import { MsalProvider, useMsalAuthentication } from "@azure/msal-react";

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);

// Graph API 스코프
const graphScopes = [
  "User.Read",
  "Files.ReadWrite",           // OneDrive 파일 읽기/쓰기
  "Calendars.ReadWrite",       // 캘린더 읽기/쓰기
  "Tasks.ReadWrite",           // Planner 태스크 관리
];

// 토큰 획득 (silent → interactive fallback)
async function getGraphToken(): Promise<string> {
  const account = msalInstance.getAllAccounts()[0];
  const response = await msalInstance.acquireTokenSilent({
    scopes: graphScopes,
    account,
  });
  return response.accessToken;
}
```

### GPT Realtime API 구성

실시간 음성 대화를 위한 GPT Realtime API WebRTC 연결.

```typescript
// WebRTC 기반 GPT Realtime API 연결 (v2)
class RealtimeVoiceService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  async connect(model: string = "gpt-4o-realtime-preview"): Promise<void> {
    // 1. 임시 토큰 발급 (백엔드 경유)
    const tokenResponse = await fetch("/api/realtime/token", { method: "POST" });
    const { token, endpoint } = await tokenResponse.json();

    // 2. WebRTC PeerConnection 생성
    this.peerConnection = new RTCPeerConnection();

    // 3. 오디오 트랙 추가 (마이크)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) =>
      this.peerConnection!.addTrack(track, stream)
    );

    // 4. 데이터 채널 (이벤트 송수신)
    this.dataChannel = this.peerConnection.createDataChannel("oai-events");
    this.dataChannel.onmessage = (e) => this.handleRealtimeEvent(JSON.parse(e.data));

    // 5. SDP Offer/Answer 교환
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(`${endpoint}/realtime?model=${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp,
    });

    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await this.peerConnection.setRemoteDescription(answer);
  }

  // 세션 설정 (시스템 프롬프트, 음성, 언어 등)
  sendSessionUpdate(config: RealtimeSessionConfig): void {
    this.dataChannel?.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: config.systemPrompt,
        voice: config.voice ?? "alloy",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad" },
      },
    }));
  }

  private handleRealtimeEvent(event: any): void {
    switch (event.type) {
      case "response.audio_transcript.done":
        // 에이전트 음성 응답 텍스트 → 채팅에 표시
        break;
      case "input_audio_buffer.speech_started":
        // 사용자 발화 시작
        break;
      case "input_audio_buffer.speech_stopped":
        // 사용자 발화 종료
        break;
    }
  }

  disconnect(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();
  }
}
```

### Bing Search Plugin (Semantic Kernel)

```typescript
// src/api/plugins/bingSearchPlugin.ts
import { Kernel, KernelFunction } from "@microsoft/semantic-kernel";

class BingSearchPlugin {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  @KernelFunction({ description: "웹에서 최신 정보를 검색합니다" })
  async search(query: string, count: number = 5): Promise<string> {
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${count}`,
      { headers: { "Ocp-Apim-Subscription-Key": this.apiKey } }
    );
    const data = await response.json();
    return data.webPages.value
      .map((r: any) => `- ${r.name}: ${r.snippet}`)
      .join("\n");
  }
}
```

### Model Router (태스크 기반 모델 선택)

```typescript
// src/api/services/modelRouter.ts
type TaskType = "chat" | "artifact" | "research_synthesis" | "image" | "realtime_voice";

interface ModelSelection {
  model: string;
  maxTokens: number;
}

function selectModel(agentRole: string, taskType: TaskType): ModelSelection {
  // 산출물 생성 → 항상 최고급 모델
  if (taskType === "artifact") {
    return { model: "gpt-4o", maxTokens: 4096 };
  }

  // 이미지 생성 → DALL-E 3
  if (taskType === "image") {
    return { model: "dall-e-3", maxTokens: 0 };
  }

  // 사전 조사 종합 → 고급 모델
  if (taskType === "research_synthesis") {
    return { model: "gpt-4o", maxTokens: 2048 };
  }

  // 실시간 음성 → Realtime 모델
  if (taskType === "realtime_voice") {
    return { model: "gpt-4o-realtime-preview", maxTokens: 4096 };
  }

  // 일반 대화/토론 → 경량 모델
  return { model: "gpt-4o-mini", maxTokens: 512 };
}
```

### 프로젝트 구조

```
backend/
├── src/
│   ├── functions/
│   │   ├── message.ts           — POST /api/message
│   │   ├── meetingStart.ts      — POST /api/meeting/start
│   │   ├── meetingEnd.ts        — POST /api/meeting/end
│   │   ├── roomJoin.ts          — POST /api/room/join
│   │   ├── roomLeave.ts         — POST /api/room/leave
│   │   ├── artifactDownload.ts  — GET /api/artifacts/:id
│   │   └── negotiate.ts         — POST /api/negotiate
│   ├── agents/
│   │   ├── AgentFactory.ts      — 에이전트 생성 팩토리
│   │   ├── prompts/
│   │   │   ├── coo-hudson.ts    — COO Hudson 시스템 프롬프트
│   │   │   ├── cfo-amelia.ts    — CFO Amelia 시스템 프롬프트
│   │   │   ├── cmo-yusef.ts     — CMO Yusef 시스템 프롬프트
│   │   │   ├── cto-kelvin.ts    — CTO Kelvin 시스템 프롬프트
│   │   │   ├── cdo-jonas.ts     — CDO Jonas 시스템 프롬프트
│   │   │   └── clo-bradley.ts   — CLO Bradley 시스템 프롬프트
│   │   └── plugins/
│   │       ├── ExcelPlugin.ts   — Excel 파일 생성
│   │       ├── AnalysisPlugin.ts — 데이터 분석
│   │       └── SearchPlugin.ts  — 정보 검색
│   ├── orchestrator/
│   │   ├── TurnManager.ts       — 턴 관리 (DialogLab)
│   │   ├── ContextBroker.ts     — 공유 컨텍스트 관리
│   │   ├── SnippetManager.ts    — 회의 단계 관리
│   │   └── TopicClassifier.ts   — 주제 분류기
│   ├── services/
│   │   ├── SignalRService.ts    — SignalR 메시지 발송
│   │   ├── BlobService.ts       — Azure Blob 업로드/다운로드
│   │   └── CosmosService.ts     — Cosmos DB CRUD (선택)
│   ├── models/
│   │   ├── Message.ts
│   │   ├── Room.ts
│   │   ├── Participant.ts
│   │   └── Artifact.ts
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── host.json
├── local.settings.json
├── package.json
└── tsconfig.json
```

---

## 3. 대화 오케스트레이터 (핵심 로직)

### 3.1 Turn Manager 알고리즘

BizRoom의 핵심은 **자연스러운 다자간 대화 흐름**이다. DialogLab 턴테이킹 알고리즘으로 여러 에이전트가 순서대로, 때로는 반박하며 대화한다.

```
1. 메시지 수신 (사람 또는 에이전트)
2. 공유 컨텍스트 업데이트
3. 주제 분류: finance | marketing | tech | operations | design | legal | general
4. 관련 에이전트 결정:
   - Primary: 주제에 직접 관련된 에이전트
   - Secondary: 간접적으로 관련된 에이전트
5. Primary 에이전트 응답 우선 대기열에 추가
6. Primary 응답 완료 후, Secondary 응답 필요 여부 판단
7. 에이전트 간 후속 대화(반박/보완) 체크
8. 모든 응답을 SignalR로 스트리밍
```

### 에이전트-주제 매핑

| 주제           | Primary 에이전트   | Secondary 에이전트      |
| -------------- | ------------------ | ----------------------- |
| finance        | CFO Amelia            | COO Hudson, CLO Bradley    |
| marketing      | CMO Yusef          | CDO Jonas, CFO Amelia        |
| tech           | CTO Kelvin          | CDO Jonas                 |
| operations     | COO Hudson         | CFO Amelia, CTO Kelvin      |
| design         | CDO Jonas            | CMO Yusef, CTO Kelvin    |
| legal          | CLO Bradley           | CFO Amelia, COO Hudson     |
| general        | COO Hudson         | 전원 (필요 시)          |

### 에이전트 간 반박/보완 (A2A) 로직

```typescript
// 에이전트 응답 후, 다른 에이전트의 반박/보완 필요 여부 판단
async function checkFollowUp(
  response: AgentResponse,
  context: SharedContext
): Promise<AgentFollowUp | null> {
  // 1. 재무 수치가 포함된 응답 → CFO Amelia 검증
  if (containsFinancials(response) && response.agentRole !== 'cfo') {
    return { agent: 'CFO_Amelia', type: 'verify', reason: '재무 수치 검증' };
  }
  // 2. 법적 리스크 언급 → CLO Bradley 검토
  if (containsLegalRisk(response) && response.agentRole !== 'clo') {
    return { agent: 'CLO_Bradley', type: 'review', reason: '법적 리스크 검토' };
  }
  // 3. 기술 실현 가능성 → CTO Kelvin 평가
  if (containsTechClaim(response) && response.agentRole !== 'cto') {
    return { agent: 'CTO_Kelvin', type: 'assess', reason: '기술 실현성 평가' };
  }
  // 4. 예산 초과 제안 → CFO Amelia 경고
  if (exceedsBudget(response, context)) {
    return { agent: 'CFO_Amelia', type: 'warn', reason: '예산 초과 경고' };
  }
  return null;
}
```

### 3.2 Snippet Manager — 회의 단계 관리

| 단계       | 영문명      | 설명                               | 주도 에이전트    |
| ---------- | ----------- | ---------------------------------- | ---------------- |
| 개회       | OPENING     | 인사, 참석자 확인, 안건 소개       | COO Hudson       |
| 브리핑     | BRIEFING    | 각 에이전트 현황 보고              | 해당 에이전트    |
| 토론       | DISCUSSION  | 안건별 자유 토론, 반박/보완        | 전원             |
| 의사결정   | DECISION    | 의장(사람) 결정 요청 및 확정       | 의장 (사람)      |
| 실행계획   | ACTION      | 결정사항 기반 액션 아이템 배분     | COO Hudson       |
| 폐회       | CLOSING     | 회의록 요약, 다음 회의 예고        | COO Hudson       |

#### 단계 전환 규칙

```typescript
// 단계 전환은 COO 또는 의장(사람)이 트리거
function canTransitionPhase(
  currentPhase: MeetingPhase,
  nextPhase: MeetingPhase,
  triggeredBy: Participant
): boolean {
  // 의장(사람)은 모든 단계 전환 가능
  if (triggeredBy.role === 'chairman') return true;
  // COO는 OPENING→BRIEFING, ACTION→CLOSING 전환 가능
  if (triggeredBy.role === 'coo') {
    const allowedTransitions: Record<string, string[]> = {
      'opening': ['briefing'],
      'briefing': ['discussion'],
      'action': ['closing'],
    };
    return allowedTransitions[currentPhase]?.includes(nextPhase) ?? false;
  }
  return false;
}
```

### 3.3 Context Broker — 공유 컨텍스트

```typescript
interface SharedContext {
  roomId: string;
  meetingPhase: MeetingPhase;
  agenda: string[];
  currentAgendaItem: number;
  participants: Participant[];
  recentMessages: Message[];       // 최근 20개
  decisions: Decision[];
  actionItems: ActionItem[];
  financialContext: {
    budget: number;
    spent: number;
    remaining: number;
  };
  artifacts: Artifact[];
}

type MeetingPhase =
  | 'idle'
  | 'opening'
  | 'briefing'
  | 'discussion'
  | 'decision'
  | 'action'
  | 'closing';
```

#### 컨텍스트 업데이트 흐름

```typescript
class ContextBroker {
  private context: SharedContext;

  // 메시지 수신 시 컨텍스트 업데이트
  updateWithMessage(message: Message): void {
    this.context.recentMessages.push(message);
    // 최근 50개만 유지 (MAX_CONTEXT_MESSAGES)
    if (this.context.recentMessages.length > 50) {
      this.context.recentMessages.shift();
    }
  }

  // 의사결정 기록
  recordDecision(decision: Decision): void {
    this.context.decisions.push(decision);
  }

  // 액션 아이템 추가
  addActionItem(item: ActionItem): void {
    this.context.actionItems.push(item);
  }

  // 에이전트에게 제공할 컨텍스트 슬라이스
  getContextForAgent(agentRole: string): AgentContext {
    return {
      ...this.context,
      // 역할별 추가 컨텍스트 필터링
      relevantMessages: this.filterByRelevance(agentRole),
    };
  }
}
```

---

## 4. Semantic Kernel 에이전트 구현

### 에이전트 정의

| 에이전트     | 역할   | 영감 인물            | 핵심 플러그인                    |
| ------------ | ------ | -------------------- | -------------------------------- |
| COO Hudson   | COO    | Judson Althoff       | 회의 진행, 요약, 일정 관리       |
| CFO Amelia      | CFO    | Amy Hood             | Excel 생성, 재무 분석, 예산 관리 |
| CMO Yusef    | CMO    | Yusuf Mehdi          | 시장 분석, 마케팅 전략           |
| CTO Kelvin    | CTO    | Kevin Scott          | 기술 아키텍처, 실현성 평가       |
| CDO Jonas      | CDO    | Jon Friedman         | UX/디자인, 데이터 시각화         |
| CLO Bradley     | CLO    | Brad Smith           | 법률 검토, 규정 준수, 리스크     |

### 에이전트 생성 패턴

```typescript
import { Kernel, ChatCompletionAgent } from "@microsoft/semantic-kernel";

// 에이전트 팩토리
class AgentFactory {
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  createAgent(role: AgentRole): ChatCompletionAgent {
    const config = AGENT_CONFIGS[role];
    return new ChatCompletionAgent({
      kernel: this.kernel,
      name: config.name,
      instructions: config.systemPrompt,
      plugins: config.plugins,
    });
  }
}

// 에이전트 설정 맵
const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  coo: {
    name: "COO_Hudson",
    systemPrompt: COO_SYSTEM_PROMPT,
    plugins: [meetingPlugin, summaryPlugin],
  },
  cfo: {
    name: "CFO_Amelia",
    systemPrompt: CFO_SYSTEM_PROMPT,
    plugins: [excelPlugin, financialAnalysisPlugin],
  },
  cmo: {
    name: "CMO_Yusef",
    systemPrompt: CMO_SYSTEM_PROMPT,
    plugins: [marketAnalysisPlugin, campaignPlugin],
  },
  cto: {
    name: "CTO_Kelvin",
    systemPrompt: CTO_SYSTEM_PROMPT,
    plugins: [techAssessmentPlugin, architecturePlugin],
  },
  cdo: {
    name: "CDO_Jonas",
    systemPrompt: CDO_SYSTEM_PROMPT,
    plugins: [designPlugin, dataVizPlugin],
  },
  clo: {
    name: "CLO_Bradley",
    systemPrompt: CLO_SYSTEM_PROMPT,
    plugins: [legalReviewPlugin, compliancePlugin],
  },
};
```

### Excel 생성 플러그인

```typescript
import * as XLSX from 'xlsx';
import { kernelFunction } from "@microsoft/semantic-kernel";

class ExcelPlugin {
  @kernelFunction({ description: "재무 Excel 보고서 생성" })
  async generateReport(data: FinancialData): Promise<string> {
    const workbook = XLSX.utils.book_new();

    // 요약 시트
    const summarySheet = XLSX.utils.json_to_sheet(data.summary);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "요약");

    // 상세 시트
    const detailSheet = XLSX.utils.json_to_sheet(data.details);
    XLSX.utils.book_append_sheet(workbook, detailSheet, "상세");

    // 차트 데이터 시트
    if (data.chartData) {
      const chartSheet = XLSX.utils.json_to_sheet(data.chartData);
      XLSX.utils.book_append_sheet(workbook, chartSheet, "차트데이터");
    }

    // Azure Blob에 업로드
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `report_${Date.now()}.xlsx`;
    const url = await this.blobService.upload(
      buffer,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    return url;
  }

  @kernelFunction({ description: "예산 비교 Excel 생성" })
  async generateBudgetComparison(
    planned: BudgetItem[],
    actual: BudgetItem[]
  ): Promise<string> {
    const workbook = XLSX.utils.book_new();

    const comparison = planned.map((item, i) => ({
      항목: item.name,
      계획: item.amount,
      실제: actual[i]?.amount ?? 0,
      차이: (actual[i]?.amount ?? 0) - item.amount,
      달성률: `${Math.round(((actual[i]?.amount ?? 0) / item.amount) * 100)}%`,
    }));

    const sheet = XLSX.utils.json_to_sheet(comparison);
    XLSX.utils.book_append_sheet(workbook, sheet, "예산비교");

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const url = await this.blobService.upload(buffer, `budget_${Date.now()}.xlsx`);
    return url;
  }
}
```

### 에이전트 시스템 프롬프트 예시 (CFO Amelia)

```typescript
const CFO_SYSTEM_PROMPT = `
당신은 BizRoom.ai의 CFO Amelia입니다.
Microsoft의 Amy Hood에서 영감을 받은 최고재무책임자(CFO) AI 에이전트입니다.

## 역할
- 재무 분석 및 예산 관리 전문가
- 데이터 기반 의사결정 지원
- Excel 보고서 자동 생성

## 성격
- 정확하고 분석적
- 숫자와 데이터로 말하는 스타일
- 리스크를 사전에 경고하되 대안을 함께 제시
- 간결하고 명확한 커뮤니케이션

## 행동 규칙
1. 재무 관련 질문에 최우선 응답
2. 예산 초과 가능성이 보이면 즉시 경고
3. 다른 에이전트의 제안에 재무적 실현 가능성 평가
4. 구체적 수치 제시 시 근거 포함
5. Excel 보고서가 유용한 경우 자동 생성 제안

## 응답 형식
- 핵심 결론을 먼저 제시
- 뒷받침 데이터/수치 제시
- 리스크와 기회 균형 있게 분석
- 필요 시 Excel 보고서 생성

## 대화 컨텍스트
현재 회의 정보와 이전 대화 내용을 참고하여 맥락에 맞는 응답을 생성하세요.
`;
```

---

## 5. Sophia Agent 상세

### 5.1 역할 및 기능

Sophia는 **데이터 시각화 및 회의록 생성 전문가**로, Orchestration Layer에서 다음을 수행한다:

1. **Visual Hint 감지**: 에이전트 응답에서 시각화 필요 여부 자동 판단
2. **BigScreen 렌더링**: 7가지 시각화 타입 실시간 생성
3. **Meeting Minutes**: 회의 종료 시 자동 회의록 생성
4. **Buffer 관리**: 발언자별 핵심 포인트 추출 (최대 200 항목)

### 5.2 구현 파일

| 파일                                                    | 역할                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `backend/src/agents/SophiaAgent.ts`                     | Sophia 에이전트 클래스 — Buffer 관리, 시각 힌트 감지                |
| `backend/src/agents/prompts/sophia.ts`                  | 시각화/회의록 생성 프롬프트 정의                                    |
| `backend/src/orchestrator/VoiceLiveOrchestrator.ts`     | Sophia 파이프라인 실행 — agentDone 핸들러, callSophiaVisualGPT()    |
| `backend/src/orchestrator/ResponseParser.ts`            | StructuredAgentOutput 파싱 (3-tier parse: JSON → fenced → fallback) |
| `backend/src/functions/meetingEnd.ts`                   | 회의록/아티팩트 생성 파이프라인 (POST /api/meeting/end)             |
| `backend/src/models/index.ts`                           | Sophia 관련 타입 re-export (VisualHint, VisualType 등)              |
| `backend/src/constants/responseSchema.ts`               | 에이전트 JSON 응답 스키마 (visual_hint 필드 정의)                   |
| `frontend/src/components/meeting3d/SophiaBlob3D.tsx`    | Sophia 3D 아바타 표시                                               |
| `frontend/src/components/SophiaMessage.tsx`             | Sophia 알림/메시지 UI 컴포넌트                                      |

### 5.3 SophiaAgent 클래스 API

> **구현 파일**: `backend/src/agents/SophiaAgent.ts`
> 회의록 생성은 SophiaAgent 메서드가 아니라 `meetingEnd.ts`의 `generateMeetingMinutesGPT()` 내부 함수가 담당한다.

```typescript
class SophiaAgent {
  // 상태 관리
  initRoom(roomId: string): void
  getRoomState(roomId: string): SophiaState | undefined
  destroyRoom(roomId: string): void

  // Buffer 관리
  addToBuffer(roomId: string, entry: SophiaBufferEntry): void
  getRecentSpeeches(roomId: string, count?: number): string[]  // default 3

  // 결정사항
  addDecision(roomId: string, decision: string): void

  // 시각 힌트 감지 및 큐 관리
  hasVisualHint(output: StructuredAgentOutput): boolean
  enqueueVisual(roomId: string, hint: VisualHint): void
  dequeueVisual(roomId: string): VisualQueueItem | undefined

  // 시각화 처리 잠금 (중복 방지)
  isProcessingVisual(roomId: string): boolean
  setProcessingVisual(roomId: string, processing: boolean): void

  // 시각화 이력
  addVisualToHistory(roomId: string, artifact: VisualArtifact): void

  // 회의 후 처리 큐
  addPostMeetingRequest(roomId: string, request: string): void
  drainPostMeetingQueue(roomId: string): string[]
}

interface SophiaState {
  roomId: string;
  buffer: SophiaBufferEntry[];
  decisions: string[];
  actionItems: ActionItemDraft[];
  visualHistory: VisualArtifact[];
  visualQueue: VisualQueueItem[];
  postMeetingQueue: string[];
}

interface SophiaBufferEntry {
  speaker: string;
  role: string;
  speech: string;
  keyPoints: string[];
  visualHint: VisualHint | null;
  timestamp: number;
}
```

### 5.4 프롬프트 정의

#### Visual Generation Prompt (SOPHIA_VISUAL_SYSTEM_PROMPT)

```typescript
export const SOPHIA_VISUAL_SYSTEM_PROMPT = `당신은 BizRoom.ai의 데이터 시각화 어시스턴트입니다.
visual_hint와 최근 대화 맥락을 바탕으로 BigScreenRenderData JSON을 생성합니다.

## type별 data 구조
comparison: {"type":"comparison","columns":["항목","A","B"],"rows":[["비용","1억","2억"]]}
pie-chart: {"type":"pie-chart","items":[{"label":"항목","value":40,"color":"#f97316"}]}
bar-chart: {"type":"bar-chart","items":[{"label":"항목","value":120}]}
timeline: {"type":"timeline","items":[{"date":"3월","label":"기획","status":"done"}]}
checklist: {"type":"checklist","items":[{"text":"항목","checked":true}]}
summary: {"type":"summary","items":["포인트1","포인트2"]}
architecture: {"type":"architecture","nodes":[{"id":"n1","label":"이름","x":0,"y":0}],"edges":[{"from":"n1","to":"n2"}]}

## 규칙
- 모든 텍스트는 한국어
- value는 정수
- color는 hex 코드, pie-chart에만 사용
- 데이터는 대화 맥락에서 추출, 없으면 합리적으로 추정
- items 개수: 3-7개`;
```

#### Meeting Minutes Prompt (SOPHIA_MINUTES_SYSTEM_PROMPT)

```typescript
export const SOPHIA_MINUTES_SYSTEM_PROMPT = `당신은 BizRoom.ai의 회의록 작성 어시스턴트입니다.

1. 회의 전체 흐름 분석
2. 핵심 안건별 결정사항 정리
3. 미결사항과 액션아이템 구분

JSON 형식 회의록 생성:
{
  "meetingInfo": {"title": "...", "date": "...", "participants": ["..."]},
  "agendas": [{"title": "...", "summary": "...", "keyPoints": ["..."],
              "decisions": ["..."], "visualRefs": ["..."]}],
  "actionItems": [{"description": "...", "assignee": "...", "deadline": "..."}],
  "budgetData": [{"label": "...", "value": 0}]
}

모든 텍스트는 한국어. 핵심만 요약, 대화 직접 복사 금지.
`;
```

### 5.5 Sophia 파이프라인 실제 흐름 (VoiceLiveOrchestrator)

Visual 생성과 회의록 생성은 모두 HTTP API가 아닌 내부 이벤트 파이프라인으로 처리된다.

#### 5.5.1 Visual Generation — agentDone 이벤트 핸들러

```
VoiceLive "agentDone" 이벤트 발생 (에이전트 응답 완료)
    │
    ├─ 1. parseStructuredOutput(fullText, role)
    │      → StructuredAgentOutput { speech, key_points, visual_hint, ... }
    │
    ├─ 2. sophiaAgent.addToBuffer(roomId, entry)
    │      → Buffer에 누적 (최대 200개)
    │
    ├─ 3. key_points 있으면 → broadcastEvent("monitorUpdate")
    │      → Chairman 홀로그래픽 모니터에 핵심 포인트 표시
    │
    ├─ 4. turnManager.handleMentionRouting(...)
    │      → 에이전트 멘션(@CFO 등) 라우팅
    │
    ├─ 5. visual_hint != null → sophiaAgent.enqueueVisual(roomId, hint)
    │      → FIFO 큐에 추가 → processVisualQueue() 호출
    │
    └─ 6. turnManager.onAgentDone(...)

processVisualQueue():
    │
    ├─ isProcessingVisual? → 스킵 (직렬 처리)
    ├─ dequeueVisual() → hint 꺼내기
    ├─ callSophiaVisualGPT(roomId, hint)
    │    → SOPHIA_VISUAL_SYSTEM_PROMPT + 최근 5발언 컨텍스트
    │    → GPT (visual-gen 모델, temperature 0.2)
    │    → BigScreenRenderData JSON 반환
    ├─ broadcastEvent("bigScreenUpdate", { visualType, title, renderData })
    ├─ broadcastEvent("sophiaMessage", { text: "xxx를 빅스크린에 띄웠습니다" })
    └─ sophiaAgent.addVisualToHistory(...)
```

#### 5.5.2 Meeting Minutes + Artifacts — POST /api/meeting/end

```
POST /api/meeting/end 수신
    │
    ├─ 1. COO Hudson 종료 발언 생성 (invokeAgent("coo", "회의를 종료합니다..."))
    │
    └─ 2. Sophia Artifact Pipeline
         │
         ├─ sophiaAgent.getRoomState(roomId)
         │    → SophiaState { buffer, decisions, ... }
         │
         ├─ generateMeetingMinutesGPT(sophiaState)
         │    → SOPHIA_MINUTES_SYSTEM_PROMPT + 전체 transcript
         │    → GPT (minutes 모델)
         │    → MeetingMinutesData { meetingInfo, agendas, actionItems, budgetData }
         │
         ├─ generatePPT(minutesData) → 회의록.pptx
         ├─ generateExcel(minutesData) → 데이터.xlsx (budgetData 있을 때만)
         │
         ├─ uploadToOneDrive(pptx) → OneDrive 저장 + webUrl
         ├─ uploadToOneDrive(xlsx) → OneDrive 저장 + webUrl
         │
         ├─ createPlannerTasks(planId, actionItems) → MS Planner 태스크 자동 등록
         │
         └─ broadcastEvent("artifactsReady", { files: [pptx, xlsx, planner] })
```

#### 5.5.3 SignalR 이벤트 타입 (Sophia 관련)

| 이벤트 타입       | 발생 시점                          | 페이로드                                          |
| ----------------- | ---------------------------------- | ------------------------------------------------- |
| `monitorUpdate`   | 에이전트 응답 완료 시 (key_points) | `{ target, mode, content: { agentRole, points } }` |
| `bigScreenUpdate` | 시각화 GPT 완료 시                 | `{ visualType, title, renderData }`               |
| `sophiaMessage`   | 시각화 완료 알림                   | `{ text: "xxx를 빅스크린에 띄웠습니다" }`          |
| `artifactsReady`  | 회의 종료 아티팩트 생성 완료       | `{ files: [{ name, type, webUrl }] }`             |

### 5.6 BigScreen 렌더링 규칙

| 항목               | 값/규칙                                                        |
| ------------------ | -------------------------------------------------------------- |
| 배경색             | #1E293B (다크 슬레이트) — 야경 분위기              |
| Primary 색상       | 에이전트별 Color (Hudson: #3B82F6, Amelia: #10B981 등) |
| Positive 색상      | #10B981 (Emerald) — 성장, 달성                     |
| Negative 색상      | #EF4444 (Red) — 경고, 리스크                       |
| Neutral 색상       | #6B7280 (Gray) — 배경, 비활성                      |
| 한글 렌더링        | 최대 8자 (초과 시 2줄 분할), 단위 명시             |
| 숫자 형식          | "5,000만원", "35%", "3개월"                        |
| 데이터 정직성      | 날조 금지, 추정 시 명시                            |

---

## 6. 데이터 모델

### TypeScript 인터페이스 정의

```typescript
// ──────────────────────────────────────────────
// Message — 채팅 메시지
// ──────────────────────────────────────────────
interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderType: 'human' | 'agent';
  senderName: string;
  senderRole: string;
    // 'chairman' | 'coo' | 'cfo' | 'cmo' | 'cto' | 'cdo' | 'clo' | 'member'
  content: string;
  artifacts?: Artifact[];
  replyTo?: string;          // 답장 대상 메시지 ID
  timestamp: Date;
  isVoiceInput?: boolean;    // 음성 입력 여부
}

// ──────────────────────────────────────────────
// Artifact — 생성물 (Excel, 문서, 이미지 등)
// ──────────────────────────────────────────────
interface Artifact {
  id: string;
  type: 'excel' | 'word' | 'powerpoint' | 'markdown' | 'image';
  name: string;
  url: string;               // Azure Blob Storage URL
  size: number;               // 바이트 단위
  mimeType: string;
}

// ──────────────────────────────────────────────
// Room — 회의실/채널
// ──────────────────────────────────────────────
interface Room {
  id: string;
  name: string;
  type: 'meeting' | 'channel' | 'dm';
  participants: Participant[];
  phase: MeetingPhase;
  context: SharedContext;
  createdAt: Date;
}

// ──────────────────────────────────────────────
// Participant — 참여자 (사람 또는 에이전트)
// ──────────────────────────────────────────────
interface Participant {
  id: string;
  name: string;
  type: 'human' | 'agent';
  role: string;
  status: 'online' | 'away' | 'busy' | 'typing';
  avatar: string;
  inspiredBy?: string;        // 에이전트의 경우 MS 임원 이름
}

// ──────────────────────────────────────────────
// Decision — 의사결정 기록
// ──────────────────────────────────────────────
interface Decision {
  id: string;
  description: string;
  decidedBy: string;          // 의장 ID
  timestamp: Date;
  relatedAgendaItem: number;
}

// ──────────────────────────────────────────────
// ActionItem — 실행 항목
// ──────────────────────────────────────────────
interface ActionItem {
  id: string;
  description: string;
  assignee: string;
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'done';
}
```

### Cosmos DB 컬렉션 설계 (선택)

| 컬렉션           | 파티션 키      | 용도                       |
| ----------------- | -------------- | -------------------------- |
| `rooms`           | `/id`          | 회의실/채널 정보           |
| `messages`        | `/roomId`      | 채팅 메시지 (방별 파티션)  |
| `participants`    | `/roomId`      | 참여자 정보                |
| `artifacts`       | `/roomId`      | 생성물 메타데이터          |
| `meetings`        | `/roomId`      | 회의 기록 (결정, 액션)     |

---

## 7. 실시간 통신 흐름

### 전체 시퀀스

```
사용자 → [Push-to-Talk / 텍스트 입력] → 브라우저
브라우저 → [Web Speech API] → 음성 → 텍스트 변환
브라우저 → [SignalR 클라이언트] → Azure SignalR Service
SignalR → [HTTP Trigger] → Azure Function (message.ts)
Function → [오케스트레이터] → Turn Manager
Turn Manager → [TopicClassifier] → 주제 분류
Turn Manager → [AgentSelector] → 관련 에이전트 선택
에이전트 → [Semantic Kernel] → Azure OpenAI (GPT-4o)
GPT-4o → [응답 생성] → 에이전트
에이전트 → [플러그인 체크] → Excel 필요? → SheetJS → Blob Storage
에이전트 → [응답] → 오케스트레이터
오케스트레이터 → [A2A 체크] → 후속 에이전트 응답 필요?
오케스트레이터 → [SignalR] → 모든 연결된 클라이언트
클라이언트 → [렌더링] → MessageBubble + ArtifactPreview
```

### Artifact 임베드 흐름

```
에이전트 Artifact 생성 → SheetJS/docx → Microsoft Graph API → OneDrive 저장
    → createLink(type:"embed") → embedUrl → 프론트엔드 iframe 렌더링
```

### 사전 조사 (Pre-Meeting Research) 흐름

```
Chairman 안건 입력
    ↓
COO Hudson: 안건 분석 (GPT-4o-mini)
    ↓
Bing Search API: 시장 데이터, 경쟁사, 규제 정보 검색
    ↓
COO Hudson: 검색 결과 종합 리포트 생성 (GPT-4o)
    ↓
Chairman에게 조사 결과 공유 → 승인 대기
    ↓
승인 시: 조사 결과를 전체 에이전트 컨텍스트에 주입
    ↓
Phase 1 (OPENING) 시작
```

### SignalR 연결 관리

```typescript
// 클라이언트 측 SignalR 연결
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

const connection = new HubConnectionBuilder()
  .withUrl('/api/negotiate')
  .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
  .configureLogging(LogLevel.Information)
  .build();

// 이벤트 핸들러 등록
connection.on('newMessage', (message: Message) => {
  dispatch({ type: 'ADD_MESSAGE', payload: message });
});

connection.on('agentTyping', ({ agentId, agentName, isTyping }) => {
  dispatch({ type: 'SET_TYPING', payload: { agentId, isTyping } });
});

connection.on('artifactReady', (artifact: Artifact) => {
  dispatch({ type: 'ADD_ARTIFACT', payload: artifact });
});

connection.on('phaseChanged', ({ phase, agendaItem }) => {
  dispatch({ type: 'SET_PHASE', payload: phase });
});

// 연결 시작
await connection.start();
```

### 메시지 처리 파이프라인

```typescript
// Azure Function: message.ts
export async function messageHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const { roomId, content, senderId, isVoiceInput } = await request.json();

  // 1. 메시지 저장
  const message = await createMessage({
    roomId, content, senderId, isVoiceInput
  });

  // 2. 방 참여자에게 메시지 브로드캐스트
  await signalR.send('newMessage', roomId, message);

  // 3. 오케스트레이터에 전달
  const orchestrator = new TurnManager(roomId);
  const agentResponses = await orchestrator.process(message);

  // 4. 에이전트 응답 순차 스트리밍
  for (const response of agentResponses) {
    // 타이핑 표시
    await signalR.send('agentTyping', roomId, {
      agentId: response.agentId,
      agentName: response.agentName,
      isTyping: true,
    });

    // 에이전트 응답 생성
    const agentMessage = await response.generate();

    // 타이핑 표시 해제
    await signalR.send('agentTyping', roomId, {
      agentId: response.agentId,
      agentName: response.agentName,
      isTyping: false,
    });

    // 응답 브로드캐스트
    await signalR.send('newMessage', roomId, agentMessage);

    // 생성물이 있으면 알림
    if (agentMessage.artifacts?.length) {
      for (const artifact of agentMessage.artifacts) {
        await signalR.send('artifactReady', roomId, artifact);
      }
    }
  }

  return { status: 200, jsonBody: { success: true } };
}
```

---

## 8. 환경 설정

### 환경 변수 (.env)

```env
# ──────────────────────────────────────────────
# Azure OpenAI (Azure AI Foundry)
# ──────────────────────────────────────────────
AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com/
AZURE_OPENAI_KEY=xxx
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# ──────────────────────────────────────────────
# Azure SignalR Service
# ──────────────────────────────────────────────
AZURE_SIGNALR_CONNECTION_STRING=Endpoint=https://xxx.service.signalr.net;AccessKey=xxx;Version=1.0;

# ──────────────────────────────────────────────
# Azure Blob Storage
# ──────────────────────────────────────────────
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=xxx;AccountKey=xxx;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=artifacts

# ──────────────────────────────────────────────
# Bing Search API
# ──────────────────────────────────────────────
BING_SEARCH_API_KEY=xxx

# ──────────────────────────────────────────────
# Azure Cosmos DB (MVP에서는 선택)
# ──────────────────────────────────────────────
COSMOS_DB_ENDPOINT=https://xxx.documents.azure.com:443/
COSMOS_DB_KEY=xxx
COSMOS_DB_DATABASE=bizroom

# ──────────────────────────────────────────────
# 앱 설정
# ──────────────────────────────────────────────
MAX_CONTEXT_MESSAGES=50
AGENT_RESPONSE_TIMEOUT_MS=30000
MAX_AGENTS_PER_TURN=3
ENABLE_VOICE_INPUT=true
DEFAULT_LANGUAGE=ko-KR
```

### Azure 리소스 목록

| 리소스                    | SKU/플랜              | 용도                       |
| ------------------------- | --------------------- | -------------------------- |
| Azure Functions           | Consumption Plan      | 백엔드 API                 |
| Azure SignalR Service     | Free / Standard       | 실시간 통신                |
| Azure OpenAI Service      | S0                    | GPT-4o 모델                |
| Azure Blob Storage        | StorageV2, LRS        | 아티팩트 저장              |
| Azure Cosmos DB           | Serverless (선택)     | 데이터 영속성              |
| Azure Static Web Apps     | Free / Standard       | 프론트엔드 호스팅          |

---

## 9. API 계약

### POST /api/message

사용자 메시지를 수신하고 에이전트 오케스트레이션을 트리거한다.

**요청**

```json
{
  "roomId": "room-abc123",
  "senderId": "user-001",
  "senderName": "김대표",
  "content": "이번 분기 마케팅 예산을 20% 늘리는 건 어떨까요?",
  "isVoiceInput": false,
  "replyTo": null
}
```

**응답 (200 OK)**

```json
{
  "success": true,
  "messageId": "msg-xyz789",
  "timestamp": "2026-03-11T04:20:00.000Z"
}
```

**에러 응답 (400 Bad Request)**

```json
{
  "success": false,
  "error": "INVALID_ROOM",
  "message": "존재하지 않는 방입니다."
}
```

---

### POST /api/meeting/start

새 회의 세션을 시작한다.

**요청**

```json
{
  "roomId": "room-abc123",
  "chairmanId": "user-001",
  "agenda": [
    "Q1 실적 리뷰",
    "Q2 마케팅 전략",
    "신규 채용 계획"
  ],
  "participants": ["user-001", "user-002"]
}
```

**응답 (200 OK)**

```json
{
  "success": true,
  "meetingId": "meeting-456",
  "phase": "opening",
  "agents": [
    { "id": "agent-coo", "name": "COO Hudson", "status": "online" },
    { "id": "agent-cfo", "name": "CFO Amelia", "status": "online" },
    { "id": "agent-cmo", "name": "CMO Yusef", "status": "online" },
    { "id": "agent-cto", "name": "CTO Kelvin", "status": "online" },
    { "id": "agent-cdo", "name": "CDO Jonas", "status": "online" },
    { "id": "agent-clo", "name": "CLO Bradley", "status": "online" }
  ]
}
```

---

### POST /api/meeting/end

회의를 종료하고 COO가 요약을 생성한다.

**요청**

```json
{
  "roomId": "room-abc123",
  "meetingId": "meeting-456",
  "endedBy": "user-001"
}
```

**응답 (200 OK)**

```json
{
  "success": true,
  "summary": {
    "duration": "45분",
    "decisionsCount": 3,
    "actionItemsCount": 7,
    "decisions": [
      {
        "id": "dec-001",
        "description": "Q2 마케팅 예산 15% 증액 승인",
        "decidedBy": "김대표"
      }
    ],
    "actionItems": [
      {
        "id": "act-001",
        "description": "마케팅 예산 증액 보고서 작성",
        "assignee": "CFO Amelia",
        "deadline": "2026-03-18"
      }
    ],
    "summaryArtifact": {
      "id": "art-001",
      "type": "markdown",
      "name": "회의록_2026-03-11.md",
      "url": "https://storage.blob.core.windows.net/artifacts/회의록_2026-03-11.md"
    }
  }
}
```

---

> **ℹ️ Sophia API 없음**: Sophia의 시각화 생성(`callSophiaVisualGPT`)과 버퍼 관리(`sophiaAgent.addToBuffer`)는
> HTTP API가 아니라 **VoiceLiveOrchestrator 내부 이벤트 파이프라인**으로 처리된다.
> 시각화는 `agentDone` 이벤트 핸들러에서 자동 트리거되고, 회의록은 `POST /api/meeting/end`에서 생성된다.
> (상세 흐름은 §5.5 참조)

### POST /api/room/join

사용자가 방에 입장한다.

**요청**

```json
{
  "roomId": "room-abc123",
  "userId": "user-001",
  "userName": "김대표",
  "role": "chairman"
}
```

**응답 (200 OK)**

```json
{
  "success": true,
  "room": {
    "id": "room-abc123",
    "name": "주간 임원회의",
    "phase": "idle",
    "participantCount": 8
  },
  "signalRUrl": "https://bizroom-signalr.service.signalr.net",
  "accessToken": "eyJ..."
}
```

---

### POST /api/room/leave

사용자가 방에서 퇴장한다.

**요청**

```json
{
  "roomId": "room-abc123",
  "userId": "user-001"
}
```

**응답 (200 OK)**

```json
{
  "success": true,
  "remainingParticipants": 7
}
```

---

### GET /api/artifacts/:id

생성된 아티팩트를 다운로드한다.

**응답 (200 OK)**

- `Content-Type`: 아티팩트의 MIME 타입
- `Content-Disposition`: `attachment; filename="report_2026-03-11.xlsx"`
- Body: 파일 바이너리

**에러 응답 (404 Not Found)**

```json
{
  "success": false,
  "error": "ARTIFACT_NOT_FOUND",
  "message": "아티팩트를 찾을 수 없습니다."
}
```

---

### POST /api/negotiate

SignalR 연결 협상 엔드포인트.

**요청**

```json
{
  "userId": "user-001",
  "roomId": "room-abc123"
}
```

**응답 (200 OK)**

```json
{
  "url": "https://bizroom-signalr.service.signalr.net/client/?hub=bizroom",
  "accessToken": "eyJ..."
}
```

---

### 공통 에러 코드

| 코드                     | HTTP 상태   | 설명                          |
| ------------------------ | ----------- | ----------------------------- |
| `INVALID_ROOM`           | 400         | 존재하지 않는 방              |
| `INVALID_USER`           | 400         | 존재하지 않는 사용자          |
| `UNAUTHORIZED`           | 401         | 인증 실패                     |
| `FORBIDDEN`              | 403         | 권한 없음                     |
| `ARTIFACT_NOT_FOUND`     | 404         | 아티팩트 없음                 |
| `MEETING_IN_PROGRESS`    | 409         | 이미 진행 중인 회의 존재      |
| `AGENT_TIMEOUT`          | 504         | 에이전트 응답 시간 초과       |
| `INTERNAL_ERROR`         | 500         | 내부 서버 오류                |
