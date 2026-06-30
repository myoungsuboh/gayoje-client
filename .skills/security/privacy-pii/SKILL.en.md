---
name: Privacy & PII Management (GDPR/PIPA)
description: A general-purpose standard for collecting, storing, processing, and deleting personal information (PII) in line with GDPR and PIPA. Covers minimizing collection, one-way hashing of passwords, encrypting sensitive data, log masking, and fulfilling the right to erasure. Read it when handling user information or deciding how to store passwords/sensitive data, log, or process deletion requests. Keywords: pii, gdpr, pipa, password-hash, bcrypt, argon2, masking, data-retention.
rules:
  - "Collect little, retain briefly: collect only the minimum necessary within the disclosed purpose (no 'just in case'), and automatically dispose of each item once its retention period expires."
  - "Store irreversibly: keep passwords as one-way hashes only, and keep sensitive data encrypted + least privilege. The principle is a form that is useless on its own even if leaked."
  - "Process verifiably: record processing actions such as consent/deletion in audit logs, and fulfill a data subject's deletion request — across every scattered copy — within the deadline."
tags:
  - "pii"
  - "gdpr"
  - "pipa"
  - "개인정보"
  - "password-hash"
  - "bcrypt"
  - "argon2"
  - "masking"
  - "삭제권"
  - "data-retention"
  - "PII"
  - "GDPR"
  - "encrypt"
  - "mask"
  - "anonymize"
  - "consent"
  - "personal_data"
---

# 🔐 Privacy & PII Management (GDPR/PIPA)

> Handle personal information (PII) safely in line with GDPR and the Personal Information Protection Act (PIPA). Collect the minimum, store it safely (passwords as one-way hashes, sensitive data encrypted), leave no identifying information in logs, and fulfill a data subject's deletion request within the set deadline. Read it when building or modifying features that collect, store, process, or delete user information. It is a general-purpose standard not tied to any specific language or datastore.

## 1. Purpose

- Ensure every feature that handles personal information has the same level of protection, **regardless of language, framework, or datastore**.
- Fix the standards so you don't have to rethink each time "how much may I collect, how do I store passwords/sensitive data, what must not be left in logs, what must be erased when a deletion request comes in."
- Reduce the scope of liability in incidents (leaks, legal violations) and make it possible to prove fulfillment.

## 2. Core Principles

There are three mindsets that run through this standard. Concrete practices are covered with ✅/❌ in §3 Rules.

- **Collect little, retain briefly**: collect only the minimum necessary within the disclosed purpose ("just in case" is forbidden), and automatically dispose of each item once its retention period expires.
- **Store irreversibly**: keep passwords as one-way hashes only, and keep sensitive data encrypted + least privilege. The principle is a form that is useless on its own even if leaked.
- **Process verifiably**: record processing actions such as consent/deletion in audit logs, and fulfill a data subject's deletion request — across every scattered copy — within the deadline.

## 3. Rules (✅ Recommended / ❌ Forbidden)

### 3-1. Collect the minimum, only within the purpose

- Don't add fields to screens/forms/APIs just because "it might be nice to have." For each collected item, you must be able to answer "why is this needed."
- Disclose and record the purpose of collection, and don't process beyond that purpose without separate grounds.

```text
// ❌ 금지 — 쓸 데 없는데 "혹시 몰라" 다 받음
signup(name, email, password, 주민번호, 직장, 가족관계, 연소득)

// ✅ 권장 — 서비스에 필요한 최소 항목만, 목적과 함께
signup(email, password)            // 인증에 필요한 최소
// 추가 수집이 필요하면 → 목적 고지 + 동의 기록
```

| Principle | What to do (implementation direction) |
|------|------------------------|
| Purpose limitation | State the collection purpose and record consent/grounds |
| Minimal collection | Remove unnecessary fields; if not needed, don't collect from the start |
| Accuracy | Provide a correction path, keep state up to date |
| Storage limitation | Set a retention period per item; auto-delete/anonymize on expiry |
| Integrity & confidentiality | Encryption, access control, audit logs |

### 3-2. Store passwords only as one-way hashes

