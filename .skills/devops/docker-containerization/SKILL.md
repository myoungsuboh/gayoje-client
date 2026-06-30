---
name: 컨테이너화 표준 (Containerization)
description: 컨테이너 이미지의 범용 표준 — 작은 이미지, 멀티스테이지 빌드, non-root 실행, 레이어 캐시, 빌드 컨텍스트 제외, 불변 태그, 런타임 시크릿 주입, 취약점 스캔 — 런타임/도구에 무관한 OCI 보편 개념. 서비스를 컨테이너화하거나 이미지 크기·공격 표면·시크릿 주입을 정할 때 읽는다. 키워드: container, OCI, image, multi-stage, non-root, dockerignore, vulnerability scan, Dockerfile, docker-compose.
rules:
  - "이미지는 작게: 최종 이미지에는 애플리케이션을 실행하는 데 꼭 필요한 것만 남긴다. 빌드 도구·소스코드·캐시·문서는 런타임 이미지에서 제거해 크기와 공격 표면을 줄인다."
  - "빌드와 런타임을 분리(멀티스테이지): 빌드 단계와 실행 단계를 나눠, 컴파일러·패키지 매니저·중간 산출물이 최종 이미지로 새지 않게 한다."
  - "non-root로 실행: 컨테이너 프로세스는 root가 아닌 전용 비권한 사용자로 돌린다. 컨테이너 탈출·권한 상승의 피해 범위를 줄인다."
  - "레이어 캐시를 의도적으로 활용: 자주 안 바뀌는 것(의존성 매니페스트)을 먼저, 자주 바뀌는 것(소스코드)을 나중에 복사해 캐시 적중률을 높인다. 한 번에 모든 걸 복사하면 코드 한 줄 바꿔도 의존성을 다시 받는다."
  - "빌드 컨텍스트를 줄인다: 무시 파일(.dockerignore 등)로 VCS 메타데이터·의존성 디렉터리·시크릿·테스트 파일을 빌드 컨텍스트에서 제외한다. 빌드가 빨라지고 민감 파일이 이미지에 섞이지 않는다."
  - "태그는 불변(immutable)하게: latest 같은 떠다니는 태그 대신 구체적 버전 또는 다이제스트(SHA)로 고정해 재현 가능한 빌드를 보장한다."
  - "시크릿은 런타임에 주입: API 키·비밀번호를 이미지 레이어(빌드 인자/환경변수)에 굽지 않는다. 런타임 환경변수·시크릿 마운트로 외부에서 주입한다 — 이미지 레이어는 누구나 들여다볼 수 있다."
  - "이미지는 불변·일회용으로: 실행 중 컨테이너를 고쳐 상태를 쌓지 않는다. 상태는 외부(볼륨·DB)에 두고, 이미지는 언제 버리고 다시 띄워도 같게 동작하게 한다."
  - "취약점을 스캔한다: 베이스 이미지와 의존성의 알려진 취약점(CVE)을 빌드 파이프라인에서 스캔하고, 베이스 이미지를 주기적으로 갱신한다."
tags:
  - "container"
  - "OCI"
  - "image"
  - "multi-stage"
  - "non-root"
  - "dockerignore"
  - "vulnerability scan"
  - "Dockerfile"
  - "docker-compose"
  - "COPY"
  - "RUN"
  - "FROM"
  - "docker build"
---

# 📦 컨테이너화 표준 (Containerization)

> 작고 안전하며 재현 가능한 컨테이너 이미지를 만들고, 일관된 로컬 개발 환경을 제공한다. 서비스를 이미지로 패키징하거나 이미지 크기·공격 표면·시크릿 주입을 정할 때 읽는다. 특정 빌드 도구/런타임(Docker, Podman, Buildah, containerd 등)에 종속되지 않는 OCI 범용 표준이다.

## 1. 핵심 원칙
- **이미지는 작게**: 최종 이미지에는 애플리케이션을 실행하는 데 꼭 필요한 것만 남긴다. 빌드 도구·소스코드·캐시·문서는 런타임 이미지에서 제거해 크기와 공격 표면을 줄인다.
- **빌드와 런타임을 분리(멀티스테이지)**: 빌드 단계와 실행 단계를 나눠, 컴파일러·패키지 매니저·중간 산출물이 최종 이미지로 새지 않게 한다.
- **non-root로 실행**: 컨테이너 프로세스는 root가 아닌 전용 비권한 사용자로 돌린다. 컨테이너 탈출·권한 상승의 피해 범위를 줄인다.
- **레이어 캐시를 의도적으로 활용**: 자주 안 바뀌는 것(의존성 매니페스트)을 먼저, 자주 바뀌는 것(소스코드)을 나중에 복사해 캐시 적중률을 높인다. 한 번에 모든 걸 복사하면 코드 한 줄 바꿔도 의존성을 다시 받는다.
- **빌드 컨텍스트를 줄인다**: 무시 파일(`.dockerignore` 등)로 VCS 메타데이터·의존성 디렉터리·시크릿·테스트 파일을 빌드 컨텍스트에서 제외한다. 빌드가 빨라지고 민감 파일이 이미지에 섞이지 않는다.
- **태그는 불변(immutable)하게**: `latest` 같은 떠다니는 태그 대신 구체적 버전 또는 다이제스트(SHA)로 고정해 재현 가능한 빌드를 보장한다.
- **시크릿은 런타임에 주입**: API 키·비밀번호를 이미지 레이어(빌드 인자/환경변수)에 굽지 않는다. 런타임 환경변수·시크릿 마운트로 외부에서 주입한다 — 이미지 레이어는 누구나 들여다볼 수 있다.
- **이미지는 불변·일회용으로**: 실행 중 컨테이너를 고쳐 상태를 쌓지 않는다. 상태는 외부(볼륨·DB)에 두고, 이미지는 언제 버리고 다시 띄워도 같게 동작하게 한다.
- **취약점을 스캔한다**: 베이스 이미지와 의존성의 알려진 취약점(CVE)을 빌드 파이프라인에서 스캔하고, 베이스 이미지를 주기적으로 갱신한다.

