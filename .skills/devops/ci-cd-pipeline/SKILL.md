---
name: CI/CD 파이프라인 표준
description: 지속적 통합/배포(CI/CD) 파이프라인의 범용 표준 — 단계 분리(린트→테스트→빌드→스캔→배포)와 앞 단계 실패 시 차단, 브랜치 보호 머지 게이트, 환경 분리·production 수동 승인, 불변 아티팩트 태깅·롤백, 시크릿 관리, 캐싱. 특정 CI 도구에 무관하다. 파이프라인을 만들거나 단계·승인·롤백을 정할 때 읽는다. 키워드: CI, CD, pipeline, build, deploy, branch protection, manual approval, artifact, rollback, GitHub Actions, GitLab CI.
rules:
  - "머지 게이트는 자동 검증으로: 모든 변경(PR/MR)은 CI를 통과해야만 통합 브랜치로 머지할 수 있게 브랜치 보호 규칙을 강제한다. CI만 돌리고 보호 규칙이 없으면 실패해도 머지되어 의미가 없다."
  - "단계를 분리하고 빠르게 실패(fail-fast): 파이프라인을 린트→테스트→빌드→보안 스캔→배포로 나누고, 앞 단계가 실패하면 후속 단계를 건너뛴다. 값싸고 빠른 검증(린트)을 앞에, 비싼 검증(빌드·배포)을 뒤에 둔다."
  - "환경을 분리하고 production은 수동 승인: dev·staging·production 배포를 분리한다. production 배포는 사람의 명시적 승인(manual approval)을 필수로 해, 검증 없이 장애가 전파되지 않게 한다."
  - "아티팩트는 한 번 빌드해 승격(build once, promote): 빌드 산출물은 콘텐츠/커밋 기반 고유 태그로 식별하고, 환경마다 다시 빌드하지 말고 같은 아티팩트를 승격한다. 어떤 버전이 배포됐는지 추적되고 이전 버전으로 롤백이 가능해진다."
  - "시크릿은 비밀 저장소에서, 로그에 노출 금지: 자격 증명은 CI 플랫폼의 시크릿 관리 기능(또는 외부 비밀 저장소)에 두고, 파이프라인 로그에 마스킹되는지 확인한다. 평문 환경변수·코드·로그에 시크릿을 노출하지 않는다."
  - "재현 가능하고 빠르게: 의존성은 잠금 파일(lock) 기반으로 결정적으로 설치하고, 캐싱으로 반복 비용을 줄인다. 파이프라인 정의는 코드로 버전 관리한다(pipeline as code)."
tags:
  - "CI"
  - "CD"
  - "pipeline"
  - "build"
  - "deploy"
  - "branch protection"
  - "manual approval"
  - "artifact"
  - "rollback"
  - "GitHub Actions"
  - "GitLab CI"
  - "github-actions"
  - "workflow"
  - ".github/workflows"
  - "on: push"
---

# 🚀 CI/CD 파이프라인 표준

> 린트부터 배포까지 파이프라인을 단계로 나눠 자동화하고, 검증을 통과한 변경만 일관된 품질로 릴리즈한다. 머지는 브랜치 보호로, production 배포는 수동 승인으로 막고, 아티팩트는 추적 가능하게 태깅해 롤백을 보장한다. 파이프라인을 새로 만들거나 단계·환경 분리·승인·시크릿·롤백을 정할 때 읽는다. 특정 CI 도구(GitHub Actions·GitLab CI·Jenkins 등)에 종속되지 않는 범용 표준이다.

## 1. 핵심 원칙
- **머지 게이트는 자동 검증으로**: 모든 변경(PR/MR)은 CI를 통과해야만 통합 브랜치로 머지할 수 있게 브랜치 보호 규칙을 강제한다. CI만 돌리고 보호 규칙이 없으면 실패해도 머지되어 의미가 없다.
- **단계를 분리하고 빠르게 실패(fail-fast)**: 파이프라인을 린트→테스트→빌드→보안 스캔→배포로 나누고, 앞 단계가 실패하면 후속 단계를 건너뛴다. 값싸고 빠른 검증(린트)을 앞에, 비싼 검증(빌드·배포)을 뒤에 둔다.
- **환경을 분리하고 production은 수동 승인**: dev·staging·production 배포를 분리한다. production 배포는 사람의 명시적 승인(manual approval)을 필수로 해, 검증 없이 장애가 전파되지 않게 한다.
- **아티팩트는 한 번 빌드해 승격(build once, promote)**: 빌드 산출물은 콘텐츠/커밋 기반 고유 태그로 식별하고, 환경마다 다시 빌드하지 말고 같은 아티팩트를 승격한다. 어떤 버전이 배포됐는지 추적되고 이전 버전으로 롤백이 가능해진다.
- **시크릿은 비밀 저장소에서, 로그에 노출 금지**: 자격 증명은 CI 플랫폼의 시크릿 관리 기능(또는 외부 비밀 저장소)에 두고, 파이프라인 로그에 마스킹되는지 확인한다. 평문 환경변수·코드·로그에 시크릿을 노출하지 않는다.
- **재현 가능하고 빠르게**: 의존성은 잠금 파일(lock) 기반으로 결정적으로 설치하고, 캐싱으로 반복 비용을 줄인다. 파이프라인 정의는 코드로 버전 관리한다(pipeline as code).

