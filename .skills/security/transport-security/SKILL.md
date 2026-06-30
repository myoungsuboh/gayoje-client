---
name: 전송 보안 표준 — TLS·HTTPS·보안 헤더
description: 전송 계층의 도청·변조·클릭재킹을 막는 범용(foundational) 표준. HTTPS 강제, TLS 최소 버전·암호 스위트, HSTS·CSP·보안 헤더, CORS 화이트리스트, 민감 응답 캐시 금지를 다룬다. 서버·API의 헤더·TLS·CORS를 구성·점검하거나 HTTPS 전환을 정비할 때 읽는다.
rules:
  - "평문 전송을 신뢰하지 않는다: 네트워크 경로는 도청·변조될 수 있다고 가정한다. 모든 트래픽은 HTTPS로만 허용하고, HTTP 요청은 영구 리다이렉트(301)로 HTTPS로 전환한다."
  - "HSTS로 평문 재접속을 차단한다: 첫 요청 이후 브라우저가 평문으로 되돌아가지 않도록 HSTS를 강제한다. 리다이렉트만으로는 최초 평문 요청이 노출되므로 HSTS가 필수다."
  - "기본 거부, 명시 허용(default-deny): CSP·CORS는 '모두 막고 필요한 출처만 연다'를 기본으로 한다. 와일드카드 허용은 신뢰 경계를 무너뜨린다."
  - "TLS는 안전한 버전·암호만: 취약한 프로토콜·암호 스위트로의 다운그레이드를 막는다. 최소 버전 이상만 허용한다."
  - "민감 응답은 캐시에 남기지 않는다: 인증·개인정보가 담긴 응답은 프록시·브라우저 캐시에 잔류하지 않게 한다."
  - "헤더·정책은 한곳에서 일괄 적용: 보안 헤더와 CORS 정책을 엔드포인트마다 흩뿌리지 말고 공통 진입 지점(미들웨어/필터/게이트웨이)에서 일관되게 건다."
  - "설정은 코드가 아닌 환경으로: 허용 출처·인증서 등 환경마다 다른 값은 환경 변수/설정으로 분리해, 개발 설정이 프로덕션으로 새지 않게 한다."
tags:
  - "HTTPS"
  - "TLS"
  - "HSTS"
  - "Content-Security-Policy"
  - "X-Frame-Options"
  - "CORS"
  - "Strict-Transport-Security"
  - "helmet"
foundational: true
---

# 🔒 전송 보안 표준 — TLS·HTTPS·보안 헤더

> 전송 계층의 도청·변조·클릭재킹을 막는다. 모든 트래픽을 HTTPS로만 흘리고, TLS를 안전하게 설정하며, 표준 보안 헤더와 CORS 화이트리스트로 브라우저를 방어한다. 서버·API의 HTTPS·TLS·보안 헤더·CORS를 구성하거나 점검할 때 읽는다. 특정 언어/프레임워크/도구에 종속되지 않는 범용 표준이다. (헤더 값·TLS 버전·정책 자체는 업계 표준이라 본문에 그대로 둔다.)

## 1. 핵심 원칙
- **평문 전송을 신뢰하지 않는다**: 네트워크 경로는 도청·변조될 수 있다고 가정한다. 모든 트래픽은 HTTPS로만 허용하고, HTTP 요청은 영구 리다이렉트(301)로 HTTPS로 전환한다.
- **HSTS로 평문 재접속을 차단한다**: 첫 요청 이후 브라우저가 평문으로 되돌아가지 않도록 HSTS를 강제한다. 리다이렉트만으로는 최초 평문 요청이 노출되므로 HSTS가 필수다.
- **기본 거부, 명시 허용(default-deny)**: CSP·CORS는 "모두 막고 필요한 출처만 연다"를 기본으로 한다. 와일드카드 허용은 신뢰 경계를 무너뜨린다.
- **TLS는 안전한 버전·암호만**: 취약한 프로토콜·암호 스위트로의 다운그레이드를 막는다. 최소 버전 이상만 허용한다.
- **민감 응답은 캐시에 남기지 않는다**: 인증·개인정보가 담긴 응답은 프록시·브라우저 캐시에 잔류하지 않게 한다.
- **헤더·정책은 한곳에서 일괄 적용**: 보안 헤더와 CORS 정책을 엔드포인트마다 흩뿌리지 말고 공통 진입 지점(미들웨어/필터/게이트웨이)에서 일관되게 건다.
- **설정은 코드가 아닌 환경으로**: 허용 출처·인증서 등 환경마다 다른 값은 환경 변수/설정으로 분리해, 개발 설정이 프로덕션으로 새지 않게 한다.