## 2. 규칙

### 2-1. 멀티스테이지로 빌드 산출물만 남긴다
- 빌드 단계에서 컴파일/번들하고, 런타임 단계에는 그 산출물과 실행 의존성만 복사한다.
- 컴파일러·빌드 캐시·소스 트리를 최종 이미지에 남기지 않는다.

```text
# ❌ 금지 — 단일 스테이지에 빌드 도구·소스·캐시가 다 남음
build-tools + source + deps + artifact  → 최종 이미지 (거대·공격 표면 큼)

# ✅ 권장 — 빌드 산출물만 런타임 스테이지로 복사
stage(build):   build-tools + source → artifact
stage(runtime): runtime-deps + artifact   # 빌드 도구·소스 없음
```

### 2-2. non-root 사용자로 실행한다
- 전용 비권한 사용자를 만들고 그 사용자로 프로세스를 띄운다.
- 기본값(root)으로 돌리지 않는다. 꼭 필요한 디렉터리에만 권한을 준다.

```text
# ❌ 금지 — 기본 root로 실행
(USER 지정 없음) → root 권한으로 앱 구동

# ✅ 권장 — 전용 비권한 사용자로 실행
create user appuser → run as appuser
```

### 2-3. 레이어 캐시를 살리는 순서로 복사한다
- 의존성 매니페스트를 먼저 복사·설치하고, 그 다음에 소스코드를 복사한다.
- 소스만 바뀌었을 때 의존성 설치 레이어가 캐시에서 재사용되게 한다.

```text
# ❌ 금지 — 전부 한 번에 복사 → 코드 한 줄만 바꿔도 의존성 재설치
copy(everything) → install deps → build

# ✅ 권장 — 매니페스트 먼저(캐시), 소스는 나중에
copy(manifest) → install deps   # 매니페스트 안 바뀌면 캐시 적중
copy(source)   → build
```

### 2-4. 빌드 컨텍스트에서 불필요·민감 파일을 제외한다
- 무시 파일로 VCS 메타데이터·의존성 디렉터리·환경파일·테스트·문서를 제외한다.
- 시크릿이 이미지에 섞이는 사고를 원천 차단하고 빌드 컨텍스트 전송량을 줄인다.

```text
# ✅ 권장 — 무시 목록에 포함 (예시)
.git              # VCS 메타데이터
.env              # 시크릿
<deps-dir>        # 재설치되는 의존성 (예: node_modules, .venv)
build/ dist/      # 산출물
tests/ *.test.*   # 테스트
```

### 2-5. 이미지 태그를 불변하게 고정한다
- 베이스 이미지와 배포 이미지 모두 구체적 버전 또는 다이제스트로 고정한다.
- `latest`처럼 가리키는 대상이 바뀌는 태그에 의존하지 않는다 — 빌드 재현성이 깨진다.

```text
# ❌ 금지 — 떠다니는 태그
FROM runtime:latest

# ✅ 권장 — 버전/다이제스트로 고정
FROM runtime:20.11.1
FROM runtime@sha256:<digest>
```

### 2-6. 시크릿은 이미지에 굽지 말고 런타임에 주입한다
- 비밀번호·토큰·키를 빌드 인자나 이미지 환경변수로 박아 넣지 않는다.
- 런타임 환경변수·시크릿 마운트로 주입한다. 이미지 레이어는 누구든 추출해 볼 수 있다.

```text
# ❌ 금지 — 시크릿이 이미지 레이어에 영구히 남음
ENV API_KEY=sk-live-12345

# ✅ 권장 — 런타임에 외부에서 주입
(이미지엔 값 없음) → 실행 시 환경변수/시크릿 마운트로 전달
```

### 2-7. 헬스체크와 읽기 전용 파일시스템을 검토한다
- 컨테이너가 "살아있음"과 "요청 처리 가능"을 오케스트레이터가 알 수 있게 헬스체크를 정의한다.
- 가능하면 루트 파일시스템을 읽기 전용으로 두고, 쓰기가 필요한 경로만 볼륨/tmpfs로 연다.