## 2. 규칙

### 2-1. CI 통과를 머지 조건으로 강제 (브랜치 보호)
- 통합 브랜치(main/develop 등)는 보호 규칙을 걸어, 필수 CI 검사가 통과해야만 머지되게 한다.
- "CI는 돌지만 실패해도 머지 가능"한 상태를 두지 않는다 — 검사 결과가 게이트로 작동해야 한다.

```text
// ❌ 금지 — CI는 돌지만 실패해도 머지 가능 (게이트 없음)
PR → CI 실패 → 그래도 머지 버튼 눌림

// ✅ 권장 — 필수 검사 통과를 머지 전제 조건으로 강제
PR → 필수 CI 검사 통과해야만 머지 허용
```

### 2-2. 단계를 직렬화하고 앞 단계 실패 시 후속 차단
- 파이프라인을 린트→테스트→빌드→보안 스캔→배포 단계로 나누고, 단계 간 의존을 명시해 앞 단계 실패 시 뒤 단계를 실행하지 않는다.
- 한 잡에 모든 걸 몰아넣어 "어디서 깨졌는지" 흐려지게 하지 않는다. 빠른 검증을 앞에 둬 피드백을 빠르게 받는다.

```text
// ❌ 금지 — 한 잡에 전부 몰아넣음, 린트 실패해도 끝까지 돌아 시간 낭비
job all: lint; test; build; scan; deploy   // 무엇이 깨졌는지 불명확

// ✅ 권장 — 단계 분리 + 의존성, 앞 단계 실패 시 후속 건너뜀
lint → test → build → scan → deploy        // 각 단계가 앞 단계 성공에 의존
```

### 2-3. 환경 분리 + production 수동 승인
- 같은 아티팩트라도 dev·staging·production 배포 경로를 분리하고, 환경별 설정/시크릿을 환경 단위로 격리한다.
- production 배포는 자동으로 흘려보내지 말고 사람의 명시적 승인을 거친다. 어떤 브랜치/조건이 어떤 환경으로 가는지 분명히 한다.

```text
// ❌ 금지 — 통합 브랜치 머지가 곧바로 production 자동 배포
merge → production 자동 배포            // 검증 없이 장애 전파

// ✅ 권장 — 환경 분리 + production은 수동 승인 게이트
develop → staging 자동 배포
main    → (수동 승인) → production 배포
```

### 2-4. 아티팩트 태깅 + 롤백 (한 번 빌드, 승격)
- 빌드 산출물에 콘텐츠/커밋 기반 고유 태그를 붙여 어떤 버전이 어디 배포됐는지 추적한다.
- 환경마다 다시 빌드하지 말고 동일 아티팩트를 승격하고, 직전 정상 버전으로 즉시 롤백할 수 있게 보관한다.

```text
// ❌ 금지 — 태그 없이 환경마다 새로 빌드 → 롤백 대상 불명확
staging:    build → deploy
production: build(다시) → deploy        // 배포된 버전·롤백 대상 추적 불가

// ✅ 권장 — 고유 태그로 한 번 빌드 후 승격, 롤백 가능
build → artifact:<commit-hash>
staging/production 모두 같은 artifact:<commit-hash> 승격
롤백 = 직전 정상 태그 재배포
```

### 2-5. 시크릿은 비밀 저장소에서, 로그 마스킹
- 자격 증명·토큰·키는 CI 플랫폼의 시크릿 관리 기능(또는 외부 비밀 저장소)에서 주입하고, 환경별로 분리한다.
- 시크릿이 파이프라인 로그에 마스킹되는지 확인하고, 평문 환경변수·소스코드·로그에 절대 노출하지 않는다.

```text
// ❌ 금지 — 시크릿을 평문으로 코드/로그에 노출
DEPLOY_TOKEN = "ghp_xxxxxxxx"          // 코드/로그에 평문 → 유출
echo $DEPLOY_TOKEN                      // 로그에 그대로 찍힘

// ✅ 권장 — 비밀 저장소에서 주입, 로그 마스킹 확인
DEPLOY_TOKEN = <secret store에서 주입>  // 로그엔 *** 로 마스킹
```

