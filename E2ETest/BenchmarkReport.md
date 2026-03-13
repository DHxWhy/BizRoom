---
version: "1.0.0"
created: "2026-03-14 07:00"
updated: "2026-03-14 07:00"
---

# AI Model Benchmark Report — BizRoom.ai

> 동일 프롬프트로 5개 모델의 응답 속도·품질·비용을 비교 측정한 결과입니다.
> 테스트 환경: Azure Functions (bizroom-backend) + Direct API 호출

---

## 테스트 조건

| 항목         | 값                                                  |
| ------------ | --------------------------------------------------- |
| 프롬프트     | "Q2 마케팅 예산 3000만원 채널별 배분 전략 제안"      |
| System       | "You are Hudson, COO. Respond in Korean. 3 sentences max." |
| max_tokens   | 300                                                 |
| temperature  | 0.5                                                 |
| 측정 방식    | Direct API 호출 (네트워크 왕복 포함)                |

---

## 단일 에이전트 응답 (Direct API)

| 모델                          | Provider   | 응답 시간 | 품질                                      | 토큰 (in/out)  | 비용 효율 |
| ----------------------------- | ---------- | --------- | ----------------------------------------- | -------------- | --------- |
| **claude-sonnet-4-6**         | Anthropic  | **6.4초** | 상세 배분안 + 비율 + 금액, 논리적 구조    | 60 / 281       | 중        |
| **claude-haiku-4-5-20251001** | Anthropic  | **3.1초** | 유사 배분안, 약간 간결하나 충분한 품질    | 59 / 253       | 상        |
| **gpt-4o**                    | OpenAI     | **1.4초** | 3문장 구조, 채널별 비율 제시              | 38 / 92        | 상        |
| **gpt-4o-mini**               | OpenAI     | **1.8초** | gpt-4o와 유사, 약간 간결                  | 38 / 80        | 최상      |
| **gpt-4o-realtime-preview**   | OpenAI     | -         | REST 미지원 (WebSocket 전용)              | -              | -         |

---

## Backend 경유 (3 에이전트 순차 스트리밍, SSE)

| 모델 설정            | 전체 시간 (3 agents) | 에이전트당 평균 | 첫 응답 (TTFB)  |
| -------------------- | -------------------- | --------------- | ---------------- |
| **claude-opus-4-6**  | ~21초                | ~7.0초          | ~4.5초           |
| **claude-sonnet-4-6** | ~10초               | ~3.3초          | ~2.5초           |
| **claude-haiku-4-5** | 추정 ~6초            | ~2.0초          | ~1.5초           |
| **gpt-4o** (예상)    | 추정 ~5초            | ~1.5초          | ~1.0초           |

> Backend 경유 시간 = API 호출 + 시스템 프롬프트 처리 + SSE 인코딩 + 네트워크 오버헤드

---

## GPT Realtime 1.5 (음성 전용)

| 항목               | 설명                                                           |
| ------------------ | -------------------------------------------------------------- |
| **프로토콜**       | WebSocket (양방향 스트리밍) — REST Chat Completions API 미지원 |
| **설계 용도**      | 실시간 음성 대화 (Push-to-Talk ↔ 에이전트 음성 응답)           |
| **예상 응답 시간** | < 1초 (WebSocket 연결 유지 상태)                               |
| **현재 상태**      | VoiceLiveOrchestrator에 구현됨, WebRTC 세션 활성화 필요        |
| **활성화 조건**    | OpenAI API 잔액 ✅ + Live 모드 PTT 입력 경로                   |

---

## 모델별 특성 비교

| 기준             | Opus 4.6     | Sonnet 4.6    | Haiku 4.5     | GPT-4o       | GPT-4o-mini  |
| ---------------- | ------------ | ------------- | ------------- | ------------ | ------------ |
| **속도**         | ★★☆☆☆       | ★★★☆☆        | ★★★★☆        | ★★★★★       | ★★★★★       |
| **품질**         | ★★★★★       | ★★★★☆        | ★★★☆☆        | ★★★★☆       | ★★★☆☆       |
| **비용**         | $$$$$        | $$$           | $              | $$$          | $            |
| **한국어**       | 매우 자연    | 자연          | 자연          | 자연         | 자연         |
| **적합 용도**    | 심층 분석    | 일반 회의     | 빠른 응답     | 일반 회의    | 빠른 응답    |

---

## 권장 설정

### 해커톤 데모용 (속도 우선)

```
ANTHROPIC_MODEL_PREMIUM  = claude-sonnet-4-6       (일반 에이전트 응답)
ANTHROPIC_MODEL_BALANCED = claude-sonnet-4-6       (시각화/아티팩트)
ANTHROPIC_MODEL_FAST     = claude-haiku-4-5-20251001 (파싱/분류)
```

예상 성능: 에이전트당 ~3초, 3명 순차 ~10초

### 프로덕션 최적 (품질·속도 균형)

```
ANTHROPIC_MODEL_PREMIUM  = claude-sonnet-4-6       (품질 유지)
ANTHROPIC_MODEL_BALANCED = claude-haiku-4-5-20251001 (시각화 속도↑)
ANTHROPIC_MODEL_FAST     = claude-haiku-4-5-20251001 (파싱 최속)
```

### 음성 회의 최적 (< 1초 목표)

```
음성 입력 → GPT Realtime 1.5 (WebSocket, <1초)
텍스트 채팅 → claude-sonnet-4-6 (~3초)
시각화/파싱 → claude-haiku-4-5-20251001 (~1.5초)
```

---

## 발견된 이슈

| #  | 이슈                                       | 상태     | 해결 방법                                          |
| -- | ------------------------------------------ | -------- | -------------------------------------------------- |
| 1  | Opus 모델명 `claude-opus-4-6-20250929` 404 | **해결** | 환경변수로 `claude-opus-4-6` 오버라이드            |
| 2  | OpenAI 잔액 부족 (`insufficient_quota`)     | **해결** | 사용자 크레딧 충전 완료                            |
| 3  | Haiku via Backend 타임아웃                  | **해결** | 설정 연속 변경 후 Azure 불안정 → 재시작으로 복구   |
| 4  | Realtime 1.5 REST 미지원                   | 정상     | WebSocket 전용 프로토콜 (설계대로)                 |
| 5  | 순차 호출 병목 (3 agents × 3초 = 10초)     | 인지     | 병렬 호출 아키텍처 변경 시 ~3초로 단축 가능        |

---

## 현재 적용된 설정

```
ANTHROPIC_MODEL_PREMIUM  = claude-sonnet-4-6
ANTHROPIC_MODEL_BALANCED = claude-sonnet-4-6
ANTHROPIC_MODEL_FAST     = claude-haiku-4-5
```
