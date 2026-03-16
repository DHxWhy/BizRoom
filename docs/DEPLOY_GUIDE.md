---
version: "1.0.0"
created: "2026-03-12 23:00"
updated: "2026-03-12 23:00"
---

# BizRoom 배포 + 제출 가이드

> D-3 (마감: 3월 15일) — 순서대로 따라가면 됩니다.

---

## Phase 1: Azure 환경 준비

### 1-1. Azure CLI 설치

Windows 터미널에서:

```powershell
winget install -e --id Microsoft.AzureCLI
```

설치 후 **터미널 재시작** 필요.

확인:

```bash
az version
```

### 1-2. Azure 로그인

```bash
az login
```

브라우저가 열리면 Microsoft 계정으로 로그인.
구독이 여러 개면 해커톤용 구독을 선택:

```bash
az account list --output table
az account set --subscription "<구독 이름 또는 ID>"
```

### 1-3. Azure 리소스 생성

`provision.sh`를 그대로 실행하거나, 아래를 순서대로:

```bash
# 리소스 그룹
az group create --name rg-bizroom --location koreacentral

# Azure OpenAI (GPT-4o는 eastus2에서만 가용)
az cognitiveservices account create \
  --name bizroom-openai \
  --resource-group rg-bizroom \
  --kind OpenAI \
  --sku S0 \
  --location eastus2

# GPT-4o 모델 배포
az cognitiveservices account deployment create \
  --name bizroom-openai \
  --resource-group rg-bizroom \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-08-06" \
  --model-format OpenAI \
  --sku-capacity 30 \
  --sku-name Standard

# Azure SignalR (Serverless 모드 필수)
az signalr create \
  --name bizroom-signalr \
  --resource-group rg-bizroom \
  --sku Free_F1 \
  --service-mode Serverless \
  --location koreacentral
```

> Static Web Apps는 GitHub 연결 후 별도 생성 (Phase 3에서)

### 1-4. 키 수집

```bash
# OpenAI Endpoint
az cognitiveservices account show \
  --name bizroom-openai \
  --resource-group rg-bizroom \
  --query properties.endpoint -o tsv

# OpenAI Key
az cognitiveservices account keys list \
  --name bizroom-openai \
  --resource-group rg-bizroom \
  --query key1 -o tsv

# SignalR Connection String
az signalr key list \
  --name bizroom-signalr \
  --resource-group rg-bizroom \
  --query primaryConnectionString -o tsv
```

---

## Phase 2: 환경변수 설정 + 로컬 테스트

### 2-1. 환경변수 파일 생성

프로젝트 루트에 `.env` 생성 (git에 커밋되지 않음):

```env
AZURE_OPENAI_ENDPOINT=https://bizroom-openai.openai.azure.com/
AZURE_OPENAI_API_KEY=<Phase 1-4에서 얻은 키>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_SIGNALR_CONNECTION_STRING=<Phase 1-4에서 얻은 연결 문자열>
```

### 2-2. backend/local.settings.json 업데이트

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureSignalRConnectionString": "<SignalR 연결 문자열>",
    "AZURE_OPENAI_ENDPOINT": "https://bizroom-openai.openai.azure.com/",
    "AZURE_OPENAI_API_KEY": "<OpenAI 키>",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4o"
  },
  "Host": {
    "CORS": "http://localhost:3006",
    "CORSCredentials": true
  }
}
```

### 2-3. 로컬 실행

터미널 1 — 백엔드:

```bash
cd backend
npm install
npm run build
npm run start
# → http://localhost:7071 에서 Functions 실행
```

터미널 2 — 프론트엔드:

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3006 에서 앱 실행
```

### 2-4. 로컬 테스트 체크리스트

