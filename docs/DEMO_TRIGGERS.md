---
version: "1.0.0"
created: "2026-03-12 22:30"
updated: "2026-03-12 22:30"
---

# BizRoom 데모 트리거 문장집

> Chairman이 자연스럽게 말할 수 있는 문장들.
> 에이전트의 응답은 조작되지 않음 — 사고 프레임워크에 의해 자연 발생.

## 회의 오프닝

```
"오늘은 BizRoom AppSource 런칭 전략을 논의합시다."
```

- Hudson COO가 자동으로 안건 정리 + 참석자 확인
- 예상 visual: 없음 (opening phase)

---

## 1. 고객 분석 → Yusef CMO

```
"Yusef, 우리 타겟 고객을 어떻게 세분화하면 좋을까?"
```

- 예상 visual: `pie-chart` (고객 세그먼트 비율)
- 예상 mention: Amelia CFO에게 세그먼트별 예산 의견 요청 가능
- Brand Memory 활용: targetCustomer, marketSize, marketStats

---

## 2. GTM 전략 → Yusef CMO

```
"런칭 채널을 어디에 집중해야 할까? Product Hunt? AppSource?"
```

- 예상 visual: `bar-chart` (채널별 도달/전환 비교) 또는 `comparison`
- 예상 interaction: Chairman confirm (채널 선택)
- Brand Memory 활용: competitors, differentiation

---

## 3. 가격 전략 → Amelia CFO

```
"Amelia, 가격 전략을 어떻게 가져가면 좋겠어?"
```

- 예상 visual: `comparison` (A/B 가격 전략 비교)
- 예상 interaction: Chairman confirm (가격안 선택 버튼)
- Brand Memory 활용: pricing, competitors, revenueModel

---

## 4. 수익 구조 → Amelia CFO

```
"플랜별 예상 수익 구조를 분석해줘."
```

- 예상 visual: `bar-chart` (플랜별 수익 비교)
- Brand Memory 활용: pricing tiers (Free/Pro/Team)

---

## 5. 기술 아키텍처 → Kelvin CTO

```
"Kelvin, BizRoom 기술 아키텍처를 간단히 설명해줘."
```

- 예상 visual: `architecture` (시스템 구조도)
- Brand Memory 활용: techStack

---

## 6. 기술 우선순위 → Kelvin CTO

```
"MVP에서 가장 먼저 안정화해야 할 기능이 뭘까?"
```

- 예상 visual: `checklist` 또는 없음
- 예상 interaction: Chairman confirm (우선순위 선택)
- Brand Memory 활용: coreFeatures, challenges

---

## 7. 브랜드 / UX → Jonas CDO

```
"Jonas, 랜딩페이지 첫인상을 어떤 톤으로 가져가야 할까?"
```

- 예상 visual: `comparison` (디자인 방향 A/B)
- 예상 interaction: Chairman confirm 가능
- Brand Memory 활용: brandCopy, subCopy, positioning

---

## 8. 접근성 → Jonas CDO

```
"접근성 관점에서 놓치고 있는 부분이 있을까?"
```

- 예상 visual: `checklist` (접근성 체크리스트)
- 예상 mention: Kelvin CTO에게 기술 구현 확인 요청 가능

---

## 9. 법적 요건 → Bradley CLO

```
"Bradley, AppSource 등록할 때 법적으로 챙겨야 할 것들을 정리해줘."
```

- 예상 visual: `checklist` (법적 체크리스트)
- Brand Memory 활용: industry (AI SaaS → GDPR/개인정보 이슈)

---

## 10. AI 윤리 → Bradley CLO

```
"AI 서비스로서 Responsible AI 관점에서 리스크가 있을까?"
```

- 예상 visual: `summary` 또는 `checklist`
- 예상 mention: Kelvin CTO에게 기술적 안전장치 확인 요청

---

## 11. 실행 로드맵 → Hudson COO

```
"Hudson, 런칭까지 실행 로드맵을 정리해줘."
```

- 예상 visual: `timeline` (마일스톤 타임라인)
- 예상 mention: 각 임원에게 담당 확인 요청 가능

---

## 12. Excel 산출물 → Amelia CFO

```
"Amelia, 1년차 수익 예측을 Excel로 정리해줄 수 있어?"
```

- 예상 artifact: Excel 파일 생성 (SheetJS)
- Brand Memory 활용: pricing, marketSize

---

## 13. 법적 문서 산출물 → Bradley CLO

```
"Bradley, 이용약관 초안을 만들어줘."
```

- 예상 artifact: 이용약관 문서 생성
- Brand Memory 활용: productName, productDescription

---

## 14. 회의 마무리 → Hudson COO

```
"정리하고 마무리합시다."
```

- 예상 visual: `summary` (전체 논의 요약)
- 예상 artifact: 회의록 (Markdown)
- Hudson이 자동으로 액션아이템 + 담당자 + 다음 회의 제안

---

## 3분 시연 추천 코스 (핵심 7개)

| 순서 | 문장                                               | 트리거 기능                     |
| ---- | -------------------------------------------------- | ------------------------------- |
| ①    | "오늘은 AppSource 런칭 전략을 논의합시다"          | 회의 오프닝                     |
| ②    | "Yusef, 타겟 고객을 어떻게 세분화하면 좋을까?"    | 🖥️ pie-chart                   |
| ③    | "Amelia, 가격 전략을 어떻게 가져가면 좋겠어?"     | 🖥️ comparison + ✅ confirm      |
| ④    | "Kelvin, 기술 아키텍처를 간단히 설명해줘"          | 🖥️ architecture                |
| ⑤    | "Bradley, AppSource 법적 요건을 정리해줘"          | 🖥️ checklist                   |
| ⑥    | "Hudson, 런칭까지 로드맵을 정리해줘"               | 🖥️ timeline                    |
| ⑦    | "정리하고 마무리합시다"                            | 📄 회의록 + 🖥️ summary         |

---

## 주의사항

- 이 문장들은 트리거 **의도**이지, 정답 **대본**이 아님
- 에이전트 응답은 Brand Memory + 사고 프레임워크로 자연 생성됨
- 같은 질문이라도 대화 맥락에 따라 다른 응답이 나올 수 있음
- visual_hint는 에이전트가 자율 판단 — 100% 보장은 아님
