---
name: Secrets Management Standard (Secrets Management)
description: A general-purpose (foundational) standard for safely handling secrets such as API keys, DB passwords, certificates, and tokens. Covers no-hardcoding/external injection, commit & history scanning, regular rotation, log masking, and per-environment separation. Read it when newly handling secrets, deciding on a config injection method, or preventing exposure before commit. For environment-variable injection itself, see env-config.
rules:
  - "Keep it outside and have it injected: inject secrets at runtime from the execution environment or a dedicated manager, and as the environment moves up (local→shared→production) use a store with stronger controls."
  - "Block exposure automatically: keep only dummy/example values in version control, and scan commits, CI, and past history so real secrets cannot leak in."
  - "Don't treat them as permanent assets: rotate them regularly and immediately on suspected leak, verify missing ones at startup (fail-fast), and leave no traces in logs/errors."
tags:
  - ".env"
  - "os.environ"
  - "process.env"
  - "SECRET"
  - "API_KEY"
  - "vault"
  - "gitignore"
foundational: true
---

# 🔐 Secrets Management Standard (Secrets Management)

> Keep sensitive information such as API keys, passwords, certificates, and tokens outside the code, inject it within a trust boundary, scan commits and history to prevent exposure, and rotate it regularly. Read it when handling secrets, deciding on a config injection method, or preventing exposure before commit. It is a general-purpose standard not tied to any specific language/tool/cloud. (For how to inject and validate config values via environment variables, see env-config.)

## 1. Core Principles

There is one underlying idea — **an application only "receives and uses" secrets; it does not "hold" them.** A secret that gets into the code is considered already leaked. From this, the following follow.

- **Keep it outside and have it injected**: inject secrets at runtime from the execution environment or a dedicated manager, and as the environment moves up (local→shared→production) use a store with stronger controls.
- **Block exposure automatically**: keep only dummy/example values in version control, and scan commits, CI, and past history so real secrets cannot leak in.
- **Don't treat them as permanent assets**: rotate them regularly and immediately on suspected leak, verify missing ones at startup (fail-fast), and leave no traces in logs/errors.

Concrete practices are covered with ✅/❌ in §2 Rules.

## 2. Rules

### 2-1. Don't hardcode into code/config
- Don't write secrets directly into source, config files, container images, or comments.
- A secret that has been committed/deployed even once is considered "exposed" and rotated immediately.

```text
// ❌ 금지 — 시크릿을 코드에 박음
apiKey = "sk_live_8f2a...";

// ✅ 권장 — 실행 환경/시크릿 매니저에서 주입받아 사용
apiKey = readSecret("PAYMENT_API_KEY")   // 값은 코드 밖에 존재
```

### 2-2. Separate stores per environment
- As the environment moves up, use a store with stronger controls. A local plaintext file is only within a single developer's scope; shared/production goes to a place with access control and auditing.
- Have the team agree on "what goes where" and apply it consistently.

```text
// 저장소를 민감도에 맞게 분리 (도구는 팀 스택에 맞게)
로컬 개발 : 로컬 평문 파일 (버전 관리 제외, 최소 권한)
팀 공유   : 비밀번호/시크릿 공유 도구 (접근 통제)
스테이징/운영 : 전용 시크릿 관리 서비스 (접근 통제 + 감사 로그)
```

### 2-3. Don't commit real secrets to version control
- Exclude files containing real secret values from version control (add to the ignore list).
- Instead, share a file with **dummy/example values** that shows only the key names/structure, so newcomers know what to fill in.

```text
// ❌ 금지 — 실제 시크릿이 담긴 파일을 커밋
commit secrets.local   // 이력에 영구히 남는다

// ✅ 권장 — 무시 목록에 실제 파일 등록 + 더미 예시만 공유
ignore: secrets.local
commit: secrets.example   // DATABASE_URL=... (더미값)
```

### 2-4. Block leaks with commit & history scanning
- Scan for secret patterns at the **commit point** (local hook) and in the **CI stage** to prevent exposed secrets from being merged.
- Periodically scan not only new commits but also the **entire past history**. Find any secrets already in it and rotate/remove them.

```text
// ✅ 권장 — 두 겹으로 차단
커밋 전(훅) : 변경분에서 시크릿 패턴 탐지 → 발견 시 커밋 차단
CI          : 머지 전 동일 스캔으로 우회 방지
이력 스캔   : 과거 커밋 전체 주기적 스캔 → 발견 시 로테이션
```

### 2-5. Validate required secrets at startup (fail-fast)
- At boot, the application checks that all required secrets are injected, and stops immediately if any are missing.
- Don't let it run silently with empty/default values and blow up much later at runtime.

