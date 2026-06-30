---
name: OWASP Top 10 보안 가이드
description: OWASP Top 10(2021) 기준의 주요 취약점을 예방하는 방어적 코딩 표준 — Injection, XSS, 인증 결함, 취약한 의존성 등을 다룬다. 새 기능을 설계·구현하거나 외부 입력·인증·권한·데이터 노출을 다룰 때, 보안 점검·코드 리뷰 시 읽는다. 키워드: sanitize, escape, parameterized, IDOR, XSS, injection, npm audit, Content-Security-Policy.
rules:
  - "모든 외부 입력(사용자·API·파일)은 신뢰하지 않고 화이트리스트 검증 또는 파라미터화 쿼리를 사용한다."
  - "HTML 출력 시 사용자 입력을 반드시 이스케이프하고, innerHTML에 미검증 데이터를 삽입하지 않는다."
  - "IDOR 방지를 위해 리소스 접근 시 소유권·권한을 서버에서 재검증한다."
  - "민감한 데이터(비밀번호·토큰·PII)는 응답 바디·URL·로그에 노출하지 않는다."
  - "의존성은 정기적으로 취약점을 스캔하고(npm audit / pip-audit), CRITICAL 취약점은 즉시 패치한다."
tags:
  - "sanitize"
  - "escape"
  - "parameterized"
  - "IDOR"
  - "XSS"
  - "injection"
  - "npm audit"
  - "Content-Security-Policy"
foundational: true
---

# 🔒 OWASP Top 10 보안 가이드

> OWASP Top 10(2021) 기준으로 주요 취약점을 예방하는 방어적 코딩을 표준화한다. 새 기능을 설계·구현하거나 외부 입력·인증·권한·민감 데이터를 다룰 때, 보안 점검·코드 리뷰 시 읽는다.

## 1. 핵심 원칙

- 모든 외부 입력(사용자·API·파일)은 신뢰하지 않고 화이트리스트 검증 또는 파라미터화 쿼리를 사용한다.
- HTML 출력 시 사용자 입력을 반드시 이스케이프하고, `innerHTML`에 미검증 데이터를 삽입하지 않는다.
- IDOR 방지를 위해 리소스 접근 시 소유권·권한을 서버에서 재검증한다.
- 민감한 데이터(비밀번호·토큰·PII)는 응답 바디·URL·로그에 노출하지 않는다.
- 의존성은 정기적으로 취약점을 스캔하고(`npm audit` / `pip-audit`), CRITICAL 취약점은 즉시 패치한다.

## 2. 규칙

### 2-1. OWASP Top 10 (2021) 개요

| 순위 | 취약점 | 핵심 예방책 |
|------|--------|-------------|
| A01 | 접근 제어 결함 | 서버 측 권한 검증, IDOR 차단 |
| A02 | 암호화 실패 | HTTPS 강제, 민감 데이터 암호화 저장 |
| A03 | 인젝션 | 파라미터화 쿼리, 입력 검증 |
| A04 | 불안전한 설계 | 위협 모델링, 보안 설계 패턴 |
| A05 | 보안 설정 오류 | 기본값 변경, 불필요한 기능 비활성화 |
| A06 | 취약하고 오래된 컴포넌트 | SCA 스캔, 자동 업데이트 |
| A07 | 인증·세션 실패 | MFA, 세션 만료, 안전한 토큰 저장 |
| A08 | 소프트웨어·데이터 무결성 실패 | 서명 검증, CI/CD 보안 |
| A09 | 보안 로깅·모니터링 실패 | 감사 로그, 이상 탐지 알람 |
| A10 | SSRF | 외부 URL 요청 화이트리스트 |

### 2-2. SQL Injection 예방 (A03)

```python
# ❌ 금지 — 문자열 조합 쿼리 (입력이 SQL로 해석됨)
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ 권장 — 파라미터화 쿼리
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

### 2-3. XSS 예방 (A03)

```javascript
// ❌ 금지 — 미검증 입력을 innerHTML에 삽입 (스크립트 실행 위험)
element.innerHTML = userInput;

// ✅ 권장
element.textContent = userInput;       // DOM API
DOMPurify.sanitize(htmlContent);       // HTML 허용 시 sanitize
```

### 2-4. IDOR(객체 직접 참조 취약점) 예방 (A01)

```python
# ✅ 권장 — 서버에서 소유권 항상 재검증
def get_order(order_id: str, current_user: User):
    order = db.get(order_id)
    if order.user_id != current_user.id:
        raise ForbiddenError("접근 권한이 없습니다")
    return order
```

## 3. 흔한 실수

- 클라이언트에서만 권한을 검사하고 서버에서 재검증하지 않음 → 접근 제어 우회.
- 민감 데이터를 로그·URL 쿼리스트링에 남김 → 유출 경로 생성.
- 의존성 취약점 스캔을 CI에 넣지 않아 오래된 컴포넌트가 누적됨.

## 4. 체크리스트

- [ ] 모든 외부 입력을 화이트리스트 검증 또는 파라미터화 쿼리로 처리했는가
- [ ] HTML 출력 시 이스케이프하고 `innerHTML`에 미검증 데이터를 넣지 않았는가
- [ ] 리소스 접근 시 소유권·권한을 서버에서 재검증했는가
- [ ] 민감 데이터를 응답 바디·URL·로그에 노출하지 않았는가
- [ ] 의존성 취약점을 스캔하고 CRITICAL을 패치했는가

---

- 입력 검증의 **구체 구현**(Pydantic/Zod 선언적 검증 등)은 `input-validation` 스킬을 참조한다 — 본 스킬은 Top 10 개요·우선순위를 다룬다.
