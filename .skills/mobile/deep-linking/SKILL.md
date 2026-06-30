---
name: 딥링킹 & 유니버설 링크 (Deep Linking)
description: 모바일 딥링크, 유니버설 링크(iOS)·앱 링크(Android), 디퍼드 딥링크 설정 표준. 외부 URL에서 앱 특정 화면으로 진입하는 경로를 만들거나 딥링크 라우팅·검증을 정할 때 읽는다. 키워드: deep-link, universal-link, app-link, url-scheme, deferred-deeplink, routing, applinks, assetlinks.
rules:
  - "외부 URL에서 앱의 특정 화면으로 진입하는 경로는 Universal Links(iOS)·App Links(Android) 로 구현해 브라우저 우회 없이 앱을 연다."
  - "커스텀 URL 스킴(myapp://)은 폴백으로만 사용하고, 검증 가능한 https 링크를 우선한다."
  - "딥링크 라우팅은 중앙 라우터에서 파싱·검증하고, 인증이 필요한 경로는 로그인 후 원래 목적지로 복귀시킨다."
  - "앱 미설치 사용자를 위한 디퍼드 딥링크(설치 후 목적지 이동)를 설정한다."
  - "딥링크 파라미터는 신뢰하지 않고 검증한다 — 악의적 링크로 인한 권한 상승·피싱을 방지한다."
tags:
  - "deep-link"
  - "universal-link"
  - "app-link"
  - "url-scheme"
  - "deferred-deeplink"
  - "routing"
  - "applinks"
  - "assetlinks"
---

# 🔗 딥링킹 & 유니버설 링크

> 외부 URL에서 앱 특정 화면으로 검증된 https 링크로 진입한다. 딥링크 경로를 만들거나 라우팅·인증 복귀·파라미터 검증을 정할 때 읽는다.

## 1. 핵심 원칙
- 외부 URL에서 앱의 특정 화면으로 진입하는 경로는 **Universal Links(iOS)·App Links(Android)** 로 구현해 브라우저 우회 없이 앱을 연다.
- 커스텀 URL 스킴(`myapp://`)은 **폴백으로만** 사용하고, 검증 가능한 https 링크를 우선한다.
- 딥링크 라우팅은 **중앙 라우터에서 파싱·검증**하고, 인증이 필요한 경로는 로그인 후 원래 목적지로 복귀시킨다.
- 앱 미설치 사용자를 위한 **디퍼드 딥링크**(설치 후 목적지 이동)를 설정한다.
- 딥링크 파라미터는 **신뢰하지 않고 검증**한다 — 악의적 링크로 인한 권한 상승·피싱을 방지한다.

## 2. 규칙

### 2-1. 링크 유형 비교
| 유형 | 플랫폼 | 특징 |
|------|--------|------|
| Universal Links | iOS | https URL, 검증됨, 앱 우선 |
| App Links | Android | https URL, 검증됨, 앱 우선 |
| Custom Scheme | 양쪽 | myapp://, 폴백·내부용 |
| Deferred Deep Link | 양쪽 | 미설치→설치 후 목적지 |

### 2-2. iOS — apple-app-site-association
```json
// https://example.com/.well-known/apple-app-site-association
{
  "applinks": {
    "details": [{
      "appID": "TEAMID.com.example.app",
      "paths": ["/product/*", "/order/*"]
    }]
  }
}
```

### 2-3. Android — assetlinks.json
```json
// https://example.com/.well-known/assetlinks.json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.app",
    "sha256_cert_fingerprints": ["AB:CD:..."]
  }
}]
```

### 2-4. 중앙 라우터 패턴 (파싱·검증·인증 복귀)
```swift
// ✅ 권장 — 중앙 라우터에서 파싱하고 인증 필요 경로는 로그인 후 복귀
func handleDeepLink(_ url: URL) {
    guard let route = DeepLinkParser.parse(url) else { return }
    switch route {
    case .product(let id):
        if authService.isLoggedIn {
            navigate(to: .product(id))
        } else {
            pendingDestination = route        // 로그인 후 복귀
            navigate(to: .login)
        }
    }
}
```

## 3. 흔한 실수
- ❌ 커스텀 스킴(`myapp://`)을 주 경로로 사용 → 다른 앱이 가로챌 수 있다. 검증된 https 링크를 우선한다.
- ❌ 딥링크 파라미터(id·token)를 검증 없이 사용 → 권한 상승·피싱 위험.
- ❌ 외부 입력으로 임의 웹뷰 URL 로드 → 피싱 페이지 노출.
- ❌ 인증 필요 화면에 로그인 가드 누락 → 비로그인 접근 가능.
- ❌ 디퍼드 딥링크 미설정 → 앱 미설치 사용자가 설치 후 목적지로 못 감.

## 4. 체크리스트
- [ ] 주 경로를 Universal Links / App Links(검증된 https)로 구현했는가
- [ ] 커스텀 스킴은 폴백으로만 쓰는가
- [ ] 딥링크 라우팅을 중앙 라우터에서 파싱·검증하는가
- [ ] 딥링크 파라미터(id·token)를 검증 후 사용하는가
- [ ] 인증 필요 화면에 로그인 가드 + 원래 목적지 복귀를 적용했는가
- [ ] 미설치 사용자를 위한 디퍼드 딥링크를 설정했는가
- [ ] 외부 입력으로 임의 웹뷰 URL을 로드하지 않는가
