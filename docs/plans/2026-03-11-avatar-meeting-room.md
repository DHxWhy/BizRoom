---
version: "1.0.0"
created: "2026-03-11 21:00"
updated: "2026-03-11 21:00"
---

# BizRoom.ai — 3D 아바타 회의실 WOW 임팩트 계획

> DialogLab (Google Research, UIST 2025) 영감 기반
> "AI 에이전트가 살아있는 것처럼 반응하는 가상 회의실"

---

## 1. 왜 이것이 WOW 포인트인가

### 현재 BizRoom (채팅 UI)
```
┌──────────────────────────────────┐
│  [Hudson 📋]: 정리하겠습니다...   │  ← 텍스트만 보임
│  [Amelia 💰]: 재무 관점에서...    │  ← 아바타 = 이모지
│  [Yusef 📣]: 마케팅 전략은...     │  ← 정적, 생동감 없음
└──────────────────────────────────┘
```

### 목표 BizRoom (3D 회의실)
```
┌─────────────────────────────────────────────┐
│  🏢 3D 가상 회의실                           │
│                                              │
│     [Hudson]  [Amelia]  [Yusef]             │
│       🗣️        😊        🤔               │
│     말하는 중   고개 끄덕  생각 중           │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 회의 테이블 + 화면 (아티팩트 표시)   │   │
│  └──────────────────────────────────────┘   │
│                                              │
│     [Chairman 👤]                            │
│      사용자 아바타                           │
└─────────────────────────────────────────────┘
```

### 심사 임팩트
| 심사 기준              | 텍스트 채팅     | 3D 회의실        |
| ---------------------- | --------------- | ----------------- |
| UX & Presentation      | 보통 (Slack류)  | **압도적** 차별화 |
| Agentic Design         | 보통            | **살아있는 AI**   |
| Real-world Impact      | 높음            | **극적으로 높음** |
| Multi-Agent System     | 높음            | **시각적 입증**   |
| 전체 인상              | "또 하나의 챗봇" | **"미래의 오피스"** |

---

## 2. 기술 스택 설계

### 2.1 핵심 라이브러리

| 라이브러리                    | 용도                           | 비고                         |
| ----------------------------- | ------------------------------ | ---------------------------- |
| `@react-three/fiber` (R3F)    | React에서 Three.js 사용        | npm, React 생태계 완벽 호환  |
| `@react-three/drei`           | 카메라, 조명, 환경 헬퍼        | R3F 필수 동반 라이브러리     |
| `three`                       | WebGL 3D 엔진                  | R3F 의존성                   |
| `talkinghead.mjs`             | 립싱크 + 표정 애니메이션       | DialogLab이 사용, MIT 라이선스 |
| Ready Player Me GLB           | 아바타 3D 모델                 | 무료, 커스텀 가능            |
| Web Speech API                | STT (이미 구현됨)              | 기존 PTT와 통합              |
| `leva` (선택)                 | 3D 씬 디버그 컨트롤            | 개발 시 편의                 |

### 2.2 아키텍처

```
┌────────────────────────────────────────────────────────┐
│                    React App                            │
│                                                         │
│  ┌───────────────────┐  ┌────────────────────────────┐ │
│  │  3D Meeting Room   │  │  Chat Panel (기존)          │ │
│  │  (R3F Canvas)      │  │  Messages + Input           │ │
│  │                    │  │                              │ │
│  │  ┌──────────────┐ │  │  ┌────────────────────────┐ │ │
│  │  │ Avatar ×6    │ │  │  │ MessageBubble          │ │ │
│  │  │ + LipSync    │ │  │  │ TypingIndicator        │ │ │
│  │  │ + Animations │ │  │  │ QuickActions           │ │ │
│  │  │ + Emotions   │ │  │  │ InputArea + PTT        │ │ │
│  │  └──────────────┘ │  │  └────────────────────────┘ │ │
│  │                    │  │                              │ │
│  │  ┌──────────────┐ │  └────────────────────────────┘ │
│  │  │ Environment  │ │                                  │
│  │  │ Table, Room  │ │                                  │
│  │  │ Screen, Lamp │ │                                  │
│  │  └──────────────┘ │                                  │
│  └───────────────────┘                                  │
└────────────────────────────────────────────────────────┘
```

### 2.3 레이아웃 옵션

**Option A: 3D 메인 + 채팅 사이드바** (추천)
```
┌────────────────────────────────────────────────────┐
│  Sidebar  │     3D Meeting Room (60%)     │ Chat   │
│  참여자   │     아바타들이 회의 중        │ (30%)  │
│  목록     │     테이블 중앙에 화면        │ 메시지 │
│           │                               │ 입력   │
└────────────────────────────────────────────────────┘
```

