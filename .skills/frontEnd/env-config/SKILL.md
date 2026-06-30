---
name: 환경 변수 (Env Config)
description: .env 우선순위·환경별 분리·secret과 공개 설정 분리·클라이언트 노출 범위 통제·템플릿/검증을 다루는 환경 변수의 범용 표준으로, 빌드툴/프레임워크에 무관하다. 환경 변수를 추가·정비하거나 환경별 설정을 분리할 때, 비밀값 노출을 막을 때 읽는다.
rules:
  - "설정은 코드에서 분리한다: 환경마다 달라지는 값(API 주소·기능 플래그·키)은 코드에 하드코딩하지 말고 환경 변수로 외부화한다. 같은 빌드/이미지를 환경만 바꿔 재사용할 수 있게 한다."
  - "환경별로 분리한다: 개발·스테이징·운영 등 환경마다 별도 설정 파일/소스를 두고, 빌드/실행 시 어떤 환경인지를 명시적으로 선택한다. 한 파일을 빌드 직전에 수동 교체하는 방식은 금지한다."
  - "우선순위를 명확히 한다: 여러 .env 파일이 겹칠 때 무엇이 무엇을 덮어쓰는지 규칙을 정한다. 일반적으로 더 구체적·로컬일수록 우선한다(예: *.local > 환경별 > 공통)."
  - "secret과 공개 설정을 가른다: 비밀값(API key·DB 자격증명·토큰 서명키 등)과 공개해도 되는 설정(공개 API 주소·앱 버전)을 같은 통로에 섞지 않는다. secret은 별도 채널/시크릿 매니저로 관리한다."
  - "클라이언트 노출 범위를 통제한다: 프론트엔드 번들에 들어가는 변수는 누구나 추출할 수 있다고 가정한다. 클라이언트로 나가는 값은 명시적으로 표시된(접두사·allowlist 등) 공개 값만으로 한정하고, 그 외는 빌드/서버 시점에만 쓴다."
  - "비밀값이 필요한 호출은 서버에서: 클라이언트가 secret을 직접 쥐어야 하는 구조면 설계가 틀린 것이다. 비밀이 필요한 외부 호출은 백엔드/BFF에서 프록시한다."
  - "로컬 override는 커밋하지 않는다: 개인 로컬 값(*.local 등)과 secret이 섞인 파일은 VCS에 올리지 않는다. 대신 무엇을 채워야 하는지 알려주는 템플릿(.env.example)을 커밋한다."
  - "존재·형식을 검증한다: 필수 변수 누락이나 형식 오류는 런타임 깊숙한 곳이 아니라 부팅 시점에 빠르게 드러나게 한다(타입 정의·스키마 검증·기동 시 체크)."
tags:
  - "import.meta.env"
  - "VITE_"
  - "process.env"
  - ".env"
  - "envConfig"
---

# ⚙️ 환경 변수 (Env Config)

> 환경(개발/스테이징/운영)마다 달라지는 설정을 코드에서 분리하고, 비밀값과 공개 설정을 엄격히 가르며, 클라이언트로 나가는 값의 노출 범위를 통제한다. 환경 변수를 정의·로드·분기·보안 처리할 때 읽는다. 특정 빌드툴/프레임워크에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **설정은 코드에서 분리한다**: 환경마다 달라지는 값(API 주소·기능 플래그·키)은 코드에 하드코딩하지 말고 환경 변수로 외부화한다. 같은 빌드/이미지를 환경만 바꿔 재사용할 수 있게 한다.
- **환경별로 분리한다**: 개발·스테이징·운영 등 환경마다 별도 설정 파일/소스를 두고, 빌드/실행 시 어떤 환경인지를 명시적으로 선택한다. 한 파일을 빌드 직전에 수동 교체하는 방식은 금지한다.
- **우선순위를 명확히 한다**: 여러 `.env` 파일이 겹칠 때 무엇이 무엇을 덮어쓰는지 규칙을 정한다. 일반적으로 더 구체적·로컬일수록 우선한다(예: `*.local` > 환경별 > 공통).
- **secret과 공개 설정을 가른다**: 비밀값(API key·DB 자격증명·토큰 서명키 등)과 공개해도 되는 설정(공개 API 주소·앱 버전)을 같은 통로에 섞지 않는다. secret은 별도 채널/시크릿 매니저로 관리한다.
- **클라이언트 노출 범위를 통제한다**: 프론트엔드 번들에 들어가는 변수는 **누구나 추출할 수 있다**고 가정한다. 클라이언트로 나가는 값은 명시적으로 표시된(접두사·allowlist 등) 공개 값만으로 한정하고, 그 외는 빌드/서버 시점에만 쓴다.
- **비밀값이 필요한 호출은 서버에서**: 클라이언트가 secret을 직접 쥐어야 하는 구조면 설계가 틀린 것이다. 비밀이 필요한 외부 호출은 백엔드/BFF에서 프록시한다.
- **로컬 override는 커밋하지 않는다**: 개인 로컬 값(`*.local` 등)과 secret이 섞인 파일은 VCS에 올리지 않는다. 대신 무엇을 채워야 하는지 알려주는 템플릿(`.env.example`)을 커밋한다.
- **존재·형식을 검증한다**: 필수 변수 누락이나 형식 오류는 런타임 깊숙한 곳이 아니라 부팅 시점에 빠르게 드러나게 한다(타입 정의·스키마 검증·기동 시 체크).