### 2-6. 결정적 설치 + 캐싱으로 속도 최적화
- 의존성은 잠금 파일(lock) 기반으로 결정적으로 설치해 빌드 재현성을 보장한다.
- 의존성·빌드 산출물을 캐싱해 반복 비용을 줄이되, 캐시 키는 잠금 파일 해시 등 내용에 연동해 오래된 캐시가 잘못 쓰이지 않게 한다.

```text
// ✅ 권장 — lock 기반 결정적 설치 + 내용 기반 캐시 키
install(lockfile)                       // 같은 입력 → 같은 결과
cache key = hash(lockfile)              // lock 바뀌면 캐시 무효화
```

## 3. 흔한 실수
- **브랜치 보호 없이 CI만 돌림** → 검사가 실패해도 머지되어 게이트로 작동하지 않는다.
- **단계를 분리하지 않음** → 린트 실패에도 테스트·빌드·배포까지 돌아 시간을 낭비하고, 어디서 깨졌는지 흐려진다.
- **production 자동 배포** → 사람 검증 없이 곧장 배포돼 장애가 그대로 전파된다. 수동 승인 게이트를 둔다.
- **시크릿을 평문 환경변수·로그에 노출** → 자격 증명이 유출된다. 비밀 저장소에서 주입하고 로그 마스킹을 확인한다.
- **아티팩트에 고유 태그가 없음 / 환경마다 재빌드** → 어떤 버전이 배포됐는지·롤백 대상이 불명확하다. 한 번 빌드해 태깅 후 승격한다.
- **캐시 키를 내용에 연동하지 않음** → 의존성이 바뀌어도 오래된 캐시가 쓰여 빌드가 어긋난다.
- **파이프라인을 UI에서 손으로만 설정** → 변경 이력·리뷰가 없다. 파이프라인 정의를 코드로 버전 관리한다.

## 4. 체크리스트
- [ ] CI 통과를 머지 조건으로 거는 **브랜치 보호 규칙**이 있는가
- [ ] **린트→테스트→빌드→보안 스캔→배포** 단계를 분리하고 앞 단계 실패 시 후속을 건너뛰는가
- [ ] dev·staging·production **환경을 분리**하고 production은 **수동 승인**을 거치는가
- [ ] 아티팩트를 **고유 태그**로 식별하고 한 번 빌드해 승격하며 **롤백**이 가능한가
- [ ] 시크릿을 **비밀 저장소**로 관리하고 로그에 **마스킹**되는지 확인했는가
- [ ] 의존성을 **잠금 파일 기반**으로 결정적으로 설치하고 **캐싱**으로 최적화했는가
- [ ] 파이프라인 정의를 **코드로 버전 관리**하는가

> 보안 스캔 단계의 스캐너 선택·심각도 임계·게이팅 정책은 `의존성 보안 스캐닝 (SCA)` 표준을 따른다(여기서는 단계 배치·실패 시 차단만 정한다). 입력값 검증·예외 응답 등 단계별 세부 규칙은 해당 스킬(`validation-bean` 등)을 참조한다.

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 팀이 쓰는 CI 도구(예: GitLab CI, Jenkins, CircleCI 등)에 맞는 예시를 같은 패턴으로 추가한다.

### GitHub Actions (GitLab CI 등)

`needs`로 단계를 직렬화해 앞 단계 실패 시 후속 단계를 건너뛴다.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: "dist-${{ github.sha }}", path: "dist/" }

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # 스캐너 선택·심각도 임계·게이팅 정책은 `의존성 보안 스캐닝 (SCA)` 표준을 따른다.
      # 여기서는 build 다음에 scan 단계를 두고, 임계 초과 시 빌드를 실패시키는 "배치"만 정한다.
      - run: # SCA 스캔 실행 (임계 초과 시 exit≠0)
```

#### 배포 파이프라인 (환경 분리 + 수동 승인)
```yaml
  deploy-staging:
    needs: security
    if: github.ref == 'refs/heads/develop'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: "dist-${{ github.sha }}" }
      # 배포 커맨드...

  deploy-production:
    needs: security
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://app.example.com
    runs-on: ubuntu-latest
    # environment 설정 → GitHub에서 수동 승인 요구
    steps:
      # 배포 커맨드...
```

#### 브랜치 전략
```
feature/* → develop → PR Review → staging 자동 배포
                    → main → production 수동 승인 후 배포
hotfix/*  → main → production 수동 승인 후 배포
```

#### 캐싱으로 속도 최적화
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-
```
