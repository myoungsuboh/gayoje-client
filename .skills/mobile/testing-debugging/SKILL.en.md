---
name: Mobile Testing / Debugging Guide
description: A standard organizing ViewModel unit tests, UI snapshot/instrumented tests, network mocking, and on-device debugging across both iOS/Android. Read it when writing new tests or deciding the CI set, or when debugging crashes/regressions. Even in vibe coding, ViewModel unit tests are mandatory. Keywords: junit, XCTest, espresso, @Test, assertEquals, XCAssert, mockk, Mockito, MockWebServer, Crashlytics.
rules:
  - "Verify business logic with unit tests and UI with snapshot/component tests."
  - "Cover only core flows with UI automation tests (keep volume low, focus on the happy path)."
  - "Mock network and time dependencies to make tests deterministic."
  - "For crashes, check the stack via device logs (Logcat·Console)."
  - "For release builds, restore the stack with obfuscation mapping files (dSYM·Mapping)."
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

# 🧪 Mobile Testing / Debugging Guide

> Screens can be checked by hand, but ViewModel logic's only safety net is unit tests. Being async + a state machine, it regresses easily. Read this when writing tests or debugging crashes.

## 1. Core Principles

- Verify business logic with unit tests and UI with snapshot/component tests.
- Cover only core flows with UI automation tests (keep volume low, focus on the happy path).
- Mock network and time dependencies to make tests deterministic.
- For crashes, check the stack via device logs (Logcat·Console).
- For release builds, restore the stack with obfuscation mapping files (dSYM·Mapping).

## 2. Rules

### 2-1. Test Pyramid (Mobile Version)

```
       /\
      /UI\           slow, few (1~2 happy paths each)
     /----\
    / Comp \         component / integration — middle
   /--------\
  /  Unit    \       fast, many — centered on ViewModel/Repository
 /------------\
```

Recommended ratio: Unit 70% / Component 20% / E2E UI 10%.

### 2-2. ViewModel Unit Tests (Top Priority)

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

// Fake — easy to build if abstracted via a protocol
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

Key rules:
- The ViewModel receives dependencies via an interface (Protocol/abstract). That's what lets you swap in a Fake.
- Inject non-determinism like time/random/current-time (`Clock`, `Random`).

### 2-3. Network Mocking

```swift
// iOS — URLProtocol interception or Protocol abstraction
protocol APIClientProtocol {
    func getItems() async throws -> [ItemDto]
}
// inject a Mock implementation in tests
```

```kotlin
// Android — MockWebServer (cleanest with Retrofit)
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

### 2-4. UI Tests (Keep Volume Low, Core Flows Only)

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

> ⚠️ Attach accessibility identifiers (accessibilityIdentifier / Modifier.testTag) to every interactive element. Text matching is fragile against localization/design changes.

### 2-5. Snapshot Tests (Preventing UI Regression)

- iOS: [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
- Android: [Paparazzi](https://github.com/cashapp/paparazzi) (runs on the JVM without an emulator)

Focusing on design-system components / core screens, 30~50 shots is enough.

### 2-6. Debugging Tools

| Purpose | iOS | Android |
|------|-----|---------|
| Network inspector | Charles / Proxyman / Instruments Network | Charles / Chucker (library) |
| Memory/CPU | Xcode Instruments | Android Studio Profiler |
| Layout inspection | View Debugger | Layout Inspector |
| Force dark/accessibility | Environment Overrides | Developer Options → Force Dark |
| Check slow animations | Simulator → Slow Animations | Developer Options → Animation 0.5x |
| Logs | `print` / `os_log` / Console.app | `Log.d` / Logcat |

```swift
// iOS — release-build logging
#if DEBUG
print("...")
#endif
```
```kotlin
// Android
if (BuildConfig.DEBUG) Log.d("Tag", "...")
```

No token/PII logs in release. Recommend setting up a per-build-type Tree with Timber.

### 2-7. Crash Reporting

- Adopt it before release without exception. Otherwise you won't know even if 10,000 users crash.
- Recommended: Firebase Crashlytics (common to both platforms).
- On iOS, automating dSYM upload is mandatory (Xcode Build Phase or Fastlane).
- On Android, upload the Mapping File (`crashlyticsUploadMappingFileRelease`).

### 2-8. On-Device Debugging

```
# iOS
- Xcode → Window → Devices and Simulators → select device → real-time logs via Console
- Safari → Develop menu → select device for WebView debugging

# Android
- adb logcat or Android Studio Logcat
- many automation commands like adb shell input text / adb shell screencap
- Chrome chrome://inspect for WebView debugging
```

### 2-9. Minimal Set to Run in CI

- Unit test (ViewModel + Repository) — always, on every PR.
- Lint (SwiftLint / ktlint, detekt).
- Static analysis (Xcode Analyze / Android Lint).
- Buildability (Debug build on PRs, Release build on main merge).
- UI tests nightly or before release.

## 3. Common Mistakes

- ❌ Making the ViewModel depend on Activity/UIViewController, making it untestable.
- ❌ Writing UI tests for every screen (slow + fragile).
- ❌ Running integration tests against a real server on every CI run → flaky.
- ❌ Debug logs/network inspector still live in the release build.
- ❌ Shipping without crash reporting.

## 4. Checklist

- [ ] Did you cover ViewModel/Repository logic with unit tests (target Unit 70%)?
- [ ] Can you inject dependencies via interfaces and swap them with Fake/Mock?
- [ ] Are network/time dependencies mocked so tests are deterministic?
- [ ] Do you cover only core flows with UI tests and attach testTag/identifiers?
- [ ] Are no debug logs/inspectors left in the release build?
- [ ] Did you adopt crash reporting and automate dSYM/Mapping upload?
- [ ] Did you wire Unit·Lint·Static analysis·build verification into CI?