## 2. 규칙

### 2-1. 설정을 코드에서 분리하고 환경별로 나눈다
- 환경마다 달라지는 값을 소스에 박지 말고 환경 변수로 외부화한다.
- 환경(dev/staging/prod)마다 별도 소스를 두고, 빌드/실행 시 환경을 명시적으로 선택한다.

```text
// ❌ 금지 — 코드에 환경 값 하드코딩 / 한 파일을 빌드 직전 수동 교체
const API = "https://prod-api.example.com"   // 환경 바뀔 때마다 코드 수정
.env 하나만 두고 배포 직전 손으로 값 바꿔치기

// ✅ 권장 — 환경별 설정 + 명시적 환경 선택
.env.development / .env.staging / .env.production
build --env=staging   // 어떤 환경인지 빌드/실행 시점에 선택
```

### 2-2. 파일 우선순위를 정한다
- 여러 설정 파일이 겹칠 때의 우선순위를 팀이 합의해 문서화한다.
- 일반 원칙: **더 구체적이고 더 로컬한 값이 더 일반적인 값을 덮어쓴다.**

```text
// 우선순위(높음 → 낮음) 예
환경별-로컬(.env.[env].local) > 환경별(.env.[env]) > 공통-로컬(.env.local) > 공통(.env)
```

| 분류 | 적용 범위 | VCS 커밋 |
|---|---|---|
| 공통 | 모든 환경 기본값 | O (secret 없을 때) |
| 공통-로컬 | 모든 환경, 개인 로컬 override | **X** |
| 환경별 | 특정 환경(dev/staging/prod) | O (secret 없을 때) |
| 환경별-로컬 | 특정 환경 + 개인 로컬 | **X** |

### 2-3. secret과 공개 설정을 분리한다
- 공개해도 되는 설정과 비밀값을 같은 통로에 섞지 않는다.
- secret은 환경 변수 파일에 평문으로 두기보다 시크릿 매니저/배포 파이프라인 주입을 우선한다.

```text
// ❌ 금지 — 공개 설정과 secret을 한 파일에 평문으로 섞음
PUBLIC_API_URL=https://api.example.com
DB_PASSWORD=super-secret        // 같은 파일·같은 통로

// ✅ 권장 — 공개 설정만 환경 파일에, secret은 별도 채널
PUBLIC_API_URL=https://api.example.com
# DB_PASSWORD 등 비밀은 시크릿 매니저/CI 주입으로 분리
```

> 비밀값 자체의 보관·로테이션·접근통제는 `secrets-management` 스킬을 함께 참고한다.

### 2-4. 클라이언트 노출 범위를 통제한다
- 프론트엔드 번들에 포함되는 값은 **공개된다**고 가정한다(번들에서 추출 가능).
- 클라이언트로 내보낼 변수는 명시적으로 구분(접두사·allowlist 등)하고, 그 외 변수는 클라이언트에서 접근 불가능하게 막는다.

