---
name: 深度链接 & 通用链接 (Deep Linking)
description: 移动端深度链接、通用链接(iOS)、应用链接(Android)、延迟深度链接的配置标准。当需要构建从外部 URL 进入应用特定界面的路径，或制定深度链接路由与校验时阅读。关键词: deep-link, universal-link, app-link, url-scheme, deferred-deeplink, routing, applinks, assetlinks.
rules:
  - "从外部 URL 进入应用特定界面的路径应使用 Universal Links(iOS)、App Links(Android)实现，以绕过浏览器中转直接打开应用。"
  - "自定义 URL scheme(myapp://)仅作为回退使用，优先采用可校验的 https 链接。"
  - "深度链接路由在中央路由器中解析与校验，需要鉴权的路径在登录后返回到原目的地。"
  - "为未安装应用的用户配置延迟深度链接(安装后跳转到目的地)。"
  - "不信任深度链接参数并进行校验 — 防范恶意链接导致的权限提升与钓鱼。"
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

# 🔗 深度链接 & 通用链接

> 通过经过验证的 https 链接从外部 URL 进入应用特定界面。构建深度链接路径，或制定路由、鉴权返回、参数校验时阅读。

## 1. 核心原则
- 从外部 URL 进入应用特定界面的路径应使用 **Universal Links(iOS)、App Links(Android)**实现，以绕过浏览器中转直接打开应用。
- 自定义 URL scheme(`myapp://`)**仅作为回退**使用，优先采用可校验的 https 链接。
- 深度链接路由在**中央路由器中解析与校验**，需要鉴权的路径在登录后返回到原目的地。
- 为未安装应用的用户配置**延迟深度链接**(安装后跳转到目的地)。
- 不信任深度链接参数并**进行校验** — 防范恶意链接导致的权限提升与钓鱼。

## 2. 规则

### 2-1. 链接类型对比
| 类型 | 平台 | 特点 |
|------|--------|------|
| Universal Links | iOS | https URL，已验证，应用优先 |
| App Links | Android | https URL，已验证，应用优先 |
| Custom Scheme | 双端 | myapp://，回退 / 内部使用 |
| Deferred Deep Link | 双端 | 未安装→安装后目的地 |

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

### 2-4. 中央路由器模式 (解析、校验、鉴权返回)
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

## 3. 常见错误
- ❌ 将自定义 scheme(`myapp://`)作为主路径使用 → 可能被其他应用劫持。应优先使用经过验证的 https 链接。
- ❌ 未校验即使用深度链接参数(id、token)→ 权限提升、钓鱼风险。
- ❌ 用外部输入加载任意 webview URL → 暴露于钓鱼页面。
- ❌ 鉴权所需界面缺少登录守卫 → 未登录即可访问。
- ❌ 未配置延迟深度链接 → 未安装应用的用户在安装后无法到达目的地。

## 4. 检查清单
- [ ] 是否将主路径实现为 Universal Links / App Links(经过验证的 https)
- [ ] 自定义 scheme 是否仅作为回退使用
- [ ] 是否在中央路由器中解析与校验深度链接路由
- [ ] 是否在使用前校验深度链接参数(id、token)
- [ ] 是否在鉴权所需界面应用了登录守卫 + 返回原目的地
- [ ] 是否为未安装应用的用户配置了延迟深度链接
- [ ] 是否避免用外部输入加载任意 webview URL
