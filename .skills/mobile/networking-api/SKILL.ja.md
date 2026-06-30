---
name: モバイルネットワーキング/API通信標準
description: iOS URLSession + async/awaitとAndroid Retrofit + Coroutineを同じメンタルモデルで扱うガイド。共通DTO規約・エラー処理・認証トークン更新・タイムアウト・リトライ・環境分離・ロギングセキュリティを統一するときに読む。キーワード: ktor, retrofit, okhttp, URLSession, @GET, @POST, HttpClient, async/await。
rules:
  - "ネットワーキングはiOS URLSession · Android Retrofitで層を分離する。"
  - "サーバーDTOとドメインモデルを分離してマッピングする。"
  - "共通エラーレスポンスフォーマットを定義し、両プラットフォームで同一に処理する。"
  - "401レスポンス時にトークンを更新し、元のリクエストをリトライする。"
  - "タイムアウトとリトライのルールを統一する。"
tags:
  - "ktor"
  - "retrofit"
  - "okhttp"
  - "URLSession"
  - "@GET"
  - "@POST"
  - "HttpClient"
  - "async/await"
---

# 🌐 モバイルネットワーキング/API通信標準

> 2つのアプリが同じバックエンドを呼び出すため、DTOフィールド名・エラーフォーマット・ヘッダー規約は両側で同一でなければならない。片側だけキャメルケースに変えないこと。API層を設計したり、認証/エラー/リトライポリシーを決めるときに読む。

## 1. コア原則
- ネットワーキングはiOS URLSession · Android Retrofitで層を分離する。
- サーバーDTOとドメインモデルを分離してマッピングする。
- 共通エラーレスポンスフォーマットを定義し、両プラットフォームで同一に処理する。
- 401レスポンス時にトークンを更新し、元のリクエストをリトライする。
- タイムアウトとリトライのルールを統一する。

## 2. ルール

### 2-1. 層構造 (両プラットフォーム共通)
```
[ View ] → [ ViewModel ] → [ Repository ] → [ Service/ApiClient ] → [ HTTP ]
                                ↓
                          DTO ↔ Domain Model 変換
```
- Service/ApiClient: 純粋なHTTP。ドメインを知らない。
- Repository: DTOをドメインモデルに変換。キャッシュポリシーを決定。ViewModelが呼び出す唯一の通路。
- ViewModel: Repositoryのみを呼び出す。URLSession/Retrofitを直接呼んではいけない。

### 2-2. DTOとドメインモデルの分離
サーバーレスポンスをそのまま画面が使うと、サーバー変更で画面が即座に壊れる。必ず両者を分ける。

共通規約: サーバーJSONフィールド`snake_case` / クライアントモデル`camelCase` / 日付ISO 8601(`2026-05-11T09:00:00Z`) / null可能フィールドはモデルでもオプショナル。

```swift
// ✅ iOS
struct ItemDto: Codable {
    let itemId: String
    let itemName: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case itemName = "item_name"
        case createdAt = "created_at"
    }
}

struct Item: Identifiable, Hashable {
    let id: String
    let name: String
    let createdAt: Date
}

extension ItemDto {
    func toDomain() -> Item {
        Item(id: itemId, name: itemName, createdAt: createdAt)
    }
}
```

```kotlin
// ✅ Android
data class ItemDto(
    @SerializedName("item_id") val itemId: String,
    @SerializedName("item_name") val itemName: String,
    @SerializedName("created_at") val createdAt: String
)

data class Item(val id: String, val name: String, val createdAt: Instant)

fun ItemDto.toDomain() = Item(
    id = itemId,
    name = itemName,
    createdAt = Instant.parse(createdAt)
)
```

### 2-3. 共通エラーレスポンスフォーマット
バックエンドと次のフォーマットを合意する:
```json
{ "code": "AUTH_EXPIRED", "message": "세션이 만료되었습니다." }
```

```swift
// ✅ iOS
enum APIError: Error {
    case network                // ネットワーク切断、タイムアウト
    case unauthorized           // 401 → トークン再発行トリガー
    case server(code: String, message: String)
    case decoding
    case unknown
}
```

