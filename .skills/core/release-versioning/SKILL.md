---
name: 릴리스 & 버전 관리 (Release & Versioning)
description: 소프트웨어 릴리스의 버전 부여(SemVer)·변경 이력(CHANGELOG)·Git 태그·릴리스 노트·폐기(deprecation) 정책 표준. 스택에 무관한 범용 표준으로, 버전을 올리거나 릴리스를 내거나 변경 이력을 정리할 때 읽는다. (REST API 계약 버전은 `api-versioning-swagger`, 의존성 버전 위생은 `dependency-management` 에 위임.) 키워드: semver, MAJOR.MINOR.PATCH, CHANGELOG, git tag, release notes, breaking change, deprecation, conventional commits.
rules:
  - "SemVer 준수: 버전을 MAJOR.MINOR.PATCH 로 부여한다. 호환이 깨지면 MAJOR, 하위호환 기능추가는 MINOR, 하위호환 버그수정은 PATCH 를 올린다."
  - "변경 이력 유지: 모든 릴리스는 CHANGELOG 에 사용자 영향 중심(Added/Changed/Fixed/Removed/Deprecated/Security)으로 기록한다. 커밋 해시 나열이 아니라 '무엇이 바뀌었나'를 쓴다."
  - "불변 태그: 릴리스마다 annotated Git 태그(vMAJOR.MINOR.PATCH)를 찍고, 이미 배포된 태그는 절대 옮기거나 재사용하지 않는다."
  - "Breaking change 명시: 호환이 깨지는 변경은 릴리스 노트·CHANGELOG 상단에 명확히 표시하고 마이그레이션 방법을 함께 적는다."
  - "단계적 폐기: 기능을 즉시 제거하지 않고 deprecated 고지 → 유예 기간 → 다음 MAJOR 에서 제거 순으로 진행한다."
  - "0.x 주의: 1.0.0 이전(0.y.z)은 공개 API 가 불안정함을 뜻한다. 안정성을 약속하려면 1.0.0 을 끊는다."
tags:
  - "semver"
  - "MAJOR.MINOR.PATCH"
  - "CHANGELOG"
  - "git tag"
  - "release notes"
  - "breaking change"
  - "deprecation"
  - "conventional commits"
  - "Keep a Changelog"
---

# 🏷️ 릴리스 & 버전 관리 (Release & Versioning)

> 소프트웨어 릴리스에 일관된 버전을 부여하고, 변경 이력을 사용자 관점으로 남기며, 폐기를 안전하게 진행한다. 버전을 올리거나 릴리스를 내거나 변경 이력을 정리할 때 읽는다. 특정 언어/프레임워크에 종속되지 않는 범용 표준이다.
>
> 경계: REST API 의 계약 버전(`/v1/`, Sunset 헤더)은 [api-versioning-swagger](../../backEnd/api-versioning-swagger/SKILL.md), 외부 의존성의 버전 채택·위생은 [dependency-management](../dependency-management/SKILL.md) 를 본다. 본 스킬은 **내가 내보내는 산출물(앱·라이브러리·서비스)의 릴리스 버전**을 다룬다.

## 1. 핵심 원칙

- **SemVer 준수**: 버전은 의미를 담는다 — MAJOR(호환 깨짐)·MINOR(하위호환 기능)·PATCH(하위호환 수정).
- **변경 이력 유지**: 릴리스는 CHANGELOG 에 사용자 영향 중심으로 기록한다.
- **불변 태그**: 배포된 태그는 옮기지 않는다 — 재현성과 신뢰의 기반.
- **단계적 폐기**: 즉시 제거 대신 deprecated → 유예 → 제거.

## 2. 규칙

### 2-1. SemVer — 무엇이 어떤 자리를 올리는가