- [ ] 로비 페이지 로드
- [ ] 이름 입력 → 브랜드 메모리 → 안건 → 입장
- [ ] 데모 프리셋 클릭 → Maestiq 데이터 자동 입력
- [ ] 회의 시작 → COO Hudson 인사 응답 (실제 GPT-4o)
- [ ] 메시지 전송 → 에이전트 스트리밍 응답
- [ ] Brand Memory 반영 확인 (에이전트가 "Maestiq", "BizRoom" 언급하는지)

---

## Phase 3: GitHub + Azure 배포

### 3-1. GitHub Public 전환

GitHub → `DHxWhy/BizRoom` → Settings → Danger Zone → **Change visibility** → Public

> 심사 요구사항: "공개(public) GitHub 리포지토리"

### 3-2. 민감 정보 확인

Public 전환 전 반드시 확인:

- [ ] `.env` 가 `.gitignore`에 포함되어 있는가
- [ ] `local.settings.json` 에 실제 키가 없는가 (빈 문자열인지)
- [ ] 커밋 히스토리에 시크릿이 노출된 적 없는가

### 3-3. Azure Static Web Apps 배포

Azure Portal에서 생성하는 것이 가장 편함:

1. Azure Portal → Static Web Apps → 만들기
2. GitHub 연결 → `DHxWhy/BizRoom` → `main` 브랜치
3. 빌드 설정:
   - App location: `/frontend`
   - API location: `/backend`
   - Output location: `dist`
4. 환경변수 추가 (Configuration → Application settings):
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_DEPLOYMENT`
   - `AzureSignalRConnectionString`

### 3-4. 배포 확인

```bash
git push origin main
```

Static Web Apps가 자동으로 빌드 + 배포.
GitHub Actions 탭에서 빌드 상태 확인.

배포된 URL (예: `https://bizroom-app.azurestaticapps.net`)에서 동작 확인.

---

## Phase 4: Azure 서비스 확장 (심사 점수 부스트)

> 현재 4개 → 목표 7~8개 Azure 서비스

### 4-1. Application Insights (난이도: 하, 10분)

```bash
az monitor app-insights component create \
  --app bizroom-insights \
  --location koreacentral \
  --resource-group rg-bizroom
```

연결 문자열을 Static Web Apps 환경변수에 추가:
`APPLICATIONINSIGHTS_CONNECTION_STRING`

### 4-2. Bing Search API (난이도: 하, 15분)

```bash
az cognitiveservices account create \
  --name bizroom-bing \
  --resource-group rg-bizroom \
  --kind Bing.Search.v7 \
  --sku S1 \
  --location global
```

환경변수: `BING_SEARCH_API_KEY`

> Brand Memory 링크 크롤링 + 경쟁사 분석 기능에 활용

### 4-3. Cosmos DB (난이도: 중, 1~2시간)

```bash
az cosmosdb create \
  --name bizroom-db \
  --resource-group rg-bizroom \
  --kind GlobalDocumentDB \
  --locations regionName=koreacentral \
  --default-consistency-level Session \
  --enable-free-tier true

az cosmosdb sql database create \
  --account-name bizroom-db \
  --resource-group rg-bizroom \
  --name bizroom

az cosmosdb sql container create \
  --account-name bizroom-db \
  --resource-group rg-bizroom \
  --database-name bizroom \
  --name rooms \
  --partition-key-path /roomId
```

환경변수: `COSMOS_CONNECTION_STRING`

> ContextBroker 저장소를 인메모리 → Cosmos DB로 교체
> Claude가 코드 수정 지원 가능

### 4-4. Azure AI Speech (난이도: 중, 선택)

```bash
az cognitiveservices account create \
  --name bizroom-speech \
  --resource-group rg-bizroom \
  --kind SpeechServices \
  --sku F0 \
  --location koreacentral
```

환경변수: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`

---

## Phase 5: 제출물 준비

### 5-1. 아키텍처 다이어그램 (필수)

아키텍처 다이어그램에 반드시 포함할 서비스들:

```
[사용자 브라우저]
    ↕ HTTPS
