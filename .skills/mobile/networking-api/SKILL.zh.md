---
name: 移动端网络/API 通信标准
description: 用于以同一心智模型处理 iOS URLSession + async/await 与 Android Retrofit + Coroutine 的指南。在统一通用 DTO 约定·错误处理·认证令牌刷新·超时·重试·环境分离·日志安全时阅读。关键词: ktor, retrofit, okhttp, URLSession, @GET, @POST, HttpClient, async/await。
rules:
  - "网络层用 iOS URLSession · Android Retrofit 分层。"
  - "将服务器 DTO 与领域模型分离并映射。"
  - "定义通用错误响应格式，在两个平台上同样处理。"
  - "401 响应时刷新令牌并重试原请求。"
  - "统一超时与重试规则。"
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

# 🌐 移动端网络/API 通信标准

> 由于两个应用调用同一后端，DTO 字段名·错误格式·请求头约定在两端必须一致。不要只把一端改成驼峰命名。在设计 API 层，或决定认证/错误/重试策略时阅读。

## 1. 核心原则
- 网络层用 iOS URLSession · Android Retrofit 分层。
- 将服务器 DTO 与领域模型分离并映射。
- 定义通用错误响应格式，在两个平台上同样处理。
- 401 响应时刷新令牌并重试原请求。
- 统一超时与重试规则。

## 2. 规则

### 2-1. 分层结构 (两个平台通用)
```
[ View ] → [ ViewModel ] → [ Repository ] → [ Service/ApiClient ] → [ HTTP ]
                                ↓
                          DTO ↔ Domain Model 转换
```
- Service/ApiClient: 纯 HTTP。不了解领域。
- Repository: 将 DTO 转换为领域模型。决定缓存策略。是 ViewModel 调用的唯一通道。
- ViewModel: 只调用 Repository。不得直接调用 URLSession/Retrofit。

### 2-2. DTO 与领域模型分离
若屏幕直接使用服务器响应，服务器一变更屏幕就立刻崩坏。务必将两者分开。

通用约定: 服务器 JSON 字段 `snake_case` / 客户端模型 `camelCase` / 日期 ISO 8601(`2026-05-11T09:00:00Z`) / 可空字段在模型中也为可选。

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

### 2-3. 通用错误响应格式
与后端约定以下格式:
```json
{ "code": "AUTH_EXPIRED", "message": "세션이 만료되었습니다." }
```

```swift
// ✅ iOS
enum APIError: Error {
    case network                // 网络断开、超时
    case unauthorized           // 401 → 触发令牌重新签发
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

ViewModel 按上述类型分支来决定向用户展示的消息。不要把 HTTP status code 暴露给 ViewModel。

### 2-4. 认证令牌自动附加 + 刷新
```swift
// ✅ iOS — Interceptor 模式
final class APIClient {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        var request = endpoint.urlRequest()
        if let token = TokenStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        if (response as? HTTPURLResponse)?.statusCode == 401 {
            try await TokenStore.shared.refresh()
            return try await self.request(endpoint)  // 重试 1 次
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

// 401 自动刷新
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization-Retry") != null) return null  // 防止无限循环
        val newToken = runBlocking { tokenStore.refresh() } ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header("Authorization-Retry", "true")
            .build()
    }
}
```

> ⚠️ 刷新期间若多个并发请求进来，会发生把令牌刷新 N 次的事故。用 Mutex 串行化，使其只刷新一次。

### 2-5. 超时与重试
| 项目 | 推荐值 |
|------|--------|
| connect timeout | 10 秒 |
| read timeout | 20 秒 |
| 幂等(GET)自动重试 | 最多 2 次，指数退避 (500ms → 1500ms) |
| 非幂等(POST/PUT) | 禁止重试(仅由用户操作触发) |

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

### 2-6. 环境分离 (dev / staging / prod)
- iOS: 用 `.xcconfig` 文件注入 `API_BASE_URL`，在 Info.plist 中引用。
- Android: 在 `build.gradle.kts` 的 `buildTypes` / `productFlavors` 中注入 `BuildConfig.API_BASE_URL`。
- 绝对禁止在源代码中硬编码 prod URL。

### 2-7. 日志与安全
- 仅在调试构建中输出请求/响应正文日志。发布版中绝对禁止记录令牌·个人信息。
- iOS: `#if DEBUG` 守卫、Android: `BuildConfig.DEBUG` 守卫 + 发布版 OkHttp `HttpLoggingInterceptor.Level.NONE`。
- 强制 HTTPS: 保持 iOS App Transport Security 默认值，Android `networkSecurityConfig` 中禁止允许 cleartext。
- 认证令牌必须放入安全存储(iOS Keychain / Android EncryptedSharedPreferences)。禁止在 UserDefaults / SharedPreferences 中明文存储。

## 3. 常见错误
- ❌ 在 ViewModel 中直接调用 `URLSession.shared.data(...)`。
- ❌ 屏幕直接使用 DTO。
- ❌ 收到 401 时不刷新令牌就直接弹回登录屏幕(用户输入丢失)。
- ❌ POST 失败时自动重试 → 重复支付之类的事故。
- ❌ 用 `try?` 吞掉错误 → 用户只能看到「为什么不行」。

## 4. 检查清单
- [ ] ViewModel 是否只调用 Repository 而不直接调用 HTTP 客户端
- [ ] 是否将 DTO 与领域模型分离并映射
- [ ] 是否定义了通用错误格式且未把 status code 暴露给 ViewModel
- [ ] 401 时是否刷新令牌、只重试一次，并串行化并发刷新
- [ ] 是否统一了超时与重试(仅重试 GET)规则
- [ ] 是否在不硬编码 prod URL 的情况下分离了环境
- [ ] 是否关闭发布版日志并将令牌存入安全存储