| 변경 | 올리는 자리 | 예 |
|------|------------|-----|
| 호환이 깨지는 변경 (시그니처 제거·동작 변경) | **MAJOR** | 1.4.2 → 2.0.0 |
| 하위호환 기능 추가 | **MINOR** | 1.4.2 → 1.5.0 |
| 하위호환 버그 수정 | **PATCH** | 1.4.2 → 1.4.3 |

- MAJOR 를 올리면 MINOR·PATCH 는 0 으로 리셋(2.0.0). MINOR 를 올리면 PATCH 만 0.
- 사전배포는 `1.5.0-rc.1`, 빌드 메타는 `1.5.0+build.42` 형식.

### 2-2. CHANGELOG — 커밋 로그가 아니라 "변경 요약"

[Keep a Changelog](https://keepachangelog.com) 형식 권장. 카테고리로 묶는다:

```markdown
## [1.5.0] - 2026-06-24
### Added
- 미팅 로그 다국어 업로드 지원
### Fixed
- 빈 카탈로그에서 추천이 멈추던 문제
### Deprecated
- `/api/legacy/export` — 1.7.0 에서 제거 예정, `/api/export` 사용
### Removed
- (없음)
```

- ❌ 금지: `git log` 를 그대로 붙여 넣기 (해시·머지 커밋은 사용자에게 의미 없음).
- ✅ 권장: "사용자/호출자 관점에서 무엇이 달라졌나"를 한 줄로.

### 2-3. Git 태그 — annotated + 불변

```bash
# ✅ annotated 태그 (작성자·날짜·메시지 보존)
git tag -a v1.5.0 -m "Release 1.5.0 — 다국어 업로드"
git push origin v1.5.0

# ❌ 이미 배포된 태그를 옮기기 (재현성 파괴 — 누군가 v1.5.0 을 이미 받았다)
git tag -f v1.5.0   # 금지
```

### 2-4. 릴리스 노트 — Breaking change 를 맨 위에

```markdown
## v2.0.0 ⚠️ Breaking Changes
- `parseLog(text)` → `parseLog(text, options)` 로 시그니처 변경.
  마이그레이션: 두 번째 인자에 `{}` 를 전달하세요.
```

호환이 깨지는 변경은 **반드시** 마이그레이션 방법을 함께 적는다.

### 2-5. 폐기(Deprecation)는 단계적으로

```
1) deprecated 표시 + 대체재 안내 (코드 주석·문서·런타임 경고)
2) 유예 기간 — 최소 한 번의 MINOR 릴리스 동안 유지
3) 다음 MAJOR 에서 제거
```

### 2-6. (선택) Conventional Commits 로 버전 자동화

`feat:` → MINOR, `fix:` → PATCH, `feat!:`/`BREAKING CHANGE:` → MAJOR 로 매핑하면 버전·CHANGELOG 를 도구로 자동 생성할 수 있다(semantic-release 등).

## 3. 흔한 실수

- 호환이 깨지는 변경을 MINOR/PATCH 로 슬쩍 내보냄 → 사용자 빌드가 조용히 깨진다 (SemVer 의 신뢰가 무너짐).
- CHANGELOG 없이 태그만 찍음 → "이 버전에 뭐가 바뀌었지?"를 아무도 모른다.
- 배포된 태그를 force-push 로 덮어씀 → 같은 버전이 사람마다 다른 코드가 된다.
- 0.x 인데 안정 API 인 것처럼 의존하게 함 → 0.x 는 깨질 수 있다고 공지해야 한다.

## 4. 체크리스트

- [ ] 이번 변경의 성격(MAJOR/MINOR/PATCH)을 SemVer 기준으로 판정했는가
- [ ] CHANGELOG 에 사용자 영향 중심으로 기록했는가
- [ ] annotated Git 태그를 찍었고, 기존 태그를 건드리지 않았는가
- [ ] Breaking change 가 있다면 릴리스 노트 상단에 마이그레이션과 함께 표시했는가
- [ ] 제거 대신 단계적 폐기(deprecated → 유예 → 제거)를 따랐는가