[Azure Static Web Apps] — React + Three.js
    ↕ /api proxy
[Azure Functions v4] — Node.js 20
    ↕
    ├── [Azure OpenAI] — GPT-4o (Agent Framework)
    ├── [Azure SignalR] — 실시간 통신 (Serverless)
    ├── [Cosmos DB] — 회의 데이터 저장
    ├── [Bing Search API] — 실시간 데이터 그라운딩
    ├── [Azure AI Speech] — 음성 입출력
    └── [Application Insights] — 모니터링
```

> 도구: draw.io, Excalidraw, 또는 PowerPoint
> 파일: `docs/architecture-diagram.png`

### 5-2. README.md 정리

필수 항목:
- [ ] 프로젝트 설명 (문제, 솔루션, 기술)
- [ ] 사용된 Azure 서비스 목록
- [ ] 로컬 실행 방법
- [ ] 아키텍처 다이어그램 이미지 포함
- [ ] 데모 URL
- [ ] 스크린샷

### 5-3. 데모 영상 (2분 이내)

촬영 순서:

1. (0:00~0:15) 문제 제시: "1인 창업자는 C-Suite가 없다"
2. (0:15~0:30) 솔루션 소개: BizRoom.ai 한 줄 설명
3. (0:30~1:45) 라이브 데모:
   - 로비 → 브랜드 메모리 프리셋 → 입장
   - 에이전트와 대화 (1~2개 트리거)
   - BigScreen 시각화
   - Chairman confirm 인터랙션
   - Excel/회의록 생성
4. (1:45~2:00) 클로징: 가격/비전

> YouTube 또는 Vimeo에 업로드 → 공개 링크

### 5-4. 팀원 정보

- Microsoft Learn 사용자명 필요
- https://learn.microsoft.com 에서 프로필 확인

---

## 전체 타임라인

### Day 1 — 3월 12일 (오늘 밤)

- [ ] Azure CLI 설치
- [ ] `az login`
- [ ] Azure 리소스 생성 (Phase 1)
- [ ] 환경변수 설정 + 로컬 테스트 (Phase 2)

### Day 2 — 3월 13일

- [ ] GitHub Public 전환 + 민감정보 확인 (Phase 3-1, 3-2)
- [ ] Azure Static Web Apps 배포 (Phase 3-3, 3-4)
- [ ] Azure 서비스 확장: App Insights + Bing Search (Phase 4-1, 4-2)
- [ ] (선택) Cosmos DB 추가 (Phase 4-3)
- [ ] 배포 URL에서 전체 데모 테스트

### Day 3 — 3월 14일

- [ ] 아키텍처 다이어그램 작성 (Phase 5-1)
- [ ] README.md 정리 (Phase 5-2)
- [ ] 데모 영상 촬영 + 업로드 (Phase 5-3)
- [ ] 최종 버그 수정 + 테스트
- [ ] 제출

### D-day — 3월 15일

- [ ] 최종 제출 확인
- [ ] 배포 URL 작동 확인

---

## 환경변수 총 목록 (최종)

| 변수                                   | 서비스              | 필수 |
| -------------------------------------- | ------------------- | ---- |
| `AZURE_OPENAI_ENDPOINT`               | Azure OpenAI        | ✅   |
| `AZURE_OPENAI_API_KEY`                | Azure OpenAI        | ✅   |
| `AZURE_OPENAI_DEPLOYMENT`             | Azure OpenAI        | ✅   |
| `AzureSignalRConnectionString`        | Azure SignalR       | ✅   |
| `BING_SEARCH_API_KEY`                 | Bing Search         | 선택 |
| `COSMOS_CONNECTION_STRING`            | Cosmos DB           | 선택 |
| `AZURE_SPEECH_KEY`                    | Azure AI Speech     | 선택 |
| `AZURE_SPEECH_REGION`                 | Azure AI Speech     | 선택 |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights      | 선택 |
