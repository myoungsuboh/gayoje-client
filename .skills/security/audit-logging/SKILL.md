---
name: 보안 감사 로깅 & 이벤트 추적
description: 보안 관련 이벤트(인증·인가·데이터 변경·관리 행위)를 변경 불가 감사 로그로 기록하고 이상 징후를 탐지하는 표준. 인증/인가 흐름을 만들거나 민감 데이터 변경·관리 기능을 추가할 때, 감사 로그 구조·보존·알람을 정할 때 읽는다. 키워드: audit_log, audit, event_log, security_event, append-only, structured_log, SIEM.
rules:
  - "인증 이벤트(로그인 성공·실패·로그아웃·토큰 갱신)와 인가 실패는 반드시 감사 로그에 기록한다."
  - "감사 로그는 변경 불가(append-only)로 저장하고, 애플리케이션 로그와 분리된 스토리지에 보관한다."
  - "감사 로그 항목에는 타임스탬프(UTC)·행위자(user_id·IP)·대상(resource_id)·행위·결과를 포함한다."
  - "감사 로그에 개인정보를 노출하지 않고, 민감 값은 마스킹하거나 해시로 참조한다."
  - "로그인 실패 반복·비정상 시간대 접근·대용량 데이터 조회 등 이상 패턴에 알람을 설정한다."
tags:
  - "audit_log"
  - "audit"
  - "event_log"
  - "security_event"
  - "append-only"
  - "structured_log"
  - "SIEM"
---

# 🔒 보안 감사 로깅 & 이벤트 추적

> 보안 이벤트를 구조화된 감사 로그로 남겨 사고를 추적하고 이상 징후를 탐지한다. 인증·인가·민감 데이터 변경·관리 기능을 만들거나 감사 로그 구조·보존·알람을 정할 때 읽는다.

## 1. 핵심 원칙

- 인증 이벤트(로그인 성공·실패·로그아웃·토큰 갱신)와 인가 실패는 반드시 감사 로그에 기록한다.
- 감사 로그는 변경 불가(append-only)로 저장하고, 애플리케이션 로그와 분리된 스토리지에 보관한다.
- 감사 로그 항목에는 타임스탬프(UTC)·행위자(user_id·IP)·대상(resource_id)·행위·결과를 포함한다.
- 감사 로그에 개인정보를 노출하지 않고, 민감 값은 마스킹하거나 해시로 참조한다.
- 로그인 실패 반복·비정상 시간대 접근·대용량 데이터 조회 등 이상 패턴에 알람을 설정한다.

## 2. 규칙

### 2-1. 감사 로그 필수 이벤트

아래 카테고리의 이벤트는 빠짐없이 기록한다.

| 카테고리 | 이벤트 예시 |
|----------|-------------|
| 인증 | 로그인 성공/실패, 로그아웃, 비밀번호 변경, MFA 시도 |
| 인가 | 권한 부족 접근 시도, 역할 변경 |
| 데이터 변경 | 생성·수정·삭제 (민감 리소스) |
| 관리 행위 | 사용자 생성/삭제, 설정 변경, 권한 부여 |
| 시스템 | 서비스 시작/중지, 설정 파일 변경 |

### 2-2. 감사 로그 구조 (필수 필드 + append-only 기록)

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

### 2-3. 민감 정보 마스킹 (개인정보 노출 금지)

```python
# ❌ 금지 — 비밀번호·토큰 등 민감 값을 평문으로 detail에 담음
detail = {"password": raw_password, "token": access_token}

# ✅ 권장 — 민감 값은 마스킹하거나 해시로 참조
detail = {"password": "***", "token_hash": sha256(access_token)}
```

### 2-4. 이상 탐지 알람 규칙

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

### 2-5. 로그 보존 정책

| 로그 유형 | 보존 기간 | 이유 |
|-----------|-----------|------|
| 인증 로그 | 1년 | 보안 조사 |
| 데이터 변경 로그 | 3년 | 법적 요건 |
| 관리 행위 로그 | 5년 | 규정 준수 |
| 일반 접근 로그 | 90일 | 스토리지 비용 |

## 3. 흔한 실수

- 감사 로그를 애플리케이션 로그와 섞어 저장 → 위변조·삭제 위험, 추적성 상실.
- detail에 비밀번호·토큰·주민번호 등 민감 값을 평문으로 기록.
- 인가 실패(권한 부족 접근)를 기록하지 않아 공격 시도를 놓침.
- 알람 없이 로그만 쌓아둠 → 이상 징후를 사후에야 발견.
- 보존 기간 미설정 → 법적 요건 위반 또는 불필요한 스토리지 비용.

## 4. 체크리스트

- [ ] 인증·인가·데이터 변경·관리 행위 이벤트를 모두 기록하는가
- [ ] 감사 로그를 append-only로, 앱 로그와 분리된 스토리지에 저장하는가
- [ ] 타임스탬프(UTC)·행위자·대상·행위·결과 필드를 모두 채우는가
- [ ] 민감 값을 마스킹/해시 처리해 개인정보가 노출되지 않는가
- [ ] 로그인 실패 반복·비정상 시간대 접근·대용량 조회 알람을 설정했는가
- [ ] 로그 유형별 보존 기간을 정의했는가