**Option B: 탭 전환** (구현 쉬움)
```
[🏢 회의실] [💬 채팅] [📄 아티팩트]  ← 탭 전환
```

**Option C: 3D 전체화면 + 오버레이 채팅** (데모 최적)
```
┌────────────────────────────────────────────────────┐
│           3D Meeting Room (전체)                    │
│                                                     │
│   [Hudson]   [Amelia]   [Yusef]                    │
│     🗣️         😊         🤔                      │
│                                                     │
│              [회의 테이블]                           │
│                                                     │
│         [Chairman]                                  │
│                                                     │
│  ┌──────────────────────────────┐                   │
│  │ 채팅 오버레이 (반투명)       │                   │
│  │ Hudson: 정리하겠습니다...    │                   │
│  │ Amelia: 재무 관점에서...     │                   │
│  │ [입력] [🎤] [전송]          │                   │
│  └──────────────────────────────┘                   │
└────────────────────────────────────────────────────┘
```

---

## 3. 아바타 설계

### 3.1 Ready Player Me 아바타 생성

각 C-Suite 에이전트에 맞는 프로페셔널 아바타 생성:

| 에이전트   | 아바타 특성                          | 복장          | 피부/헤어                |
| ---------- | ------------------------------------ | ------------- | ------------------------ |
| Hudson COO | 40대 남성, 리더십 분위기             | 네이비 슈트   | 짧은 갈색 머리           |
| Amelia CFO | 40대 여성, 분석적/차분               | 그레이 블레이저 | 단정한 브라운 헤어      |
| Yusef CMO  | 30대 남성, 에너지틱/트렌디           | 스마트 캐주얼 | 다크 헤어, 수염          |
| Kelvin CTO | 40대 남성, 테크 비전                 | 후디 + 재킷   | 안경, 짧은 머리          |
| Jonas CDO  | 30대 남성, 크리에이티브/인클루시브   | 캐주얼 셔츠   | 웨이비 헤어              |
| Bradley CLO| 50대 남성, 신중/권위                 | 포멀 슈트     | 회색 머리                |
| Chairman   | 사용자 대표 (제네릭)                 | 비즈캐주얼    | 커스텀 가능              |

### 3.2 아바타 상태 & 애니메이션

| 상태            | 애니메이션                      | 트리거                              |
| --------------- | ------------------------------- | ----------------------------------- |
| **Idle**        | 미세한 몸 흔들림, 눈 깜빡      | 기본 상태                           |
| **Speaking**    | 립싱크 + 제스처 + 고개 움직임  | 해당 에이전트 메시지 스트리밍 중    |
| **Listening**   | 고개 끄덕임, 시선 이동          | 다른 에이전트/사용자 발언 중        |
| **Thinking**    | 턱을 괴거나 팔짱                | 에이전트가 응답 생성 중 (타이핑)    |
| **Agreeing**    | 고개 끄덕 + 미소                | Quick Action "동의" 또는 텍스트 감지 |
| **Disagreeing** | 고개 젓기 + 손 흔들기           | Quick Action "반대" 또는 텍스트 감지 |
| **Presenting**  | 화면을 가리키는 제스처          | 아티팩트 생성 시                    |

### 3.3 립싱크 구현

```
에이전트 텍스트 응답
    ↓
Web Speech Synthesis (TTS) 또는 텍스트 분석
    ↓
Viseme 매핑 (발음→입 모양)
    ↓
TalkingHead.mjs 립싱크 애니메이션
    ↓
GLB 아바타 모프 타겟 조절
    ↓
실시간 렌더링 (60fps)
```

**TTS 없이 립싱크 (경량 접근)**:
- 텍스트 길이 기반으로 립싱크 타이밍 추정
- 글자 하나씩 표시되면서 입 모양 변화
- CSS 애니메이션 + morph target blend

---

## 4. 3D 회의실 환경 설계

### 4.1 씬 구성