```text
// ❌ 금지 — 없으면 빈 값으로 진행하다 한참 뒤 실패
key = readSecret("JWT_SECRET")   // 없으면 null로 계속 진행

// ✅ 권장 — 시작 시 필수 목록을 한 번에 검증
required = [DATABASE_URL, JWT_SECRET, ...]
missing  = required where not provided
if missing: abort("필수 시크릿 누락: " + missing)
```

### 2-6. Regular rotation and expiry automation
- Rotate secrets on a set cycle, and have a procedure to rotate them immediately on suspected leak.
- Where possible, do zero-downtime rotation (issue new → switch over → retire old), and automate expiry/renewal to reduce manual work.

```text
// ✅ 권장 — 무중단 교체 + 자동화
1) 새 시크릿 발급/적용
2) 트래픽을 새 시크릿으로 전환
3) 구 시크릿 폐기
+ 만료 임박 알림과 갱신을 자동화
```

### 2-7. Don't expose secrets in logs/errors
- Mask so that secrets are not printed in logs, exception messages, debug output, or outbound URLs/trace information.
- Apply masking so that secrets don't remain as plaintext in CI/build logs either.

```text
// ❌ 금지 — 시크릿이 로그로 샘
log("connecting with token=" + token)

// ✅ 권장 — 마스킹
log("connecting with token=****")
```

## 3. Common Mistakes

Only the traps people frequently fall into while knowing the rules (repetition of the rules is omitted).

- **The "removed from the commit, so it's safe" delusion** → a committed secret remains permanently in history. Don't stop at deleting the file; always **rotate**.
- **Forgetting CI/build logs** → even if runtime logs are masked, secrets often leak as plaintext in build/CI output. Masking goes on both sides.
- **The same secret across all environments** → sharing it for convenience means when one place is breached, everything is breached. Separate and issue per environment.
- **Running silently with empty values** → if you don't validate missing secrets, it runs on defaults/null and blows up much later. Fail-fast at boot.

## 4. Checklist
- [ ] Are secrets **injected externally** rather than hardcoded into code/config/images?
- [ ] Are stores **matched to sensitivity** and separated per environment (local·shared·production)?
- [ ] Do you commit only **dummy/example values** and not real secrets to version control?
- [ ] Do you block secret leaks with **commit hook + CI + history scan**?
- [ ] Do you **validate required secrets** at boot and fail immediately if missing?
- [ ] Have you automated **regular rotation** and expiry alerts/renewal, and can you retire immediately on leak?
- [ ] Are secrets **masked** so they aren't exposed in logs/errors/CI output?
- [ ] Do you use a **different secret** per environment (so one leak doesn't spread to everything)?

## Appendix: Examples by Stack

> The following are reference implementation examples. Add examples matching your team's stack (secret manager·scanner·CI, etc.) in the same pattern. The principles and rules in 1–4 above are the standard; the appendix is merely application cases.

### Examples by Tool

#### Secret Storage Layers (example)

Separate the secret storage location per environment.

```
개발: .env (로컬, .gitignore)
     → 팀 공유: 1Password / Bitwarden / Vault
스테이징: CI/CD 환경 변수 (GitHub Actions Secrets)
프로덕션: HashiCorp Vault / AWS Secrets Manager / GCP Secret Manager
```

#### `.env` File Management (dotenv convention)

Don't commit the `.env` containing real secrets; commit only the dummy-value `.env.example`.

```bash
# ❌ 금지 — 실제 시크릿 파일을 레포에 커밋

# ✅ 권장
# .gitignore
.env
.env.local
.env.production

# 레포에 커밋 — 더미값으로
# .env.example
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
```

#### Secret Scanning Setup (detect-secrets / truffleHog)

Block secret leaks with a pre-commit hook and history scan.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

```bash
# truffleHog로 히스토리 전체 스캔
trufflehog git file://. --since-commit HEAD~50
```

#### Environment Variable Injection Pattern (Python)

Validate required environment variables at startup to catch missing ones early.

```python
# ❌ 금지 — 시크릿을 코드에 하드코딩
JWT_SECRET = "super-secret-key"

# ✅ 권장 — 시작 시 필수 환경 변수 검증
import os

REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET", "REDIS_URL"]
missing = [v for v in REQUIRED_VARS if not os.environ.get(v)]
if missing:
    raise EnvironmentError(f"필수 환경 변수 누락: {missing}")
```

#### Secret Rotation Automation (example)

Automate the zero-downtime rotation procedure per secret type.

- API keys: alert 7 days before expiry → issue new key → deactivate old key
- DB passwords: Blue-Green approach — apply new password → switch connection → delete old password
- TLS certificates: Let's Encrypt auto-renew or ACM automatic renewal
