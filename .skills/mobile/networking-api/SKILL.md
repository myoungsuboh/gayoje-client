---
name: 모바일 네트워킹/API 통신 표준
description: iOS URLSession + async/await와 Android Retrofit + Coroutine을 같은 멘탈 모델로 다루는 가이드. 공통 DTO 규약·에러 처리·인증 토큰 갱신·타임아웃·재시도·환경 분리·로깅 보안을 통일할 때 읽는다. 키워드: ktor, retrofit, okhttp, URLSession, @GET, @POST, HttpClient, async/await.
rules:
  - "네트워킹은 iOS URLSession · Android Retrofit으로 계층을 분리한다."
  - "서버 DTO와 도메인 모델을 분리해 매핑한다."
  - "공통 에러 응답 포맷을 정의해 양 플랫폼에서 동일하게 처리한다."
  - "401 응답 시 토큰을 갱신하고 원요청을 재시도한다."
  - "타임아웃과 재시도 규칙을 통일한다."
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

# 🌐 모바일 네트워킹/API 통신 표준

> 두 앱이 같은 백엔드를 호출하므로 DTO 필드명·에러 포맷·헤더 규약은 양쪽에서 동일해야 한다. 한쪽만 카멜케이스로 바꾸지 않는다. API 계층을 설계하거나 인증/에러/재시도 정책을 정할 때 읽는다.

## 1. 핵심 원칙
- 네트워킹은 iOS URLSession · Android Retrofit으로 계층을 분리한다.
- 서버 DTO와 도메인 모델을 분리해 매핑한다.
- 공통 에러 응답 포맷을 정의해 양 플랫폼에서 동일하게 처리한다.
- 401 응답 시 토큰을 갱신하고 원요청을 재시도한다.
- 타임아웃과 재시도 규칙을 통일한다.

## 2. 규칙

### 2-1. 계층 구조 (양 플랫폼 공통)
```
[ View ] → [ ViewModel ] → [ Repository ] → [ Service/ApiClient ] → [ HTTP ]
                                ↓
                          DTO ↔ Domain Model 변환
```
- Service/ApiClient: 순수 HTTP. 도메인을 모른다.
- Repository: DTO를 도메인 모델로 변환. 캐시 정책 결정. ViewModel이 호출하는 유일한 통로.
- ViewModel: Repository만 호출한다. URLSession/Retrofit을 직접 부르면 안 된다.

### 2-2. DTO와 도메인 모델 분리
서버 응답 그대로 화면이 쓰면 서버 변경에 화면이 즉시 깨진다. 반드시 둘을 나눈다.

공통 규약: 서버 JSON 필드 `snake_case` / 클라이언트 모델 `camelCase` / 날짜 ISO 8601(`2026-05-11T09:00:00Z`) / null 가능 필드는 모델에서도 옵셔널.

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

### 2-3. 공통 에러 응답 포맷
백엔드와 다음 포맷을 합의한다:
```json
{ "code": "AUTH_EXPIRED", "message": "세션이 만료되었습니다." }
```

```swift
// ✅ iOS
enum APIError: Error {
    case network                // 네트워크 끊김, 타임아웃
    case unauthorized           // 401 → 토큰 재발급 트리거
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

ViewModel은 위 타입으로 분기해 사용자에게 보여줄 메시지를 결정한다. HTTP status code를 ViewModel에 노출하지 않는다.

### 2-4. 인증 토큰 자동 첨부 + 갱신
```swift
// ✅ iOS — Interceptor 패턴
final class APIClient {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        var request = endpoint.urlRequest()
        if let token = TokenStore.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        if (response as? HTTPURLResponse)?.statusCode == 401 {
            try await TokenStore.shared.refresh()
            return try await self.request(endpoint)  // 1회 재시도
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

// 401 자동 갱신
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization-Retry") != null) return null  // 무한루프 방지
        val newToken = runBlocking { tokenStore.refresh() } ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header("Authorization-Retry", "true")
            .build()
    }
}
```

> ⚠️ 갱신 중 동시 요청이 여러 개 들어오면 토큰을 N번 갱신하는 사고가 난다. Mutex로 한 번만 갱신되도록 직렬화한다.

### 2-5. 타임아웃과 재시도
| 항목 | 권장값 |
|------|--------|
| connect timeout | 10초 |
| read timeout | 20초 |
| 멱등(GET) 자동 재시도 | 최대 2회, 지수백오프 (500ms → 1500ms) |
| 비멱등(POST/PUT) | 재시도 금지 (사용자 동작으로만) |

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

### 2-6. 환경 분리 (dev / staging / prod)
- iOS: `.xcconfig` 파일로 `API_BASE_URL` 주입, Info.plist에서 참조.
- Android: `build.gradle.kts`의 `buildTypes` / `productFlavors`에서 `BuildConfig.API_BASE_URL` 주입.
- 절대 소스코드에 prod URL 하드코딩 금지.

### 2-7. 로깅과 보안
- 디버그 빌드에서만 요청/응답 본문 로그 출력. 릴리즈에서는 절대 토큰·개인정보 로깅 금지.
- iOS: `#if DEBUG` 가드, Android: `BuildConfig.DEBUG` 가드 + 릴리즈 OkHttp `HttpLoggingInterceptor.Level.NONE`.
- HTTPS 강제: iOS App Transport Security 기본값 유지, Android `networkSecurityConfig`에 cleartext 허용 금지.
- 인증 토큰은 반드시 보안 저장소(iOS Keychain / Android EncryptedSharedPreferences)에. UserDefaults / SharedPreferences 평문 저장 금지.

## 3. 흔한 실수
- ❌ ViewModel에서 `URLSession.shared.data(...)` 직접 호출.
- ❌ DTO를 화면이 그대로 사용.
- ❌ 401 받았을 때 토큰 갱신 없이 그냥 로그인 화면으로 튕김 (사용자 입력 날아감).
- ❌ POST 실패 시 자동 재시도 → 중복 결제 같은 사고.
- ❌ 에러를 `try?`로 삼키기 → 사용자는 "왜 안 되지"만 보게 됨.

## 4. 체크리스트
- [ ] ViewModel이 Repository만 호출하고 HTTP 클라이언트를 직접 부르지 않는가
- [ ] DTO와 도메인 모델을 분리해 매핑했는가
- [ ] 공통 에러 포맷을 정의하고 status code를 ViewModel에 노출하지 않았는가
- [ ] 401 시 토큰을 갱신하고 1회만 재시도하며 동시 갱신을 직렬화했는가
- [ ] 타임아웃과 재시도(GET만 재시도) 규칙을 통일했는가
- [ ] prod URL 하드코딩 없이 환경을 분리했는가
- [ ] 릴리즈 로깅을 끄고 토큰을 보안 저장소에 저장했는가
