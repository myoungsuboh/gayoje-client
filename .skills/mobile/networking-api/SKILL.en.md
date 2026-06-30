---
name: Mobile Networking/API Communication Standards
description: A guide for handling iOS URLSession + async/await and Android Retrofit + Coroutine with the same mental model. Read it when unifying common DTO conventions, error handling, auth token refresh, timeouts, retries, environment separation, and logging security. Keywords: ktor, retrofit, okhttp, URLSession, @GET, @POST, HttpClient, async/await.
rules:
  - "Separate the networking layer with iOS URLSession · Android Retrofit."
  - "Separate server DTOs from domain models and map between them."
  - "Define a common error response format and handle it identically on both platforms."
  - "On a 401 response, refresh the token and retry the original request."
  - "Unify timeout and retry rules."
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

# 🌐 Mobile Networking/API Communication Standards

> Since both apps call the same backend, the DTO field names, error format, and header conventions must be identical on both sides. Don't change just one side to camelCase. Read this when designing the API layer or deciding on auth/error/retry policies.

## 1. Core Principles
- Separate the networking layer with iOS URLSession · Android Retrofit.
- Separate server DTOs from domain models and map between them.
- Define a common error response format and handle it identically on both platforms.
- On a 401 response, refresh the token and retry the original request.
- Unify timeout and retry rules.

## 2. Rules

### 2-1. Layer Structure (common to both platforms)
```
[ View ] → [ ViewModel ] → [ Repository ] → [ Service/ApiClient ] → [ HTTP ]
                                ↓
                          DTO ↔ Domain Model conversion
```
- Service/ApiClient: pure HTTP. Knows nothing about the domain.
- Repository: converts DTOs into domain models. Decides cache policy. The only channel the ViewModel calls.
- ViewModel: only calls the Repository. Must not call URLSession/Retrofit directly.

### 2-2. Separate DTOs from Domain Models
If the screen uses the server response as-is, the screen breaks immediately on server changes. Always split the two.

Common convention: server JSON fields `snake_case` / client models `camelCase` / dates ISO 8601 (`2026-05-11T09:00:00Z`) / nullable fields are also optional in the model.

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

### 2-3. Common Error Response Format
Agree on the following format with the backend:
```json
{ "code": "AUTH_EXPIRED", "message": "세션이 만료되었습니다." }
```

```swift
// ✅ iOS
enum APIError: Error {
    case network                // network drop, timeout
    case unauthorized           // 401 → triggers token reissue
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

The ViewModel branches on the above types to decide the message to show the user. Do not expose the HTTP status code to the ViewModel.

### 2-4. Auto-Attach + Refresh Auth Token
```swift
// ✅ iOS — Interceptor pattern
final class APIClient {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        var request = endpoint.urlRequest()
        if let token = TokenStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        if (response as? HTTPURLResponse)?.statusCode == 401 {
            try await TokenStore.shared.refresh()
            return try await self.request(endpoint)  // retry once
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

// 401 auto-refresh
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization-Retry") != null) return null  // prevent infinite loop
        val newToken = runBlocking { tokenStore.refresh() } ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header("Authorization-Retry", "true")
            .build()
    }
}
```

> ⚠️ If multiple requests come in concurrently during refresh, you get the accident of refreshing the token N times. Serialize it with a Mutex so it refreshes only once.

### 2-5. Timeouts and Retries
| Item | Recommended value |
|------|--------|
| connect timeout | 10s |
| read timeout | 20s |
| idempotent (GET) auto-retry | up to 2 times, exponential backoff (500ms → 1500ms) |
| non-idempotent (POST/PUT) | no retry (only by user action) |

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

### 2-6. Environment Separation (dev / staging / prod)
- iOS: inject `API_BASE_URL` via an `.xcconfig` file, referenced in Info.plist.
- Android: inject `BuildConfig.API_BASE_URL` from `buildTypes` / `productFlavors` in `build.gradle.kts`.
- Never hardcode a prod URL in source code.

### 2-7. Logging and Security
- Output request/response body logs only in debug builds. Never log tokens or personal info in release.
- iOS: `#if DEBUG` guard, Android: `BuildConfig.DEBUG` guard + release OkHttp `HttpLoggingInterceptor.Level.NONE`.
- Enforce HTTPS: keep iOS App Transport Security defaults, do not allow cleartext in Android `networkSecurityConfig`.
- Auth tokens must go into secure storage (iOS Keychain / Android EncryptedSharedPreferences). No plaintext storage in UserDefaults / SharedPreferences.

## 3. Common Mistakes
- ❌ Calling `URLSession.shared.data(...)` directly in the ViewModel.
- ❌ The screen using the DTO as-is.
- ❌ On a 401, bouncing straight to the login screen without a token refresh (user input is lost).
- ❌ Auto-retrying on POST failure → accidents like duplicate payments.
- ❌ Swallowing errors with `try?` → the user only sees "why isn't this working".

## 4. Checklist
- [ ] Does the ViewModel call only the Repository and not the HTTP client directly?
- [ ] Did you separate DTOs from domain models and map between them?
- [ ] Did you define a common error format and avoid exposing status codes to the ViewModel?
- [ ] On a 401, did you refresh the token, retry only once, and serialize concurrent refreshes?
- [ ] Did you unify timeout and retry rules (retry GET only)?
- [ ] Did you separate environments without hardcoding the prod URL?
- [ ] Did you turn off release logging and store tokens in secure storage?
