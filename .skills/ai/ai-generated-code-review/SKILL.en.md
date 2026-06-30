---
name: AI-Generated Code Review & Security
description: A checklist for reviewing code produced by AI agents before merging or deploying. Read it to catch the secret exposure, hallucinated dependencies, weak auth/payment logic, and excessive permissions common in AI code, so fast generation stays safe. Keywords: ai-code-review, vibe-coding, secret-scanning, dependency-hallucination, slopsquatting, owasp, code-review, sast, supply-chain, human-in-the-loop.
rules:
  - "Never trust AI output as-is for auth, payment, authorization, or PII-handling code — have a human review it line by line."
  - "Verify that dependencies (import/package) added by the AI actually exist and are trustworthy — block hallucinated nonexistent package names (slopsquatting targets)."
  - "Run a secret scan before committing — keep API keys, passwords, and tokens hardcoded by the AI from leaking outside .env."
  - "Check AI-generated code against OWASP criteria for input validation, authorization checks, and error handling (AI tends to write only the happy path)."
  - "Confirm there are tests on the changed code paths, and check that the AI didn't weaken assertions just to make tests pass."
  - "For large changes, skim the unified diff file by file to catch unintended file modifications or deletions."
  - "Add security tools (secret scanning, SAST, dependency vulnerability scanning) to CI to reinforce human review."
tags:
  - "ai-code-review"
  - "vibe-coding"
  - "secret-scanning"
  - "dependency-hallucination"
  - "slopsquatting"
  - "owasp"
  - "code-review"
  - "sast"
  - "supply-chain"
  - "human-in-the-loop"
---

# 🤖 AI-Generated Code Review & Security

> Safely filter AI-produced code before merging or deploying. Read it when you generate code fast with vibe coding but need to review auth, payment, authorization, and dependency risks.

Vibe coding pours out code fast, but **AI code is plausibly wrong.**
The key to keeping speed while preventing incidents is to automate "review before accepting" as a checklist.

## 1. Core Principles
- Never trust AI output as-is for auth, payment, authorization, or PII-handling code — have a human review it line by line.
- Verify that dependencies (import/package) added by the AI actually exist and are trustworthy — block hallucinated nonexistent package names (slopsquatting targets).
- Run a secret scan before committing — keep API keys, passwords, and tokens hardcoded by the AI from leaking outside `.env`.
- Check AI-generated code against OWASP criteria for input validation, authorization checks, and error handling (AI tends to write only the happy path).
- Confirm there are tests on the changed code paths, and check that the AI didn't weaken assertions just to make tests pass.
- For large changes, skim the unified diff file by file to catch unintended file modifications or deletions.
- Add security tools (secret scanning, SAST, dependency vulnerability scanning) to CI to reinforce human review.

## 2. Rules

### 2-1. Common Pitfalls in AI Code

| Pitfall | Symptom | Response |
|---|---|---|
| Hardcoded secrets | API keys/passwords directly in code | Secret scan before commit + enforce .env |
| Hallucinated dependencies | Importing a nonexistent package | Verify installation/existence (slopsquatting target) |
| Happy-path only | Missing input validation/error handling | Check OWASP input validation and authorization |
| Weakened assertions | Deleting/relaxing asserts to pass tests | Review the test diff |
| Excessive permissions | Full-access tokens, `chmod 777` | Verify least-privilege principle |

### 2-2. Areas Never Trusted As-Is

Have a human review the following AI output **line by line**:

- ✅ **Authentication/Authorization** — token verification, sessions, permission branching
- ✅ **Payment** — amount calculation, idempotency, webhook signature verification
- ✅ **Personal data (PII)** — storage, logging, deletion paths
- ✅ **Destructive operations** — DB migrations, bulk deletions, deployments

### 2-3. Reinforce with CI

Human review misses things — add the following to CI so the machine does a first pass:

- ✅ **Secret scanning** (gitleaks, trufflehog)
- ✅ **SAST** (Semgrep, CodeQL)
- ✅ **Dependency vulnerability & existence checks** (osv-scanner, npm audit)

> Fast generation + automated gates + human review of risk areas = the formula for safely shipping vibe coding to production.

## 3. Common Mistakes
- ❌ Hardcoding secrets in code → block with a secret scan before commit + enforcing `.env`.
- ❌ Importing a nonexistent package (hallucination) → verify installation/existence (slopsquatting target).
- ❌ Writing only the happy path, missing input validation/error handling → check against OWASP criteria.
- ❌ Deleting/relaxing assertions to pass tests → review the test diff.
- ❌ Excessive permissions like full-access tokens or `chmod 777` → verify the least-privilege principle.

## 4. Checklist
- [ ] Skimmed the unified diff file by file (no unintended modifications/deletions)
- [ ] Added dependencies actually exist and are trustworthy
- [ ] Secret scan passes (0 hardcoded keys)
- [ ] Auth/payment/PII code was read directly by a human
- [ ] Changed paths have tests, and assertions were not weakened
- [ ] Input validation, authorization checks, and error handling are present