## 2. 규칙

### 2-1. 모든 트래픽을 HTTPS로 강제한다
- HTTP로 들어온 요청은 동일 경로의 HTTPS로 301 리다이렉트한다. HTTP를 그대로 서비스하지 않는다.
- 리다이렉트에 그치지 말고 **HSTS를 함께** 적용해 이후 재접속이 평문으로 내려가지 않게 한다.

```text
// ❌ 금지 — HTTP를 그대로 두거나, 리다이렉트만 하고 HSTS 누락
http://api → (그대로 응답)            // 평문 노출
http://api → 301 https://api          // 다음 접속이 다시 평문일 수 있음

// ✅ 권장 — HTTPS 강제 + HSTS로 평문 재접속 차단
http://api → 301 https://api
응답 헤더: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 2-2. 표준 보안 헤더를 일괄로 건다
- 아래 헤더를 공통 진입 지점에서 모든 응답에 적용한다(값은 업계 표준).

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{random}';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- HSTS는 `max-age=31536000`(1년) 이상 + `includeSubDomains`를 포함한다.
- 클릭재킹 방어로 `X-Frame-Options: DENY`(또는 CSP `frame-ancestors 'none'`)를 건다.

### 2-3. CSP는 default-src 'self' 기준으로, unsafe-inline 제거
- `default-src 'self'`를 기본으로 두고, 필요한 출처만 디렉티브별로 **명시 허용**한다.
- 인라인 스크립트/스타일 허용(`unsafe-inline`)은 XSS 방어를 무력화한다 — nonce 또는 해시로 대체한다.

```text
// ❌ 금지 — 인라인 전면 허용 (XSS 방어 무력화)
Content-Security-Policy: default-src *; script-src 'self' 'unsafe-inline'

// ✅ 권장 — 기본 self, 인라인은 nonce로만 허용
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'
```

### 2-4. CORS는 명시적 화이트리스트로 (와일드카드 금지)
- 허용 출처를 **환경별 화이트리스트**로 관리한다. 프로덕션에서 `Access-Control-Allow-Origin: *`를 쓰지 않는다.
- 자격 증명을 동반하는 요청(`allow_credentials`)에는 와일드카드 출처를 절대 결합하지 않는다.
- 허용 출처 목록은 코드에 박지 말고 환경 변수/설정으로 분리한다.

```text
// 환경별로 허용 출처를 명시한다
개발:      localhost:3000 허용 (명시적)
스테이징:  staging.example.com 허용
프로덕션:  app.example.com 만 허용
```

```text
// ❌ 금지 — 프로덕션에서 모든 출처 허용
Access-Control-Allow-Origin: *

// ✅ 권장 — 환경 변수(ALLOWED_ORIGINS)로 화이트리스트 관리
allow_origins = ALLOWED_ORIGINS.split(',')
```

### 2-5. 민감 응답은 캐시 금지
- 인증·개인정보가 담긴 응답에는 `Cache-Control: no-store`를 걸어 프록시·브라우저 캐시 잔류를 막는다.

```text
// ❌ 금지 — 민감 응답이 캐시 가능 상태로 내려감
200 /me  (Cache-Control 없음)         // 프록시·브라우저에 잔류