- Store passwords only as a **salted one-way hash** (a modern password-hashing algorithm), and verify by "hashing the input the same way and comparing."
- Do not store as plaintext, as reversible (decryptable) encryption, or with a homemade/weak hash (a fast general-purpose hash).

```text
// ❌ 금지 — 평문 또는 복원 가능한 형태로 저장
save(password)                       // 평문 → 유출 시 그대로 노출
save(reversibleEncrypt(password))    // 복호화 가능 → 사실상 평문과 같음

// ✅ 권장 — 솔트 포함 단방향 해시로 저장, 비교로 검증
save(hash(password, salt))           // 저장 시
verify = hash(input, salt) == stored // 검증 시 (복원하지 않음)
```

> For the specific algorithm choice/parameters (work cost, etc.) and library examples, refer to the **Appendix**.

### 3-3. Encrypt sensitive data + minimize access permissions

- Encrypt sensitive data such as national ID numbers, card numbers, and medical information at rest, and narrow the access scope so that **only the roles that actually need it** can read it (column/field-level permissions at the datastore level, or separate storage).
- Manage encryption keys separately from the data and keep them safe (→ `secrets-management`).

```text
// ❌ 금지 — 민감정보를 평문으로, 누구나 읽을 수 있게 저장
record.ssn = "900101-1234567"        // 평문 + 전 직원 조회 가능

// ✅ 권장 — 암호화 저장 + 필요한 역할만 접근
record.ssn = encrypt("900101-1234567")   // 저장은 암호문
// 조회 권한은 최소 역할로 제한, 키는 별도 관리
```

### 3-4. Leave no PII in logs or observability data

- Do not record emails, phone numbers, IPs, identifiers, etc. as plaintext in logs, traces, or monitoring data.
- If unavoidable for debugging and the like, **mask just before recording** (e.g., `u***@example.com`, hide the middle digits of a phone number).

```text
// ❌ 금지 — 식별정보를 로그에 평문으로
log("사용자 요청: user@example.com / 010-1234-5678")

// ✅ 권장 — 기록 전에 마스킹
log("사용자 요청: " + mask(email) + " / " + mask(phone))
//  → "u***@example.com / 010-****-5678"
```

> For masking-function implementation examples, see the **Appendix**. The structure and retention of the audit log itself follow `audit-logging`.

### 3-5. Retention period · automatic disposal

- Set a retention period for each piece of data, and automatically delete or anonymize expired data.
- Don't retain indefinitely on the grounds that "we might use it someday."

```text
// ✅ 권장 — 항목별 보존 정책 + 만료 시 자동 처리
retention: 결제기록 = 5년(법정), 접속로그 = 6개월, 마케팅 동의 철회 시 = 즉시 삭제
expired → 자동 삭제 또는 익명화 (수동 의존 X)
```

### 3-6. Fulfilling the right to erasure (data subject rights) — everywhere it's scattered

- When you receive a deletion request, completely delete the relevant data **within the set deadline** (e.g., within 30 days), or anonymize aggregates that need to be retained.
- Don't just wipe the main datastore and call it done. Make **copies, aggregates, third parties, caches, and backups** all targets.
- Record the act of deletion itself in an audit log as proof (a legal requirement).

```text
// ✅ 권장 — 삭제 요청 처리의 표준 절차
onDeleteRequest(userId):
  1) 식별 가능 데이터 삭제          // 메인 저장소
  2) 서드파티에 삭제 요청 전파       // 메일·분석·알림 등
  3) 보존 필요한 집계는 익명화        // 식별자 제거 후 통계만 유지
  4) 삭제 이벤트를 감사 로그에 기록    // "언제 누구를 지웠는지" 증빙

// ❌ 금지 — 메인만 지우고 나머지 방치
onDeleteRequest(userId):
  delete(mainStore, userId)         // 서드파티·집계·백업에 잔존 → 법 위반
```

> For per-datastore deletion/anonymization implementation (e.g., removing a field in a document DB), see the **Appendix**. The deletion log structure follows `audit-logging`, and access permissions follow `authn-authz`.

## 4. Common Mistakes

Only the traps people frequently fall into while thinking they know the rules (repetition of the rules is omitted).