```text
// ❌ 금지 — 비밀값을 클라이언트 노출 변수로 둠 (번들에 그대로 박힘)
CLIENT_OPENAI_API_KEY=sk-xxx     // dist 번들에서 누구나 추출

// ✅ 권장 — 클라이언트엔 공개 값만, 비밀은 서버 전용
CLIENT_API_URL=https://api.example.com   // 공개 OK
OPENAI_API_KEY=sk-xxx                     // 서버 환경에만, 클라이언트로 안 나감
```

### 2-5. 비밀이 필요한 호출은 백엔드/BFF에서 프록시한다
- 클라이언트가 secret을 직접 들고 외부 API를 부르는 구조를 만들지 않는다.
- 비밀이 필요한 호출은 서버(백엔드/BFF)가 대신 수행하고, 클라이언트는 자사 서버만 호출한다.

```text
// ❌ 금지 — 브라우저가 secret으로 외부 API 직접 호출
browser ──(API key)──▶ 외부 결제/AI API

// ✅ 권장 — 서버가 secret을 쥐고 프록시
browser ──▶ 우리 서버(BFF) ──(secret)──▶ 외부 API
```

### 2-6. 로컬 override·secret은 커밋하지 않고, 템플릿을 커밋한다
- 개인 로컬 값(`*.local` 등)과 secret이 섞인 파일은 `.gitignore`로 제외한다.
- 신규자가 무엇을 채워야 할지 알 수 있도록 값이 빈 템플릿(`.env.example`)을 커밋한다.

```text
// .gitignore (개념)
*.local            // 개인 로컬 override 제외
.env               // secret이 섞이면 공통 파일도 제외하고 example만 커밋

// .env.example (커밋용 템플릿 — 키만, 값은 비움)
PUBLIC_API_URL=
PUBLIC_APP_VERSION=
```

### 2-7. 필수 변수 존재·형식을 부팅 시점에 검증한다
- 필수 변수 누락·형식 오류가 런타임 깊은 곳에서 터지지 않도록, 기동 시점에 빠르게 실패하게 한다.
- 타입 정의/스키마 검증을 두어 어떤 변수가 어떤 형식으로 필요한지 한곳에서 보이게 한다.

```text
// ❌ 금지 — 누락된 변수를 한참 뒤 런타임에 undefined로 발견
fetch(config.apiUrl + "/x")   // apiUrl 미설정 → "undefined/x" 호출

// ✅ 권장 — 부팅 시 필수 변수 검증, 없으면 즉시 실패
assert env.PUBLIC_API_URL is set and is URL   // 기동 단계에서 fail-fast
```

## 3. 흔한 실수
- **secret을 클라이언트 노출 변수로 둠** → 번들에서 추출돼 유출된다. 비밀은 서버 전용으로, 노출 변수는 공개 값만.
- **로컬/secret 파일을 커밋** → 비밀 유출·환경 오염. `*.local`과 secret 섞인 파일은 ignore.
- **`.env.example` 미관리** → 신규자가 무엇을 채울지 모른다. 키만 담은 템플릿을 커밋한다.
- **환경 구분 없이 한 파일을 수동 교체** → 배포마다 휴먼에러. 환경별로 분리하고 환경을 명시적으로 선택한다.
- **환경 이름 오타로 분기 실패** (`producton`) → 의도한 환경 설정이 안 먹는다. 상수/타입으로 묶는다.
- **노출 규칙(접두사·allowlist)을 모르고 변수 접근** → 클라이언트에서 `undefined` 디버깅에 시간 낭비. 노출 규칙을 먼저 확인한다.
- **빌드툴별 접근 방식 혼동** → 빌드툴이 정한 접근 통로가 아닌 방식으로 읽어 항상 `undefined`. 스택의 규칙을 확인한다.
- **필수 변수 검증 생략** → 누락이 런타임 깊은 곳에서 터진다. 부팅 시점에 검증한다.

## 4. 체크리스트
- [ ] 환경마다 달라지는 값을 코드에서 분리해 환경 변수로 외부화했는가
- [ ] 환경(dev/staging/prod)별로 설정을 분리하고 환경을 **명시적으로 선택**하는가 (수동 교체 금지)
- [ ] 겹치는 설정 파일의 **우선순위**를 정해 두었는가
- [ ] secret과 공개 설정을 **다른 통로**로 분리했는가 (secret은 시크릿 매니저/주입)
- [ ] 클라이언트 번들에 나가는 변수를 **공개 값으로만** 한정했는가 (노출 범위 통제)
- [ ] 비밀이 필요한 호출을 백엔드/BFF로 프록시했는가 (클라이언트가 secret을 직접 쥐지 않게)
- [ ] 로컬 override·secret 파일을 `.gitignore`에 넣고, **`.env.example` 템플릿**을 커밋했는가
- [ ] 필수 변수의 존재·형식을 **부팅 시점**에 검증하는가 (타입 정의/스키마)

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: Next.js, Webpack/CRA, Node 서버, Vite 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다.

