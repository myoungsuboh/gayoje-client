---
name: 모바일 테스트/디버깅 가이드
description: ViewModel 단위 테스트, UI 스냅샷/인스트루먼트 테스트, 네트워크 모킹, 실기기 디버깅을 iOS/Android 양쪽으로 정리한 표준. 테스트를 새로 짜거나 CI 셋을 정할 때, 크래시·회귀를 디버깅할 때 읽는다. 바이브 코딩에서도 ViewModel 단위 테스트는 필수. 키워드: junit, XCTest, espresso, @Test, assertEquals, XCAssert, mockk, Mockito, MockWebServer, Crashlytics.
rules:
  - "비즈니스 로직은 단위 테스트로, UI는 스냅샷·컴포넌트 테스트로 검증한다."
  - "핵심 플로우만 UI 자동화 테스트로 다룬다 (양은 적게, Happy path 위주)."
  - "네트워크·시간 의존은 모킹해 결정적(deterministic)으로 만든다."
  - "크래시는 디바이스 로그(Logcat·Console)로 스택을 확인한다."
  - "릴리즈 빌드는 난독화 매핑 파일(dSYM·Mapping)로 스택을 복원한다."
tags:
  - "junit"
  - "XCTest"
  - "espresso"
  - "@Test"
  - "assertEquals"
  - "XCAssert"
  - "mockk"
  - "Mockito"
  - "MockWebServer"
  - "Crashlytics"
---

# 🧪 모바일 테스트/디버깅 가이드

> 화면은 손으로 확인할 수 있지만 ViewModel 로직은 단위 테스트가 유일한 안전장치다. 비동기 + 상태 머신이라 회귀가 쉽게 난다. 테스트를 짜거나 크래시를 디버깅할 때 읽는다.

## 1. 핵심 원칙

- 비즈니스 로직은 단위 테스트로, UI는 스냅샷·컴포넌트 테스트로 검증한다.
- 핵심 플로우만 UI 자동화 테스트로 다룬다 (양은 적게, Happy path 위주).
- 네트워크·시간 의존은 모킹해 결정적(deterministic)으로 만든다.
- 크래시는 디바이스 로그(Logcat·Console)로 스택을 확인한다.
- 릴리즈 빌드는 난독화 매핑 파일(dSYM·Mapping)로 스택을 복원한다.

## 2. 규칙

### 2-1. 테스트 피라미드 (모바일 버전)

```
       /\
      /UI\           느림, 적게 (Happy path 1~2개씩)
     /----\
    / Comp \         컴포넌트 / 통합 — 중간
   /--------\
  /  Unit    \       빠름, 많이 — ViewModel/Repository 중심
 /------------\
```

비율 권장: Unit 70% / Component 20% / E2E UI 10%.

### 2-2. ViewModel 단위 테스트 (최우선)

```swift
// iOS — XCTest + Swift Concurrency
@MainActor
final class HomeViewModelTests: XCTestCase {
    func test_fetch_success_setsItems() async throws {
        let fakeRepo = FakeItemRepository(items: [.stub(id: "1"), .stub(id: "2")])
        let vm = HomeViewModel(repository: fakeRepo)

        await vm.fetch()

        XCTAssertEqual(vm.state.items.count, 2)
        XCTAssertFalse(vm.state.isLoading)
        XCTAssertNil(vm.state.errorMessage)
    }

    func test_fetch_failure_setsErrorMessage() async {
        let vm = HomeViewModel(repository: FailingRepository())
        await vm.fetch()
        XCTAssertNotNil(vm.state.errorMessage)
    }
}

// Fake — protocol로 추상화해두면 만들기 쉬움
final class FakeItemRepository: ItemRepository {
    let items: [Item]
    func getItems() async throws -> [Item] { items }
}
```

```kotlin
// Android — JUnit + Turbine + MockK
@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun `fetch success sets items`() = runTest {
        val repo = mockk<ItemRepository> {
            coEvery { getItems() } returns listOf(Item("1", "a", Instant.now()))
        }
        val vm = HomeViewModel(repo)

        vm.state.test {
            assertEquals(emptyList<Item>(), awaitItem().items)   // 초기
            vm.fetch()
            advanceUntilIdle()
            assertEquals(1, awaitItem().items.size)
        }
    }
}
```

핵심 규칙:
- ViewModel은 인터페이스(Protocol/abstract)로 의존성을 받는다. 그래야 Fake로 갈아끼울 수 있다.
- 시간/난수/현재 시각 같은 비결정성은 주입받아라 (`Clock`, `Random`).

### 2-3. 네트워크 모킹

```swift
// iOS — URLProtocol 가로채기 또는 Protocol 추상화
protocol APIClientProtocol {
    func getItems() async throws -> [ItemDto]
}
// 테스트에서는 Mock 구현체 주입
```

```kotlin
// Android — MockWebServer (Retrofit 가장 깔끔)
val server = MockWebServer().apply { start() }
server.enqueue(MockResponse().setBody("""[{"item_id":"1","item_name":"a"}]"""))

val api = Retrofit.Builder()
    .baseUrl(server.url("/"))
    .addConverterFactory(GsonConverterFactory.create())
    .build()
    .create(ApiService::class.java)

val result = api.getItems()
assertEquals("1", result.first().itemId)
```