// ✅ 권장 — 민감 응답은 캐시 금지
200 /me  Cache-Control: no-store
```

### 2-6. TLS는 안전한 버전·암호만 허용
- TLS 1.2 이상만 허용한다(SSLv3, TLS 1.0/1.1 비활성화) — 취약 프로토콜로의 다운그레이드를 막는다.
- 강력한 암호 스위트만 허용한다.
- 외부 점검 도구(예: SSL Labs `ssllabs.com/ssltest`)에서 A 등급을 목표로 한다.
- 인증서는 만료 전 **자동 갱신**되도록 운영한다(수동 갱신은 만료 사고를 부른다).

```text
// ❌ 금지 — 구버전 프로토콜 허용 → 다운그레이드 공격
TLS 1.0 / 1.1 / SSLv3 enabled

// ✅ 권장 — 최소 버전 이상 + 강한 암호만
min TLS 1.2,  강한 cipher suite만,  SSL Labs A 등급
```

## 3. 흔한 실수
- **리다이렉트만 하고 HSTS 누락** → 301로 넘겨도 최초 요청은 평문으로 노출된다. 리다이렉트 + HSTS를 반드시 함께.
- **CSP에 `unsafe-inline` 잔존** → 헤더는 걸었지만 인라인을 허용하면 XSS 방어가 무력화된다. nonce/해시로 대체한다.
- **와일드카드 출처 + 자격 증명 결합** → 자격 증명 요청에 `*`를 쓰면 브라우저가 막거나 오히려 더 위험해진다. 프로덕션 CORS는 환경별 화이트리스트로, 명시 출처만.
- **민감 응답에 `no-store` 미적용** → 인증·개인정보 응답이 프록시·브라우저 캐시에 남는다.
- **인증서 수동 갱신** → 갱신을 놓쳐 만료 장애가 난다. 자동 갱신으로.
- **헤더를 엔드포인트마다 산발 적용** → 누락이 잦다. 공통 진입 지점에서 일괄로.

## 4. 체크리스트
- [ ] HTTP를 HTTPS로 301 리다이렉트하고 **HSTS**를 설정했는가
- [ ] 표준 보안 헤더(HSTS·CSP·X-Content-Type-Options·X-Frame-Options·Referrer-Policy·Permissions-Policy)를 공통 지점에서 일괄로 걸었는가
- [ ] CSP에서 `unsafe-inline`을 제거하고 출처를 명시했는가
- [ ] CORS 출처를 환경별 화이트리스트로 관리하는가 (`*` 금지, 자격 증명과 와일드카드 결합 금지)
- [ ] 민감 API 응답에 `Cache-Control: no-store`를 설정했는가
- [ ] TLS 1.2 이상만 허용하고 강한 암호 스위트 + SSL Labs A 등급을 확인했는가
- [ ] 인증서가 자동 갱신되도록 운영하는가
- [ ] 허용 출처·인증서 등 환경별 값을 환경 변수/설정으로 분리했는가

## 부록: 스택별 예시

> 아래는 참고용 구현 예시다. 팀이 쓰는 스택(예: Node/Helmet, Python/FastAPI, Nginx/Apache, certbot 등)에 맞는 예시를 같은 패턴으로 추가한다. 위 1~4의 원칙·규칙이 표준이고, 부록은 그 적용 사례일 뿐이다. 입력값 검증·인증 등 인접 주제는 해당 스킬을 따른다.

### 도구별 예시

#### 보안 헤더 설정 — Node.js (Helmet)

```javascript
import helmet from "helmet";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'nonce-{generated}'"],
      imgSrc: ["'self'", "data:", "https://trusted-cdn.com"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
```

#### HTTPS 강제 · CORS — Python (FastAPI)

```python
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(CORSMiddleware,
  allow_origins=["https://app.example.com"],  # 화이트리스트
  allow_credentials=True,
  allow_methods=["GET", "POST", "PUT", "DELETE"],
  allow_headers=["Authorization", "Content-Type"],
)
```

#### TLS 인증서 자동 갱신 — Let's Encrypt (certbot)

- 인증서 자동 갱신 설정 (Let's Encrypt certbot)