```kotlin
// ✅ Android
sealed class ApiError : Throwable() {
    object Network : ApiError()
    object Unauthorized : ApiError()
    data class Server(val code: String, override val message: String) : ApiError()
    object Decoding : ApiError()
    object Unknown : ApiError()
}
```

ViewModelは上記の型で分岐してユーザーに表示するメッセージを決定する。HTTP status codeをViewModelに公開しない。

### 2-4. 認証トークン自動添付 + 更新
```swift
// ✅ iOS — Interceptorパターン
final class APIClient {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        var request = endpoint.urlRequest()
        if let token = TokenStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        if (response as? HTTPURLResponse)?.statusCode == 401 {
            try await TokenStore.shared.refresh()
            return try await self.request(endpoint)  // 1回リトライ
        }
        return try JSONDecoder.api.decode(T.self, from: data)
    }
}
```

```kotlin
// ✅ Android — OkHttp Interceptor + Authenticator
class AuthInterceptor @Inject constructor(
    private val tokenStore: TokenStore
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenStore.accessToken ?: return chain.proceed(chain.request())
        val req = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        return chain.proceed(req)
    }
}

// 401自動更新
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization-Retry") != null) return null  // 無限ループ防止
        val newToken = runBlocking { tokenStore.refresh() } ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header("Authorization-Retry", "true")
            .build()
    }
}
```

> ⚠️ 更新中に同時リクエストが複数入ってくるとトークンをN回更新する事故が起きる。Mutexで一度だけ更新されるよう直列化する。

### 2-5. タイムアウトとリトライ
| 項目 | 推奨値 |
|------|--------|
| connect timeout | 10秒 |
| read timeout | 20秒 |
| 冪等(GET)自動リトライ | 最大2回、指数バックオフ (500ms → 1500ms) |
| 非冪等(POST/PUT) | リトライ禁止(ユーザー操作のみで) |

```swift
// ✅ iOS
let config = URLSessionConfiguration.default
config.timeoutIntervalForRequest = 20
config.timeoutIntervalForResource = 60
let session = URLSession(configuration: config)
```

```kotlin
// ✅ Android
OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .build()
```

### 2-6. 環境分離 (dev / staging / prod)
- iOS: `.xcconfig`ファイルで`API_BASE_URL`を注入、Info.plistから参照。
- Android: `build.gradle.kts`の`buildTypes` / `productFlavors`で`BuildConfig.API_BASE_URL`を注入。
- ソースコードにprod URLを絶対にハードコーディング禁止。

### 2-7. ロギングとセキュリティ
- デバッグビルドでのみリクエスト/レスポンス本文のログを出力。リリースでは絶対にトークン・個人情報のロギング禁止。
- iOS: `#if DEBUG`ガード、Android: `BuildConfig.DEBUG`ガード + リリースOkHttp `HttpLoggingInterceptor.Level.NONE`。
- HTTPS強制: iOS App Transport Securityのデフォルト値を維持、Android `networkSecurityConfig`でcleartext許可禁止。
- 認証トークンは必ずセキュアストレージ(iOS Keychain / Android EncryptedSharedPreferences)に。UserDefaults / SharedPreferencesの平文保存禁止。

## 3. よくあるミス
- ❌ ViewModelで`URLSession.shared.data(...)`を直接呼び出し。
- ❌ DTOを画面がそのまま使用。
- ❌ 401を受け取ったときトークン更新なしにそのままログイン画面に飛ばす(ユーザー入力が飛ぶ)。
- ❌ POST失敗時に自動リトライ → 二重決済のような事故。
- ❌ エラーを`try?`で握りつぶす → ユーザーは「なぜできないのか」だけを見ることになる。

## 4. チェックリスト
- [ ] ViewModelがRepositoryのみを呼び出し、HTTPクライアントを直接呼んでいないか
- [ ] DTOとドメインモデルを分離してマッピングしたか
- [ ] 共通エラーフォーマットを定義し、status codeをViewModelに公開していないか
- [ ] 401時にトークンを更新し、1回だけリトライし、同時更新を直列化したか
- [ ] タイムアウトとリトライ(GETのみリトライ)のルールを統一したか
- [ ] prod URLのハードコーディングなしに環境を分離したか
- [ ] リリースロギングをオフにし、トークンをセキュアストレージに保存したか