### Vite (Vue)

> 본문 1~4의 원칙·규칙을 Vite로 구현할 때의 **스택 구체값(파일명·접두사·명령·API)만** 싣는다. 우선순위·secret 분리·노출 통제 등의 "왜"는 본문을 본다.

#### 파일 우선순위 (본문 2-2의 Vite 구체값)

뒤에 오는 파일이 앞 파일을 **덮어쓴다**. 우선순위(높음 → 낮음): `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

| 파일 | 로드 시점 | git 커밋 |
|---|---|---|
| `.env` | 모든 모드 | O |
| `.env.local` | 모든 모드 (로컬 override) | **X** |
| `.env.[mode]` | 해당 모드 (`development`/`production`/`staging`) | O |
| `.env.[mode].local` | 해당 모드 + 로컬 | **X** |

#### `VITE_` 접두사 = 클라이언트 노출 통로 (본문 2-4의 Vite 구체값)

클라이언트(`import.meta.env`)에 노출되는 변수는 반드시 `VITE_`로 시작하고, 그 외 변수는 빌드 시점에만 쓰인다.

```dotenv
# .env
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0

# 노출 안 됨 (Vite plugin에서만 접근)
SENTRY_AUTH_TOKEN=xxx
```

#### 모드 전환

```bash
vite                              # development 모드 (.env.development 로드)
vite --mode staging               # staging 모드 (.env.staging 로드)
vite build                        # production 모드 (.env.production 로드)
vite build --mode staging         # staging 빌드
```

`package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build:staging": "vite build --mode staging",
    "build": "vite build"
  }
}
```

#### 환경별 API URL 매트릭스

| 파일 | VITE_API_URL | VITE_SENTRY_DSN |
|---|---|---|
| `.env.development` | http://localhost:8080/api | (empty) |
| `.env.staging` | https://staging-api.example.com | staging DSN |
| `.env.production` | https://api.example.com | prod DSN |

#### 사용 (`import.meta.env`)

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000
})
export default api
```

내장 변수: `import.meta.env.MODE`(현재 모드), `.DEV`/`.PROD`(boolean), `.BASE_URL`(app base URL). 모드 분기는 `import.meta.env.DEV`/`.PROD`로 한다.

#### 타입 정의 (본문 2-7 — 부팅 검증의 Vite 방식)

```typescript
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### Secret 분리 (본문 2-4·2-5 — `VITE_`는 빌드 결과물에 그대로 박힘)

```dotenv
# BAD - 클라이언트 번들에서 추출 가능
VITE_OPENAI_API_KEY=sk-xxx

# GOOD - 서버 .env에만, secret 호출은 BFF에서 프록시
OPENAI_API_KEY=sk-xxx
```

상세는 `security-frontend` skill 참고.

#### `.gitignore` (본문 2-6의 Vite 구체값)

```gitignore
.env.local
.env.*.local
```
`.env`/`.env.[mode]`는 secret이 없을 때만 커밋하고, secret이 섞이면 이들도 ignore하고 `.env.example`만 커밋한다.

```dotenv
# .env.example (커밋용 템플릿 — 키만, 값은 비움)
VITE_API_URL=
VITE_APP_VERSION=
VITE_SENTRY_DSN=
```

#### Vite 특유의 흔한 실수

- `VITE_API_SECRET=xxx`로 비밀키를 클라이언트에 노출.
- `.env.local`을 git에 커밋.
- `process.env.VITE_API_URL` 사용 (Vite는 `import.meta.env`만 동작).
- `import.meta.env.MODE`로 분기하면서 모드 이름을 오타 (`producton`).
- `VITE_` 접두사 없는 변수를 `import.meta.env`로 접근 후 `undefined` 디버깅에 시간 낭비.
