---
name: Security Audit Logging & Event Tracking
description: A standard for recording security-related events (authentication, authorization, data changes, administrative actions) in immutable audit logs and detecting anomalies. Read it when building authn/authz flows, adding sensitive-data-change or admin features, or deciding audit log structure, retention, and alerting. Keywords: audit_log, audit, event_log, security_event, append-only, structured_log, SIEM.
rules:
  - "Authentication events (login success/failure, logout, token refresh) and authorization failures must be written to the audit log."
  - "Store audit logs as immutable (append-only) and keep them in storage separate from application logs."
  - "Each audit log entry includes a timestamp (UTC), actor (user_id, IP), target (resource_id), action, and result."
  - "Do not expose personal data in audit logs; mask sensitive values or reference them by hash."
  - "Set alerts for anomalous patterns such as repeated login failures, access at abnormal hours, and large-volume data queries."
tags:
  - "audit_log"
  - "audit"
  - "event_log"
  - "security_event"
  - "append-only"
  - "structured_log"
  - "SIEM"
---

# 🔒 Security Audit Logging & Event Tracking

> Leave security events as structured audit logs to trace incidents and detect anomalies. Read it when building authentication, authorization, sensitive-data-change, or admin features, or when deciding audit log structure, retention, and alerting.

## 1. Core Principles

- Authentication events (login success/failure, logout, token refresh) and authorization failures must be written to the audit log.
- Store audit logs as immutable (append-only) and keep them in storage separate from application logs.
- Each audit log entry includes a timestamp (UTC), actor (user_id, IP), target (resource_id), action, and result.
- Do not expose personal data in audit logs; mask sensitive values or reference them by hash.
- Set alerts for anomalous patterns such as repeated login failures, access at abnormal hours, and large-volume data queries.

## 2. Rules

### 2-1. Mandatory Audit Log Events

Record events in the categories below without omission.

| Category | Example events |
|----------|-------------|
| Authentication | Login success/failure, logout, password change, MFA attempt |
| Authorization | Insufficient-permission access attempt, role change |
| Data change | Create/update/delete (sensitive resources) |
| Admin action | User create/delete, configuration change, permission grant |
| System | Service start/stop, configuration file change |

### 2-2. Audit Log Structure (required fields + append-only recording)

```python
from dataclasses import dataclass
from datetime import datetime, timezone

@dataclass
class AuditEvent:
    timestamp: str     # ISO 8601 UTC
    event_type: str    # "AUTH_LOGIN_FAILED"
    actor_id: str      # "user_abc123" 또는 "system"
    actor_ip: str      # "192.168.1.1"
    resource_type: str # "User", "Order", "File"
    resource_id: str   # "order_xyz789"
    action: str        # "READ", "CREATE", "UPDATE", "DELETE"
    result: str        # "SUCCESS", "FAILURE", "DENIED"
    detail: dict       # 추가 컨텍스트 (민감 정보 제외)

def record_audit(event: AuditEvent):
    # append-only 스토리지에 기록
    audit_db.insert_one(asdict(event))
    # SIEM으로 스트리밍
    siem_client.send(event)
```

### 2-3. Masking Sensitive Information (no exposure of personal data)

```python
# ❌ 금지 — 비밀번호·토큰 등 민감 값을 평문으로 detail에 담음
detail = {"password": raw_password, "token": access_token}

# ✅ 권장 — 민감 값은 마스킹하거나 해시로 참조
detail = {"password": "***", "token_hash": sha256(access_token)}
```

### 2-4. Anomaly Detection Alert Rules

```python
ALERT_RULES = [
    # 5분 내 로그인 실패 5회 이상
    {"event": "AUTH_LOGIN_FAILED", "count": 5, "window_sec": 300},
    # 1시간 내 대용량 데이터 조회 (>1000 rows)
    {"event": "DATA_EXPORT", "threshold": 1000, "window_sec": 3600},
    # 근무 시간 외(22:00~06:00) 관리 행위
    {"event": "ADMIN_ACTION", "time_range": "22:00-06:00"},
]
```

### 2-5. Log Retention Policy

| Log type | Retention period | Reason |
|-----------|-----------|------|
| Authentication log | 1 year | Security investigation |
| Data change log | 3 years | Legal requirement |
| Admin action log | 5 years | Regulatory compliance |
| General access log | 90 days | Storage cost |

## 3. Common Mistakes

- Storing audit logs mixed with application logs → risk of tampering/deletion and loss of traceability.
- Recording sensitive values such as passwords, tokens, or national ID numbers in detail as plaintext.
- Failing to record authorization failures (insufficient-permission access), missing attack attempts.
- Piling up logs without alerts → anomalies are discovered only after the fact.
- No retention period set → violating legal requirements or incurring unnecessary storage cost.

## 4. Checklist

- [ ] Are authentication, authorization, data-change, and admin-action events all recorded?
- [ ] Are audit logs stored append-only and in storage separate from app logs?
- [ ] Are the timestamp (UTC), actor, target, action, and result fields all filled in?
- [ ] Are sensitive values masked/hashed so personal data is not exposed?
- [ ] Are alerts set for repeated login failures, access at abnormal hours, and large-volume queries?
- [ ] Is a retention period defined per log type?