### 2-4. UI 테스트 (양은 적게, 핵심 흐름만)

```swift
// iOS — XCUITest
func test_login_flow() {
    let app = XCUIApplication()
    app.launch()
    app.textFields["id_email"].tap()
    app.textFields["id_email"].typeText("test@example.com")
    app.secureTextFields["id_password"].typeText("Test1234!")
    app.buttons["btn_login"].tap()
    XCTAssertTrue(app.staticTexts["screen_home_title"].waitForExistence(timeout: 5))
}
```

```kotlin
// Android — Compose UI Test
@get:Rule val rule = createAndroidComposeRule<MainActivity>()

@Test
fun login_flow() {
    rule.onNodeWithTag("id_email").performTextInput("test@example.com")
    rule.onNodeWithTag("id_password").performTextInput("Test1234!")
    rule.onNodeWithTag("btn_login").performClick()
    rule.onNodeWithTag("screen_home_title").assertIsDisplayed()
}
```

> ⚠️ 접근성 식별자(accessibilityIdentifier / Modifier.testTag)를 모든 인터랙티브 요소에 붙여라. 텍스트 매칭은 다국어/디자인 변경에 약하다.

### 2-5. 스냅샷 테스트 (UI 회귀 방지)

- iOS: [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
- Android: [Paparazzi](https://github.com/cashapp/paparazzi) (에뮬레이터 없이 JVM에서 실행)

디자인 시스템 컴포넌트 / 핵심 화면 위주로 30~50장이면 충분.

### 2-6. 디버깅 도구

| 목적 | iOS | Android |
|------|-----|---------|
| 네트워크 인스펙터 | Charles / Proxyman / Instruments Network | Charles / Chucker (라이브러리) |
| 메모리/CPU | Xcode Instruments | Android Studio Profiler |
| 레이아웃 검사 | View Debugger | Layout Inspector |
| 강제 다크/접근성 | Environment Overrides | Developer Options → Force Dark |
| 느린 애니메이션 확인 | Simulator → Slow Animations | Developer Options → Animation 0.5x |
| 로그 | `print` / `os_log` / Console.app | `Log.d` / Logcat |

```swift
// iOS — 릴리즈 빌드 로깅
#if DEBUG
print("...")
#endif
```
```kotlin
// Android
if (BuildConfig.DEBUG) Log.d("Tag", "...")
```

릴리즈에서 토큰/개인정보 로그 금지. Timber로 빌드 타입별 Tree 설정 추천.

### 2-7. 크래시 리포팅

- 출시 전에 무조건 도입. 안 그러면 사용자 1만 명이 크래시 나도 모른다.
- 추천: Firebase Crashlytics (양 플랫폼 공통).
- iOS는 dSYM 업로드 자동화 필수(Xcode Build Phase 또는 Fastlane).
- Android는 Mapping File 업로드(`crashlyticsUploadMappingFileRelease`).

### 2-8. 실기기 디버깅

```
# iOS
- Xcode → Window → Devices and Simulators → 기기 선택 → Console 로 실시간 로그
- Safari → 개발자 메뉴 → 기기 선택 으로 WebView 디버깅

# Android
- adb logcat 또는 Android Studio Logcat
- adb shell input text / adb shell screencap 등 자동화 명령 다수
- Chrome chrome://inspect 로 WebView 디버깅
```

### 2-9. CI에서 돌릴 최소 셋

- Unit test (ViewModel + Repository) — PR마다 항상.
- Lint (SwiftLint / ktlint, detekt).
- Static analysis (Xcode Analyze / Android Lint).
- 빌드 가능 여부 (Debug 빌드만 PR, Release 빌드는 main merge 시).
- UI 테스트는 nightly 또는 release 전.

## 3. 흔한 실수

- ❌ ViewModel을 Activity/UIViewController 의존으로 만들어 테스트 불가능.
- ❌ 모든 화면에 UI 테스트 작성 (느림 + 깨지기 쉬움).
- ❌ 실제 서버를 향한 통합 테스트를 CI에서 매번 실행 → Flaky.
- ❌ 릴리즈 빌드에 디버그 로그/네트워크 인스펙터가 살아있음.
- ❌ 크래시 리포팅 없이 출시.

## 4. 체크리스트

- [ ] ViewModel/Repository 로직을 단위 테스트로 덮었는가 (Unit 70% 목표)
- [ ] 의존성을 인터페이스로 주입해 Fake/Mock으로 갈아끼울 수 있는가
- [ ] 네트워크·시간 의존을 모킹해 테스트가 결정적인가
- [ ] 핵심 플로우만 UI 테스트로 다루고 testTag/식별자를 붙였는가
- [ ] 릴리즈 빌드에 디버그 로그·인스펙터가 남아있지 않은가
- [ ] 크래시 리포팅을 도입하고 dSYM/Mapping 업로드를 자동화했는가
- [ ] CI에 Unit·Lint·Static analysis·빌드 검증을 걸었는가
