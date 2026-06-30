# 관리자 — 계정 정지 / 비밀번호 초기화 메일 발송

작성일: 2026-05-18
상태: 설계 승인 대기

## 1. 배경 & 목표

운영 중 관리자 패널([https://harness-system.com/admin](https://harness-system.com/admin))에서 다음 두 액션이 필요해졌다.

1. **계정 정지 / 해제** — 결제 분쟁, abuse, CS 요청 등으로 특정 사용자를 일시 차단. 되돌릴 수 있는 일시 정지(reversible).
2. **비밀번호 초기화 메일 발송** — CS가 사용자를 대신해 `/forgot-password` 흐름을 트리거. 관리자는 사용자의 비밀번호를 절대 보지 않는다.

기존 admin 라우트(`app/api/admin_routes.py`) — 구독 변경, admin 토글, 사용량 리셋 — 의 패턴(`get_admin_user` 가드 + slowapi rate limit + `audit_repository.write` 영구 기록)을 그대로 따른다.

## 2. 범위 (Scope)

**포함**
- `User` 노드에 정지 상태 필드 추가
- BE: 3개 신규 admin 라우트 (suspend / unsuspend / send-password-reset)
- BE: 모든 인증 경로에서 정지 강제 (로그인 / OAuth 콜백 / `get_current_user` / refresh-token)
- BE: JWT `iat` vs `suspended_at` timestamp 비교로 활성 토큰 일괄 무효화 — JTI 매핑 불필요
- FE: 관리자 테이블에 상태 컬럼 + 액션 버튼, 다이얼로그 3종
- FE: 로그인 페이지 + OAuth 콜백의 정지 메시지 처리
- 감사 로그 액션 상수 3개 추가

**비포함 (의도적 YAGNI)**
- 진행 중인 LLM 스트리밍 응답 즉시 중단 — 다음 요청부터 차단으로 충분
- 큐잉된 arq 작업의 워커-단 정지 검사 — 별도 작업
- 사용자 데이터 cascade 정리 — 정지는 reversible이므로 데이터 보존
- 관리자가 임시 비밀번호 직접 설정 — 보안상 항상 메일 발송 경유

## 3. 결정 사항 (사용자 합의)

| 항목 | 결정 |
|---|---|
| 정지 동작 의미 | 되돌릴 수 있는 일시 정지 (`is_suspended` 토글) |
| 정지 시 로그인 메시지 | 명시적: `"계정이 정지되었습니다. 고객센터로 문의해 주세요."` |
| 비밀번호 초기화 방식 | reset 이메일 발송 (관리자는 비밀번호 모름) |
| OAuth-only 사용자 비번 초기화 | 비활성화 + 안내 메시지 |
| 활성 토큰 무효화 강도 | 강력 차단 — 모든 인증 경로에서 즉시 무효 |
| `suspended_reason` 노출 | 관리자가 입력 시 사용자에게 노출, 미입력 시 비노출 |
| 비밀번호 초기화 UI | 다이얼로그로 통일 (정지 다이얼로그와 일관) |

## 4. 데이터 모델

### `User` 노드 신규 필드

| 필드 | 타입 | Default | 의미 |
|---|---|---|---|
| `is_suspended` | bool | `false` | 정지 여부. 모든 인증 경로에서 검사. |
| `suspended_at` | datetime | null | 마지막 정지 시각. JWT `iat` 비교 기준. |
| `suspended_reason` | string (≤500) | `""` | 관리자 입력 사유. 빈 문자열이면 사용자에게 미노출. |
| `suspended_by_email` | string | `""` | 정지를 수행한 관리자 email. |
| `unsuspended_at` | datetime | null | 마지막 해제 시각. UI에 옅게 표시(이력 참고). |

**왜 `suspended_at` timestamp 인가**
- JWT payload의 `iat`와 비교해 `iat < suspended_at` 이면 거부.
- JTI 매핑 없이 사용자의 모든 발급 토큰(access + refresh)을 한 번에 무효화.
- 해제→재정지 시나리오에서도 안전: 매 정지마다 `suspended_at` 갱신 → 이전 모든 토큰 거부.
- 해제 후 새로 발급되는 토큰은 새 `iat` 이므로 정상 동작.

### 마이그레이션

`user_repository.migrate_user_defaults` Cypher에 다음 한 줄 추가 (idempotent):
```cypher
SET u.is_suspended = COALESCE(u.is_suspended, false)
```
기존 사용자는 default `false`라 영향 없음. 인덱스 불필요.

### 감사 로그 액션 상수 (`app/service/audit_repository.py`)

```python
ACTION_USER_SUSPEND = "user_suspend"
ACTION_USER_UNSUSPEND = "user_unsuspend"
ACTION_PASSWORD_RESET_SENT = "password_reset_sent"
```

## 5. BE 엔드포인트

세 라우트 모두 `Depends(get_admin_user)` + slowapi `@limiter.limit("10/minute")`.

### 5.1 `PATCH /api/admin/users/{email}/suspend`

**Request body**
```json
{ "reason": "string (optional, max 500)" }
```

**동작**
1. 본인 정지 차단 — `email == admin.email` 이면 400 `"자기 자신의 계정은 정지할 수 없습니다."`
2. last-admin 보호 — 대상이 admin이고 *활성* admin 수가 1이면 400 `"마지막 관리자입니다. 다른 관리자를 먼저 지정하세요."`
3. Cypher: `is_suspended=true`, `suspended_at=datetime()`, `suspended_reason=$reason`, `suspended_by_email=$admin_email`, `updated_at=datetime()`
4. AuditLog 기록 (`ACTION_USER_SUSPEND`, payload: `{reason, by}`)

**Cypher (atomic last-admin 보호)**
```cypher
MATCH (u:User {email: $email})
OPTIONAL MATCH (a:User)
  WHERE a.is_admin = true AND COALESCE(a.is_suspended, false) = false
WITH u, count(a) AS active_admin_count
WITH u, active_admin_count,
     (COALESCE(u.is_admin, false)
      AND COALESCE(u.is_suspended, false) = false
      AND active_admin_count <= 1) AS would_orphan
CALL {
    WITH u, would_orphan
    WITH u WHERE NOT would_orphan
    SET u.is_suspended = true,
        u.suspended_at = datetime(),
        u.suspended_reason = $reason,
        u.suspended_by_email = $by,
        u.updated_at = datetime()
    RETURN u AS updated
}
RETURN CASE
    WHEN would_orphan THEN { status: 'last_admin', message: '...' }
    ELSE { status: 'ok', user: { ...AdminUserRow } }
END AS result
```

**응답**: `AdminUserRow` (`is_suspended`, `suspended_at`, `suspended_reason`, `suspended_by_email`, `unsuspended_at` 포함하도록 모델 확장).

### 5.2 `PATCH /api/admin/users/{email}/unsuspend`

**Request body**: `{}` (사유 입력 없음)

**동작**
- Cypher: `is_suspended=false`, `unsuspended_at=datetime()`, `updated_at=datetime()`. `suspended_reason`/`suspended_by_email`은 보존(이력).
- AuditLog 기록 (`ACTION_USER_UNSUSPEND`, payload: `{}`)

### 5.3 `POST /api/admin/users/{email}/send-password-reset`

**Request body**: `{}`

**동작**
1. 사용자 조회 — 없으면 404
2. OAuth-only 검사 — `hashed_password == ''` 이면 400 `"OAuth 가입자는 비밀번호 초기화 대상이 아닙니다."`
3. `password_reset_repository.create_token(email)` — 기존 30분 일회용 토큰 (기존 토큰은 자동 invalidate)
4. `settings.password_reset_url`로 reset link 생성 + `email_lib.render_password_reset_email` + `email_lib.send_email`
5. AuditLog 기록 (`ACTION_PASSWORD_RESET_SENT`, payload: `{by_admin: admin.email}`)

`email_enabled=false` 환경에서는 토큰만 생성되고 발송 실패 — 응답에 `{warning: "email_disabled"}` 포함하여 관리자에게 명시. enumeration 방어 불필요 (admin 라우트).

### 5.4 모델 확장

`AdminUserRow` (`app/service/admin_repository.py`)에 다음 필드 추가:
```python
is_suspended: bool = False
suspended_at: Optional[str] = None
suspended_reason: Optional[str] = None
suspended_by_email: Optional[str] = None
unsuspended_at: Optional[str] = None
```
`_LIST_USERS_CYPHER`, `_GET_USER_DETAIL_CYPHER`, `_CHANGE_SUBSCRIPTION_CYPHER`, `_SET_ADMIN_CYPHER` 등 user dict를 반환하는 모든 Cypher에 새 필드 RETURN 추가.

## 6. 인증 강제 (Enforcement)

"강력 차단" 의 핵심 — **모든 인증 경로**에서 정지 검사.

### 6.1 `app/api/auth_routes.py` — 이메일/비번 로그인

비밀번호 검증 통과 *후* `is_suspended` 검사 → 403.
```python
if user_db.is_suspended:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "account_suspended",
            "message": _suspended_message(user_db),
        },
    )
```
- 비번 검증 *후* 검사 이유: 잘못된 비번 입력자에게 계정 존재 노출 방지(enumeration 방어).
- `_suspended_message(user)`:
  - `user.suspended_reason`이 비어있지 않으면 → `"계정이 정지되었습니다. 사유: {reason}"`
  - 비어있으면 → `"계정이 정지되었습니다. 고객센터로 문의해 주세요."`

### 6.2 OAuth 콜백 — GitHub / Google

사용자 노드 lookup 후 `is_suspended` 검사 → FE 로그인 페이지로 redirect `?error=suspended&reason={url_encoded reason or ''}`.

### 6.3 `app/core/security.py::get_current_user` — 모든 보호 라우트

Neo4j 재조회 직후 검사:
```python
if user_db.is_suspended:
    raise HTTPException(401, "계정이 정지되었습니다.")

iat = payload.get("iat")
if iat and user_db.suspended_at:
    suspended_epoch = _to_epoch(user_db.suspended_at)
    if iat < suspended_epoch:
        raise HTTPException(401, "세션이 만료되었습니다. 다시 로그인해 주세요.")
```
**둘 다 필요한 이유**:
- `is_suspended` 검사: 현재 정지 상태인 사용자의 모든 요청 차단.
- `iat < suspended_at` 검사: 정지→해제→재정지 시나리오에서 이전 정지 *이전*에 발급된 토큰까지 거부 (안전망).
- 단순 `is_suspended` 만으론 해제 직후 발급된 새 토큰과 이전 토큰을 구분 못 함 → 두 번째 검사가 필요.

### 6.4 refresh-token 라우트

`get_current_user`와 동일하게 user 재조회 + `is_suspended` + `iat < suspended_at` 검사 → 401.

### 6.5 JWT `iat` 클레임 확인

[`app/core/security.py`](harness-server/app/core/security.py)의 토큰 발급 코드에서 PyJWT가 `iat`을 자동 포함하는지 확인. 누락이면 명시적으로 추가 (`payload["iat"] = int(time.time())`).

## 7. FE 변경

### 7.1 API 헬퍼 (`src/utils/admin.js`)

기존 패턴(`{ success, ...data | error, status }`) 그대로:

```js
export const suspendUserApi = async (email, { reason = '' } = {}) => { ... }
export const unsuspendUserApi = async (email) => { ... }
export const sendPasswordResetApi = async (email) => { ... }
```

### 7.2 관리자 페이지 (`src/pages/admin/index.vue`)

**테이블 컬럼**: `이메일 | 이름 | GitHub | 구독 | 권한 | 상태 | 가입 | 액션`
- 상태 셀: `정상` 또는 `정지됨` 칩 (정지는 빨강 + tooltip에 `suspended_at` + `suspended_reason`)

**액션 버튼 추가**:
- 정지/해제 토글 — 아이콘 (`UserX` / `UserCheck`)
- 비밀번호 초기화 메일 — `Mail` 아이콘
  - OAuth-only 사용자(`!user.has_password` 또는 비번 hash 비어있음 표시 필드)면 `disabled` + tooltip
  - 판별을 위해 백엔드 `AdminUserRow`에 `has_password: bool` 필드 추가 (`u.hashed_password <> ''` 매핑)

**다이얼로그 3종 (`subDialogOpen` 패턴 그대로)**

| 다이얼로그 | 입력 | 제출 시 |
|---|---|---|
| `suspendDialogOpen` | reason textarea (optional, ≤500, placeholder: *"비워두면 사용자에게 노출되지 않습니다"*) | `suspendUserApi` → 성공 시 list reload + 상세 reload |
| `unsuspendDialogOpen` | 사유 표시(읽기 전용) + 확인 | `unsuspendUserApi` |
| `resetPwDialogOpen` | 안내 문구 *"이 사용자에게 비밀번호 재설정 링크가 담긴 이메일이 발송됩니다 (30분 후 만료)."* + 확인 | `sendPasswordResetApi` |

**본인 행 제약**: 본인 row에서 정지 버튼 disabled + tooltip `"자기 자신의 계정은 정지할 수 없습니다"` (BE 400 fallback).

**상세 패널**: 정지 상태면 상단에 빨간 배너 — 사유 / 정지 시각 / 정지한 관리자 email. 해제된 적 있으면 옅게 `unsuspended_at` 표시.

### 7.3 로그인 페이지 (`src/pages/login.vue`)

axios 응답이 403 + `data.code === "account_suspended"` 면 `data.message` 그대로 표시. 일반 401(잘못된 비번)과 구분.

### 7.4 OAuth 콜백 처리 (`src/pages/auth/*`)

URL query `error=suspended` 감지 시 로그인 페이지로 redirect + 동일 메시지 표시. `reason` query가 있으면 사유 포함.

## 8. 테스트

### BE — `tests/test_admin_suspend.py`

- ✅ 정상 정지/해제 → DB 필드 + AuditLog 1건
- ✅ 본인 정지 시도 → 400
- ✅ 마지막 활성 admin 정지 → 400 (`last_admin`)
- ✅ 정지된 사용자 이메일 로그인 (정상 비번) → 403 `account_suspended`
- ✅ 정지된 사용자 access token으로 보호 라우트 → 401
- ✅ 정지된 사용자 refresh token으로 재발급 → 401
- ✅ 해제 후 새 로그인 → 정상
- ✅ `iat < suspended_at` edge case: 해제→재정지 시 이전 정지 이전에 발급된 토큰도 거부
- ✅ `suspended_reason` 빈 입력 → 응답 메시지에 사유 미포함

### BE — `tests/test_admin_password_reset.py`

- ✅ 정상 사용자 → 토큰 생성 + 메일 발송 호출 + AuditLog
- ✅ OAuth-only(`hashed_password=''`) → 400
- ✅ 미가입 이메일 → 404
- ✅ 기존 토큰 있던 사용자 → invalidate 후 신규 생성
- ✅ `email_enabled=false` → 응답에 `warning: email_disabled`

### FE — Vitest

- `tests/admin-api.test.js`: 신규 헬퍼 success/error normalize
- `tests/admin-page.test.js`: 다이얼로그 사유 입력, 본인 행 정지 disabled, OAuth-only 비번 초기화 disabled, 정지 칩 렌더링

## 9. Rollout

1. **BE 배포** — `is_suspended` 기본 false라 기존 사용자 영향 없음. migration cypher 부팅 시 1회 실행(idempotent).
2. **FE 배포** — 관리자 UI 노출.
3. **운영 검증** — 테스트 계정 1개 정지 → 로그인 403 / 보호 라우트 401 / refresh 401 확인 → 비번 초기화 메일 발송 확인 → 해제 → 정상 로그인.

## 10. 보안 노트

- `suspended_reason`은 로그인 실패 응답에 사유 입력 시에만 포함. 미입력 시 고정 메시지.
- 비번 초기화 이메일 발송은 admin 라우트이므로 enumeration 방어 불필요 — 미존재 사용자는 404, OAuth-only는 400으로 솔직히 응답.
- `password_reset_repository.create_token`은 사용자당 1개만 유지(재발급 시 기존 invalidate) — 관리자가 발송한 토큰과 사용자 본인 forgot-password 토큰이 충돌해도 마지막 것이 유효.
- 정지된 사용자가 forgot-password 흐름으로 비밀번호 변경 시도 → 토큰은 정상 발급되지만 변경 후에도 `is_suspended=true` 유지(`/reset-password`는 `is_suspended`를 변경하지 않음). 정지 우회 불가.
- `iat`은 epoch second 기준 비교. `user.suspended_at` (Neo4j datetime)은 epoch second로 변환 후 비교.

## 11. 향후 작업 (별도 spec)

- 진행 중 스트리밍 응답의 정지 즉시 중단 (cancellation hook)
- arq 워커의 작업 진입 시 user 상태 검사 → skip
- "영구 비활성화" 별도 액션 (정지와 구분되는 강한 의미)
