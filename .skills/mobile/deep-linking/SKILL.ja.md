---
name: ディープリンク & ユニバーサルリンク (Deep Linking)
description: モバイルのディープリンク、ユニバーサルリンク(iOS)・アプリリンク(Android)、ディファードディープリンク設定の標準。外部URLからアプリの特定画面へ遷移する経路を作る、またはディープリンクのルーティング・検証を定める際に読む。キーワード: deep-link, universal-link, app-link, url-scheme, deferred-deeplink, routing, applinks, assetlinks.
rules:
  - "外部URLからアプリの特定画面へ遷移する経路はUniversal Links(iOS)・App Links(Android)で実装し、ブラウザを経由せずにアプリを開く。"
  - "カスタムURLスキーム(myapp://)はフォールバックとしてのみ使用し、検証可能なhttpsリンクを優先する。"
  - "ディープリンクのルーティングは中央ルーターでパース・検証し、認証が必要な経路はログイン後に元の目的地へ復帰させる。"
  - "アプリ未インストールのユーザー向けにディファードディープリンク(インストール後に目的地へ遷移)を設定する。"
  - "ディープリンクのパラメータは信頼せず検証する — 悪意あるリンクによる権限昇格・フィッシングを防止する。"
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

# 🔗 ディープリンク & ユニバーサルリンク

> 外部URLから検証済みhttpsリンクでアプリの特定画面へ遷移する。ディープリンク経路を作る、またはルーティング・認証復帰・パラメータ検証を定める際に読む。

## 1. 中核原則
- 外部URLからアプリの特定画面へ遷移する経路は**Universal Links(iOS)・App Links(Android)**で実装し、ブラウザを経由せずにアプリを開く。
- カスタムURLスキーム(`myapp://`)は**フォールバックとしてのみ**使用し、検証可能なhttpsリンクを優先する。
- ディープリンクのルーティングは**中央ルーターでパース・検証**し、認証が必要な経路はログイン後に元の目的地へ復帰させる。
- アプリ未インストールのユーザー向けに**ディファードディープリンク**(インストール後に目的地へ遷移)を設定する。
- ディープリンクのパラメータは**信頼せず検証**する — 悪意あるリンクによる権限昇格・フィッシングを防止する。

## 2. ルール

### 2-1. リンク種別の比較
| 種別 | プラットフォーム | 特徴 |
|------|--------|------|
| Universal Links | iOS | https URL、検証済み、アプリ優先 |
| App Links | Android | https URL、検証済み、アプリ優先 |
| Custom Scheme | 両方 | myapp://、フォールバック・内部用 |
| Deferred Deep Link | 両方 | 未インストール→インストール後の目的地 |

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

### 2-4. 中央ルーターパターン (パース・検証・認証復帰)
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

## 3. よくある失敗
- ❌ カスタムスキーム(`myapp://`)を主経路として使用 → 他のアプリに横取りされ得る。検証済みhttpsリンクを優先する。
- ❌ ディープリンクのパラメータ(id・token)を検証せずに使用 → 権限昇格・フィッシングのリスク。
- ❌ 外部入力で任意のWebViewのURLをロード → フィッシングページに露出。
- ❌ 認証が必要な画面にログインガードが欠落 → 未ログインでのアクセスが可能。
- ❌ ディファードディープリンク未設定 → アプリ未インストールのユーザーがインストール後に目的地へ到達できない。

## 4. チェックリスト
- [ ] 主経路をUniversal Links / App Links(検証済みhttps)で実装したか
- [ ] カスタムスキームはフォールバックとしてのみ使用しているか
- [ ] ディープリンクのルーティングを中央ルーターでパース・検証しているか
- [ ] ディープリンクのパラメータ(id・token)を検証してから使用しているか
- [ ] 認証が必要な画面にログインガード + 元の目的地への復帰を適用したか
- [ ] 未インストールのユーザー向けにディファードディープリンクを設定したか
- [ ] 外部入力で任意のWebViewのURLをロードしていないか
