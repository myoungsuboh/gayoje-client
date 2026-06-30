---
name: Deep Linking & Universal Links (Deep Linking)
description: Standards for configuring mobile deep links, Universal Links (iOS) / App Links (Android), and deferred deep links. Read this when building a path that enters a specific app screen from an external URL, or defining deep link routing and validation. Keywords: deep-link, universal-link, app-link, url-scheme, deferred-deeplink, routing, applinks, assetlinks.
rules:
  - "Implement paths that enter a specific app screen from an external URL using Universal Links (iOS) / App Links (Android) so the app opens without a browser detour."
  - "Use custom URL schemes (myapp://) only as a fallback, and prefer verifiable https links."
  - "Parse and validate deep link routing in a central router, and for routes requiring authentication, return to the original destination after login."
  - "Set up deferred deep links (navigating to the destination after install) for users who don't have the app installed."
  - "Do not trust deep link parameters — validate them to prevent privilege escalation and phishing from malicious links."
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

# 🔗 Deep Linking & Universal Links

> Enter a specific app screen from an external URL via verified https links. Read this when building a deep link path or defining routing, auth return, and parameter validation.

## 1. Core Principles
- Implement paths that enter a specific app screen from an external URL using **Universal Links (iOS) / App Links (Android)** so the app opens without a browser detour.
- Use custom URL schemes (`myapp://`) **only as a fallback**, and prefer verifiable https links.
- **Parse and validate** deep link routing **in a central router**, and for routes requiring authentication, return to the original destination after login.
- Set up **deferred deep links** (navigating to the destination after install) for users who don't have the app installed.
- **Do not trust and validate** deep link parameters — prevent privilege escalation and phishing from malicious links.

## 2. Rules

### 2-1. Link Type Comparison
| Type | Platform | Characteristics |
|------|--------|------|
| Universal Links | iOS | https URL, verified, app-first |
| App Links | Android | https URL, verified, app-first |
| Custom Scheme | Both | myapp://, fallback / internal use |
| Deferred Deep Link | Both | not installed → destination after install |

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

### 2-4. Central Router Pattern (parse, validate, auth return)
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

## 3. Common Mistakes
- ❌ Using a custom scheme (`myapp://`) as the primary path → another app can intercept it. Prefer verified https links.
- ❌ Using deep link parameters (id, token) without validation → risk of privilege escalation and phishing.
- ❌ Loading arbitrary webview URLs from external input → exposure to phishing pages.
- ❌ Missing a login guard on auth-required screens → unauthenticated access is possible.
- ❌ Not configuring deferred deep links → users without the app can't reach the destination after install.

## 4. Checklist
- [ ] Did you implement primary paths as Universal Links / App Links (verified https)?
- [ ] Do you use custom schemes only as a fallback?
- [ ] Do you parse and validate deep link routing in a central router?
- [ ] Do you validate deep link parameters (id, token) before use?
- [ ] Did you apply a login guard + return to the original destination on auth-required screens?
- [ ] Did you set up deferred deep links for users without the app installed?
- [ ] Do you avoid loading arbitrary webview URLs from external input?
