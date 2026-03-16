---
version: "1.0.0"
created: "2026-03-11 20:00"
updated: "2026-03-11 20:00"
---

# MVP 완성 계획 — 설계문서 GAP 해소

## 우선순위 기준: MVP_SCOPE.md Must Have 기능

---

## Task 1: 백엔드 오케스트레이션 연결
> `/api/message`를 TurnManager + ContextBroker + TopicClassifier로 교체

### 현재
- message.ts가 3 에이전트를 단순 순차 호출 (컨텍스트 없음, A2A 없음)

### 목표
- TopicClassifier로 주제 분류 → TurnManager로 응답 순서 결정
- ContextBroker로 대화 이력 + 결정사항 관리
- A2A 후속 응답 (반박/보완) 로직 활성화

### 파일
- Modify: `backend/src/functions/message.ts`
- Modify: `backend/src/functions/meetingStart.ts`
- Modify: `backend/src/functions/meetingEnd.ts`

---

## Task 2: PushToTalk ↔ InputArea 연결
> 스페이스바 음성 입력이 메시지로 전송되도록 연결

### 현재
- usePushToTalk 훅 구현됨, PushToTalk 컴포넌트 존재
- InputArea에 마운트 안 됨, 트랜스크립트가 메시지로 안 감

### 목표
- InputArea에 PushToTalk 컴포넌트 마운트
- 스페이스바 → 녹음 → 트랜스크립트 → 자동 전송
- 마이크 상태 표시 (빨간 점 애니메이션)

### 파일
- Modify: `frontend/src/components/input/InputArea.tsx`
- Modify: `frontend/src/components/input/PushToTalk.tsx`
- Modify: `frontend/src/hooks/usePushToTalk.ts`

---

## Task 3: Artifact 생성 및 메시지 첨부
> CFO Excel, COO 회의록이 실제 생성되어 메시지에 첨부

### 현재
- ExcelPlugin, MeetingMinutesPlugin 구현됨
- message endpoint에서 호출 안 됨
- Message.artifacts 항상 undefined

### 목표
- 에이전트 응답에서 artifact 생성 트리거 감지
- 생성된 artifact를 Message.artifacts에 첨부
- ArtifactPreview 컴포넌트가 실제 렌더링

### 파일
- Modify: `backend/src/functions/message.ts`
- Modify: `backend/src/agents/AgentFactory.ts`
- Modify: `frontend/src/components/chat/MessageBubble.tsx`

---

## Task 4: 타이핑 인디케이터 (REST 기반)
> 에이전트 응답 생성 중 타이핑 표시

### 현재
- 프론트엔드 TypingIndicator 컴포넌트 존재
- 백엔드에서 타이핑 이벤트 미발송

### 목표
- REST 모드에서도 타이핑 시뮬레이션 (에이전트 응답 전 표시)
- 응답 도착 시 타이핑 해제

### 파일
- Modify: `frontend/src/hooks/useSignalR.ts`
- Modify: `frontend/src/App.tsx`

---

## Task 5: 회의 시작/종료 플로우 완성
> meetingStart → 자동 개회사, meetingEnd → 회의록 생성

### 현재
- meetingStart: COO 개회사 생성하지만 ContextBroker 미연결
- meetingEnd: 요약 생성하지만 decisions/actionItems 항상 빈 배열

### 목표
- meetingStart: ContextBroker에 방 초기화, 프론트에서 자동 호출
- meetingEnd: 실제 대화 이력 기반 요약 + 회의록 artifact 생성

### 파일
- Modify: `backend/src/functions/meetingStart.ts`
- Modify: `backend/src/functions/meetingEnd.ts`
- Modify: `frontend/src/App.tsx`

---

## Task 6: 환경 변수 검증 + 에러 핸들링
> Azure OpenAI 키 없으면 명확한 에러, fallback mock 응답

### 파일
- Modify: `backend/src/agents/AgentFactory.ts`
- Modify: `.env.example`

---

## 실행 순서

1. Task 1 (오케스트레이션) — 핵심, 가장 큰 변경
2. Task 2 (PushToTalk) — 독립적, 병렬 가능
3. Task 3 (Artifact) — Task 1 의존
4. Task 4 (타이핑) — 독립적
5. Task 5 (회의 플로우) — Task 1 의존
6. Task 6 (환경 변수) — 독립적