```
Scene
├── Lighting
│   ├── AmbientLight (부드러운 전체 조명)
│   ├── DirectionalLight (그림자, 키라이트)
│   └── PointLight ×2 (보조 조명)
├── Environment
│   ├── HDRI 스카이박스 (오피스 환경)
│   └── Floor (반사 있는 바닥)
├── MeetingTable (원형/타원형 테이블)
│   └── Screen (아티팩트 표시용)
├── Chairs ×7 (에이전트 + 사용자)
├── Avatars
│   ├── HudsonAvatar (COO, 상석)
│   ├── AmeliaAvatar (CFO)
│   ├── YusefAvatar (CMO)
│   └── ChairmanAvatar (사용자)
├── Props
│   ├── 화이트보드 (브레인스토밍 모드)
│   ├── 시계 (회의 시간 표시)
│   └── 명패 (각 좌석에 이름표)
└── Camera
    ├── OrbitControls (사용자 자유 시점)
    └── AutoFocus (발언자 추적)
```

### 4.2 카메라 연출

| 상황                    | 카메라 동작                    |
| ----------------------- | ------------------------------ |
| 에이전트 발언 시작      | 발언자에게 부드럽게 줌인       |
| 사용자 발언             | 전체 회의실 뷰 (와이드)        |
| A2A 토론 (에이전트 간)  | 두 에이전트 사이 핑퐁 컷       |
| 아티팩트 생성           | 테이블 위 스크린으로 줌인      |
| 투표 (Quick Action)     | 전체 에이전트 반응 와이드 샷   |

---

## 5. 구현 단계 (Phase)

### Phase 1: 기본 3D 씬 (4시간)
1. `npm install three @react-three/fiber @react-three/drei`
2. `MeetingRoom3D` 컴포넌트 생성 (Canvas + 조명 + 바닥)
3. 원형 테이블 + 의자 배치 (primitive geometry)
4. Ready Player Me 아바타 GLB 로드 (1개 테스트)
5. OrbitControls로 시점 조작

### Phase 2: 아바타 시스템 (4시간)
1. 6개 에이전트 아바타 GLB 생성/로드
2. Idle 애니메이션 적용 (미세 움직임)
3. 발언 시 간단한 립싱크 (morph target)
4. 상태별 애니메이션 전환 (idle ↔ speaking ↔ thinking)

### Phase 3: 채팅 연동 (3시간)
1. 메시지 이벤트 → 아바타 상태 전환 연결
2. 타이핑 인디케이터 → thinking 애니메이션
3. 발언 완료 → idle 복귀
4. 카메라 자동 포커스 (발언자 추적)

### Phase 4: 폴리싱 (3시간)
1. HDRI 환경맵 적용 (사무실 분위기)
2. 그림자 + 반사 효과
3. 명패, 화이트보드, 시계 등 소품 추가
4. 반응형 레이아웃 (3D + 채팅 패널 배치)

### 총 예상: ~14시간 (해커톤 범위 내)

---

## 6. 핵심 컴포넌트 코드 스케치

### MeetingRoom3D.tsx (R3F 씬)
```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { AgentAvatar3D } from "./AgentAvatar3D";

const SEAT_POSITIONS = [
  { position: [0, 0, -1.5], rotation: [0, Math.PI, 0], agent: "coo" },
  { position: [-1.3, 0, -0.75], rotation: [0, Math.PI * 0.7, 0], agent: "cfo" },
  { position: [1.3, 0, -0.75], rotation: [0, -Math.PI * 0.7, 0], agent: "cmo" },
  { position: [0, 0, 1.5], rotation: [0, 0, 0], agent: "chairman" },
];

export function MeetingRoom3D({ speakingAgent, thinkingAgents }) {
  return (
    <Canvas camera={{ position: [0, 3, 5], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
      <Environment preset="apartment" />
      <ContactShadows opacity={0.5} />

      {/* Meeting Table */}
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <cylinderGeometry args={[1.2, 1.2, 0.05, 32]} />
        <meshStandardMaterial color="#4a3728" />
      </mesh>

      {/* Avatars */}
      {SEAT_POSITIONS.map((seat) => (
        <AgentAvatar3D
          key={seat.agent}
          agentRole={seat.agent}
          position={seat.position}
          rotation={seat.rotation}
          isSpeaking={speakingAgent === seat.agent}
          isThinking={thinkingAgents.includes(seat.agent)}
        />
      ))}

      <OrbitControls
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
        minDistance={3}
        maxDistance={10}
      />
    </Canvas>
  );
}
```