- **The "deleted, so it's safe" delusion** → if you only wipe the main datastore but it remains in copies, aggregates, third parties, caches, or backups, it's a legal violation. Every scattered location is a target.
- **The "pseudonymized, so we're done" delusion** → if re-identification is possible by combining with other data, it's still personal information. Anonymization requires considering even the combination risk.
- **Mistaking reversible encryption for one-way** → if it can be decrypted, it's effectively plaintext. Passwords must use a one-way hash.
- **Temporarily logging PII while debugging** → "just for a moment" stays as is and is exposed if logs leak. Masking before recording, with no exceptions.
- **Not recording fulfillment** → even if you actually did the consent/deletion, you cannot prove it without an audit log.

## 5. Checklist

- [ ] Are the collected items the **minimum** truly necessary to provide the service (purpose disclosed, consent/grounds recorded)?
- [ ] Are passwords stored as a **salted one-way hash** (not plaintext, reversible encryption, or a weak hash)?
- [ ] Is sensitive data **encrypted** and is access narrowed to **only the necessary roles**?
- [ ] Is PII **masked** so it doesn't remain as plaintext in logs/trace data?
- [ ] Is a **retention period** set per item, with auto-delete/anonymize on expiry?
- [ ] On a deletion request, is data deleted or anonymized across **main, third parties, aggregates, and backups**?
- [ ] Are processing actions such as consent/deletion proven via **audit logs**?
- [ ] Are encryption keys managed separately from the data and kept safe (→ `secrets-management`)?

## Appendix: Examples by Stack

> The following are reference implementation examples. Add examples matching your team's stack (hashing library, datastore type, etc.) in the same pattern. The purposes, principles, and rules in 1–5 above are the standard; the appendix is merely application cases.

### Implementation Examples (hashing libraries / MongoDB, etc.)

#### Password Hashing — bcrypt (Python)

```python
# ❌ 금지 — 평문 또는 가역 암호화 저장
db.save(password)                       # 평문
db.save(reversible_encrypt(password))   # 복호화 가능 → 유출 시 그대로 노출
```
```python
# ✅ 권장 — bcrypt 단방향 해시
import bcrypt

# 저장
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))

# 검증
bcrypt.checkpw(password.encode(), hashed)
```

#### Password Hashing — Argon2 (Python)

```python
# ✅ 권장 — Argon2
# 아래 파라미터는 예시값이다. 환경(하드웨어·지연 허용치)에 맞게 조정하고,
# 최신 권장치는 OWASP Password Storage Cheat Sheet를 참고한다.
from argon2 import PasswordHasher
ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=1)
hashed = ph.hash(password)
ph.verify(hashed, password)
```

#### Log Masking (Python)

```python
# ❌ 금지 — 로그에 개인식별 정보 평문 기록
logger.info(f"사용자 요청: {user_email}")   # user@example.com 그대로 노출
```
```python
# ✅ 권장 — 기록 전 마스킹
import re

def mask_pii(text: str) -> str:
    # 이메일 마스킹: user@example.com → u***@example.com
    text = re.sub(r'(\w{1})\w+@', r'\1***@', text)
    # 전화번호 마스킹
    text = re.sub(r'(\d{3})-\d{4}-(\d{4})', r'\1-****-\2', text)
    return text

logger.info(mask_pii(f"사용자 요청: {user_email}"))
```

#### Right-to-Erasure Implementation (MongoDB)

```python
# ✅ 권장 — 식별정보 삭제 + 서드파티 정리 + 집계 익명화 + 감사 로그
async def delete_user_data(user_id: str):
    # 1. 개인 식별 가능 데이터 삭제
    await db.users.delete_one({"_id": user_id})
    # 2. 서드파티 서비스 삭제 요청 (이메일 서비스, 분석 등)
    await email_service.delete_contact(user_email)
    # 3. 집계 데이터는 익명화 후 보존
    await db.orders.update_many(
        {"user_id": user_id},
        {"$unset": {"user_id": ""}, "$set": {"user_anonymized": True}}
    )
    # 4. 삭제 이벤트 감사 로그 (법적 요건)
    await audit_log.record("USER_DELETED", user_id, timestamp=now())
```
