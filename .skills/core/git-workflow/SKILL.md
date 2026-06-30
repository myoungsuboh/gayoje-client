---
name: Git 워크플로우 — 브랜치 전략 & 협업 (Git Workflow)
description: 트렁크 기반 브랜치 전략, 작은 PR, 머지 기준(리뷰·CI 통과 후), rebase/merge·충돌 해결, force-push·시크릿 제외 규칙을 정한 스택 중립 협업 가이드. 새 작업 브랜치를 따거나 PR을 올리거나 머지·충돌을 처리할 때 읽는다. 작은 PR·브랜치·머지 기준의 단일 소유 문서다(셀프리뷰는 `code-review`, 완료 증명은 `verification-before-completion`). 키워드: git, branch, trunk-based, pull-request, CI, rebase, merge, force-push, gitignore, conflict, main.
rules:
  - "트렁크 기반으로 — main은 항상 배포 가능 상태로 두고, 작업은 단기(이상적으로 1~2일) 브랜치에서 하고 빨리 머지한다. 오래 사는 브랜치는 충돌을 키운다."
  - "main에 직접 push하지 않는다 — 모든 변경은 브랜치 → PR을 거친다. main은 브랜치 보호로 직접 push·force-push를 막는다."
  - "PR은 작게 — 한 PR은 한 가지 일만. 작은 PR이 리뷰가 빠르고 버그를 덜 숨긴다."
  - "머지 전 게이트는 둘 다 통과 — 최소 1인 리뷰 승인 + CI(빌드·테스트·린트) 그린. 둘 중 하나라도 빨간 채로 머지하지 않는다."
  - "공유 브랜치는 히스토리를 덮어쓰지 않는다 — 남이 보는 브랜치(main·공동 작업 브랜치)에 force-push 금지. rebase는 내 로컬 브랜치에서만."
  - "시크릿·빌드 산출물은 커밋하지 않는다 — .gitignore로 처음부터 제외한다. 한 번 올라간 비밀은 새는 것으로 간주한다."
tags:
  - "git"
  - "branch"
  - "trunk-based"
  - "pull-request"
  - "CI"
  - "rebase"
  - "merge"
  - "force-push"
  - "gitignore"
  - "conflict"
  - "main"
foundational: true
---

# 🌿 Git 워크플로우 — 브랜치 전략 & 협업

> 브랜치를 짧게·작게 유지하고 리뷰·CI를 통과해야만 main에 들어가게 못 박아, 누가 작업해도 이력이 깨끗하고 충돌이 적게 한다. 새 브랜치를 따거나, PR을 올리거나, 머지·충돌을 처리할 때 읽는다.

AI 에이전트와 사람이 가장 흔히 저지르는 협업 실수는 **main에 직접 push하고, 거대한 변경을 한 번에 올리고, 공유 브랜치를 force-push로 갈아엎는 것**이다. 처음엔 빨라 보여도 리뷰·되돌리기·원인 추적이 급격히 어려워진다. 흐름을 규칙으로 못 박으면 에이전트도 그 틀 안에서 안전하게 커밋한다.

## 1. 핵심 원칙

- 트렁크 기반으로 — main은 항상 배포 가능 상태로 두고, 작업은 단기(이상적으로 1~2일) 브랜치에서 하고 빨리 머지한다. 오래 사는 브랜치는 충돌을 키운다.
- main에 직접 push하지 않는다 — 모든 변경은 브랜치 → PR을 거친다. main은 브랜치 보호로 직접 push·force-push를 막는다.
- PR은 작게 — 한 PR은 한 가지 일만. 작은 PR이 리뷰가 빠르고 버그를 덜 숨긴다.
- 머지 전 게이트는 둘 다 통과 — 최소 1인 리뷰 승인 + CI(빌드·테스트·린트) 그린. 둘 중 하나라도 빨간 채로 머지하지 않는다.
- 공유 브랜치는 히스토리를 덮어쓰지 않는다 — 남이 보는 브랜치(main·공동 작업 브랜치)에 force-push 금지. rebase는 내 로컬 브랜치에서만.
- 시크릿·빌드 산출물은 커밋하지 않는다 — `.gitignore`로 처음부터 제외한다. 한 번 올라간 비밀은 새는 것으로 간주한다.

## 2. 규칙

### 2-1. 브랜치 네이밍 & 단기 유지

```
# ❌ 금지 — 의미 없는/오래 사는 브랜치
git checkout -b temp
git checkout -b my-work        # 몇 주 방치 → 머지 지옥

# ✅ 권장 — 타입/이슈/요약, 작업 끝나면 바로 머지·삭제
git checkout -b feat/142-login-rate-limit
git checkout -b fix/payment-null-amount
git checkout -b chore/bump-deps
```

- 형식 예: `<타입>/<이슈번호>-<짧은요약>` (타입: feat·fix·chore·docs·refactor 등). 소문자·kebab-case.
- 한 브랜치 = 한 작업. 끝나면 머지 후 삭제해 목록을 깨끗이 유지한다.

### 2-2. main 보호 & PR 경유