```text
# ✅ 권장
healthcheck: 앱 상태 엔드포인트/명령으로 준비 상태 판단
read-only root fs + 쓰기 필요한 경로만 마운트
```

### 2-8. 빌드 파이프라인에서 취약점을 스캔한다
- 베이스 이미지·의존성의 알려진 취약점(CVE)을 자동 스캔하고, 베이스 이미지를 주기적으로 갱신한다.
- 스캔은 도구 비종속 단계다 — 팀이 쓰는 스캐너(Trivy, Grype, 클라우드 레지스트리 스캔 등)로 CI에 건다.

```text
# ✅ 권장 — CI 단계에 스캔을 포함
build image → scan(image) → (취약점 임계 초과 시 빌드 실패)
```

## 3. 흔한 실수
- **단일 스테이지로 빌드** → 컴파일러·소스·캐시가 최종 이미지에 남아 비대해지고 공격 표면이 커진다. 멀티스테이지로 산출물만 남긴다.
- **root로 실행** → 컨테이너 탈출 시 피해가 커진다. 전용 비권한 사용자로 돌린다.
- **전부 한 번에 복사** → 코드 한 줄 바꿔도 의존성을 다시 받아 빌드가 느려진다. 매니페스트 먼저, 소스는 나중에.
- **`latest` 태그 의존** → 어제 되던 빌드가 오늘 깨진다. 버전/다이제스트로 고정한다.
- **시크릿을 이미지에 구움** → 레이어에서 추출 가능. 런타임 주입으로 바꾼다.
- **무시 파일 누락** → `.env`·의존성 디렉터리·`.git`이 빌드 컨텍스트와 이미지에 섞인다. 무시 목록을 관리한다.
- **헬스체크 없음** → 오케스트레이터가 죽은/준비 안 된 컨테이너로 트래픽을 보낸다.
- **취약점 스캔 생략** → 알려진 CVE가 그대로 배포된다. CI에 스캔을 건다.
- **상태를 컨테이너 안에 쌓음** → 재시작/재배포 시 데이터가 사라진다. 상태는 외부(볼륨·DB)에.

## 4. 체크리스트
- [ ] **멀티스테이지 빌드**로 최종 이미지에 산출물만 남겼는가 (빌드 도구·소스 제거)
- [ ] **non-root** 비권한 사용자로 실행하는가
- [ ] 의존성 매니페스트를 먼저 복사해 **레이어 캐시**를 살렸는가
- [ ] 무시 파일(`.dockerignore` 등)로 **불필요·민감 파일을 빌드 컨텍스트에서 제외**했는가
- [ ] 이미지 태그가 **고정 버전/다이제스트**인가 (`latest` 금지)
- [ ] 시크릿을 **런타임에 주입**하는가 (빌드 인자/이미지 환경변수에 하드코딩 금지)
- [ ] 패키지 설치 시 **캐시를 제거**해 레이어를 줄였는가
- [ ] **헬스체크**를 정의했는가
- [ ] **읽기 전용 파일시스템**을 검토했는가 (쓰기 필요한 경로만 개방)
- [ ] 빌드 파이프라인에서 **취약점을 스캔**하는가 (베이스 이미지 주기적 갱신)

## 부록: 스택별 예시

> 아래는 Docker 기준 참고 구현 예시다. 팀이 쓰는 런타임/빌드 도구(예: Podman, Buildah, containerd, 또는 다른 베이스 이미지)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 검증 모델/오류 응답 통일 등 입력 검증은 별도 스킬(`입력값 검증 표준`)을 참고한다.

### Docker

#### 멀티스테이지 Dockerfile (Node.js)
```dockerfile
# Stage 1: Build — devDependencies 포함 전체 설치 후 빌드
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                       # 전체 의존성 (build에 devDependencies 필요)
COPY . .
RUN npm run build

# Stage 2: Production — 빌드 산출물 + 런타임 의존성만
FROM node:20-alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev            # 런타임 의존성만 설치
COPY --from=builder /app/dist ./dist   # 빌드 산출물만 복사
USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### 멀티스테이지 Dockerfile (Python / FastAPI)
```dockerfile
FROM python:3.12-slim AS base
RUN adduser --disabled-password --no-create-home appuser
WORKDIR /app

# Build — 휠을 빌드해 런타임 의존성을 모음 (빌드 도구는 최종 이미지에서 제외)
FROM base AS builder
RUN pip install --no-cache-dir build
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Production — 미리 빌드한 런타임 의존성만 설치
FROM base AS production
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt
COPY . .
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### .dockerignore
```
.git
.env
node_modules
dist
__pycache__
*.pyc
.pytest_cache
tests/
*.test.*
README.md
```

#### Docker Compose (로컬 개발)
```yaml
services:
  app:
    build: { context: ., target: development }
    volumes: ["./src:/app/src"]   # Hot reload
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/mydb
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: password }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
    volumes: ["postgres-data:/var/lib/postgresql/data"]

volumes:
  postgres-data:
```

#### 취약점 스캔 (예시 명령)
```
docker scan <image>      # 또는
trivy image <image>
```