### AgentAvatar3D.tsx (아바타 컴포넌트)
```tsx
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect } from "react";

export function AgentAvatar3D({ agentRole, position, rotation, isSpeaking, isThinking }) {
  const group = useRef();
  const { scene, animations } = useGLTF(`/avatars/${agentRole}.glb`);
  const { actions } = useAnimations(animations, group);

  // Idle breathing animation
  useFrame((_, delta) => {
    if (group.current) {
      // Subtle breathing motion
      group.current.position.y = Math.sin(Date.now() * 0.001) * 0.01;
    }
  });

  // Animation state transitions
  useEffect(() => {
    if (isSpeaking) {
      actions?.talk?.play();
    } else if (isThinking) {
      actions?.think?.play();
    } else {
      actions?.idle?.play();
    }
  }, [isSpeaking, isThinking, actions]);

  return (
    <group ref={group} position={position} rotation={rotation}>
      <primitive object={scene} scale={1} />
      {/* Name plate */}
      {/* Speaking indicator (glow effect) */}
    </group>
  );
}
```

---

## 7. Ready Player Me 아바타 생성 가이드

### 생성 방법
1. https://readyplayer.me 에서 아바타 생성
2. 각 에이전트 페르소나에 맞게 커스텀
3. GLB 형식으로 다운로드
4. `frontend/public/avatars/` 에 배치

### 파일 구조
```
frontend/public/avatars/
├── coo-hudson.glb    (COO Hudson)
├── cfo-amelia.glb    (CFO Amelia)
├── cmo-yusef.glb     (CMO Yusef)
├── cto-kelvin.glb    (CTO Kelvin - v2)
├── cdo-jonas.glb     (CDO Jonas - v2)
├── clo-bradley.glb   (CLO Bradley - v2)
└── chairman.glb      (기본 사용자 아바타)
```

### Morph Targets (립싱크용)
Ready Player Me GLB는 기본적으로 다음 morph targets 포함:
- `viseme_*` (15개 viseme 모프)
- `mouthSmile`, `mouthFrown`
- `browInnerUp`, `browDown`
- `eyeWide`, `eyeSquint`
- `jawOpen`

---

## 8. DialogLab 대비 차별화 포인트

| 항목                 | DialogLab                       | BizRoom.ai                          |
| -------------------- | ------------------------------- | ----------------------------------- |
| 목적                 | 연구 프로토타입 (저작 도구)     | **프로덕트** (실제 사용자용)        |
| 대화 모델            | Gemini 2.0 Flash                | Azure AI Foundry (GPT-4o)           |
| 아바타               | Ready Player Me                 | Ready Player Me + **프로페셔널 커스텀** |
| 산출물               | 텍스트 대화만                   | **Excel, 회의록, 마케팅 플랜 등 실물** |
| 턴테이킹             | 설정 기반 (저작자가 정의)       | **AI 자동 (TopicClassifier + TurnManager)** |
| 사용자 입력          | 텍스트                          | **텍스트 + 음성 (PTT)**             |
| 실시간 멀티유저      | 지원                            | **지원 (SignalR)**                   |
| Microsoft 생태계     | 없음                            | **Graph API, OneDrive, Calendar**    |

---

## 9. 리스크 & 완화 전략

| 리스크                       | 확률 | 완화 전략                                           |
| ---------------------------- | ---- | --------------------------------------------------- |
| 3D 렌더링 성능 저하          | 중   | LOD, 아바타 수 제한, 모바일은 2D 폴백               |
| GLB 로딩 시간 (네트워크)     | 중   | preload, 압축(draco), 로딩 스크린                   |
| 립싱크 품질 낮음             | 높   | TTS 없이도 텍스트 기반 타이밍으로 충분히 임팩트      |
| Ready Player Me 서비스 장애  | 낮   | 미리 다운로드한 GLB 사용 (오프라인)                  |
| 해커톤 시간 부족 (14시간)    | 중   | Phase 1-2만 해도 데모 임팩트 충분                    |

---

## 10. 결론

**3D 아바타 회의실은 BizRoom.ai의 킬러 피처**가 될 수 있다.

- 기술적으로 **100% 실현 가능** (DialogLab이 동일 스택으로 증명)
- React + Three.js + Ready Player Me로 **14시간 이내 구현 가능**
- 해커톤 심사에서 **"또 하나의 챗봇"이 아닌 "미래의 오피스"**로 포지셔닝
- **Grand Prize + Best Multi-Agent + Enterprise 세 카테고리 모두 공략** 가능

Sources:
- [Google Research DialogLab Blog](https://research.google/blog/beyond-one-on-one-authoring-simulating-and-testing-dynamic-human-ai-group-conversations/)
- [DialogLab GitHub](https://github.com/ecruhue/DialogLab)
- [DialogLab UIST 2025 Paper](https://dl.acm.org/doi/10.1145/3746059.3747696)
- [Convai 3D AI Avatars with Three.js](https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react)
- [Ready Player Me Visage](https://github.com/readyplayerme/visage)