```
# ❌ 금지 — main에 직접 커밋·push
git switch main && git commit -m "..." && git push

# ✅ 권장 — 브랜치에서 작업 → push → PR 생성
git switch -c feat/142-login-rate-limit
git push -u origin feat/142-login-rate-limit
# → PR을 열고 리뷰·CI를 받는다
```

- 저장소 설정에서 main(및 release 브랜치)에 **브랜치 보호**를 건다: 직접 push 차단, PR 필수, 리뷰·CI 통과 필수.

### 2-3. 작은 PR & 머지 전 게이트

```
# ❌ 금지 — 기능·리팩터·포맷팅을 한 PR에 90개 파일로
# ✅ 권장 — 목적 하나, 가능한 작게. 리뷰어가 한 번에 읽을 분량
```

- 리뷰 승인 1+ & CI 그린 **둘 다** 만족해야 머지. 실패한 CI를 "나중에 고치자"며 머지하지 않는다(셀프 승인 금지).
- 올리기 전 셀프리뷰(디버그 흔적 제거 등)는 `code-review`, 완료 증명(DoD·CI 그린 확인)은 `verification-before-completion`을 따른다.

### 2-4. rebase vs merge & 충돌 해결

```
# ✅ 내 로컬 브랜치를 최신 main 위로 정리 (깔끔한 직선 이력)
git switch feat/142-login-rate-limit
git fetch origin
git rebase origin/main
# 충돌 시: 파일 수정 → git add <file> → git rebase --continue
#         되돌리려면 git rebase --abort

# ✅ 공유 이력 보존이 중요하면 merge (머지 커밋 남김)
git merge origin/main
```

- **rebase**: 아직 공유 전인 내 브랜치 정리에. 이력이 직선이 된다.
- **merge**: 이미 공유된 이력을 보존할 때. 팀 규칙(직선 vs 머지 커밋)을 따른다.
- 충돌은 절대 한쪽을 무작정 덮어쓰지 말고, 양쪽 의도를 확인해 해결한다.

### 2-5. force-push 금지 (공유 브랜치)

```
# ❌ 절대 금지 — 공유 브랜치 히스토리 파괴 (남의 작업 유실)
git push --force origin main

# ✅ 허용 — 내 개인 브랜치에서, 그것도 안전 옵션으로
git push --force-with-lease origin feat/142-login-rate-limit
```

- `--force-with-lease`는 그 사이 남이 push했으면 거부 → 덮어쓰기 사고를 막는다. 공유 브랜치엔 그래도 쓰지 않는다.

### 2-6. .gitignore — 시크릿·산출물 제외

```gitignore
# ❌ 커밋되면 안 되는 것 (예시)
.env
.env.*
*.key
*.pem
secrets/

# 빌드 산출물·의존성·로컬 캐시
dist/
build/
node_modules/
*.log
.DS_Store
```

- 비밀(.env·키·토큰)과 빌드 산출물·의존성 폴더는 처음부터 추적하지 않는다.
- 실수로 비밀을 커밋했다면: 즉시 키를 폐기·교체한다(히스토리에서 지워도 이미 노출된 것으로 간주).

### 2-7. 자주 · 의미 단위로 커밋

```
# ❌ 금지 — 하루 종일 모았다가 거대한 한 방 커밋
# ✅ 권장 — 동작하는 작은 단위로 자주 커밋 → push
```

- 작고 잦은 커밋은 리뷰·되돌리기·원인 추적(`git bisect`)을 쉽게 한다.
- 커밋 메시지 형식(타입·제목·본문 규칙)은 `coding-styles`를 따른다.

## 3. 흔한 실수

검토 시 거른다.

- ❌ main에 직접 push하거나 보호 없이 둠
- ❌ 수백 파일·여러 목적이 섞인 거대 PR
- ❌ CI 빨간불·리뷰 없이 머지
- ❌ 공유 브랜치를 `--force`로 갈아엎어 남의 커밋 유실
- ❌ 충돌을 양쪽 의도 확인 없이 한쪽으로 덮어쓰기
- ❌ `.env`·키·`node_modules`·`dist`를 커밋
- ❌ 머지된 브랜치를 안 지워 목록이 수백 개로 쌓임

> **적용 팁**: 저장소 호스팅(GitHub/GitLab 등)에 브랜치 보호·필수 리뷰·필수 CI를 켜두면, 규칙을 사람·에이전트가 깜빡해도 시스템이 막아준다. 메시지 컨벤션은 `coding-styles`, 변경 검토 기준은 `architecture-layering`과 함께 보면 좋다.

## 4. 체크리스트

- [ ] 작업을 main이 아닌 단기 브랜치에서 했고, 브랜치 이름이 `타입/요약` 규칙을 따르는가
- [ ] PR이 한 가지 목적으로 작게 쪼개져 있는가
- [ ] 리뷰 승인 1+ 와 CI(빌드·테스트·린트) 그린을 둘 다 통과했는가
- [ ] 공유 브랜치에 force-push하지 않았는가 (개인 브랜치는 `--force-with-lease`)
- [ ] `.env`·키·토큰·빌드 산출물이 커밋에 섞이지 않았는가 (`.gitignore` 확인)
- [ ] 머지 후 작업 브랜치를 삭제했는가
