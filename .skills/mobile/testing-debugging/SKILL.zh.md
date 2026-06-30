---
name: 移动测试/调试指南
description: 将 ViewModel 单元测试、UI 快照/插桩测试、网络 Mock、真机调试在 iOS/Android 两端整理出的标准。在新写测试或确定 CI 集合时，以及调试崩溃/回归时阅读。即使在 vibe coding 中，ViewModel 单元测试也是必需。关键词: junit, XCTest, espresso, @Test, assertEquals, XCAssert, mockk, Mockito, MockWebServer, Crashlytics。
rules:
  - "业务逻辑用单元测试，UI 用快照/组件测试来验证。"
  - "只用 UI 自动化测试覆盖核心流程 (量要少，以 Happy path 为主)。"
  - "对网络/时间依赖进行 Mock，使其确定性(deterministic)。"
  - "崩溃通过设备日志(Logcat·Console)查看堆栈。"
  - "Release 构建用混淆映射文件(dSYM·Mapping)还原堆栈。"
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

# 🧪 移动测试/调试指南

> 画面可以用手确认，但 ViewModel 逻辑的唯一安全网就是单元测试。因为它是异步 + 状态机，很容易发生回归。在写测试或调试崩溃时阅读。

## 1. 核心原则

- 业务逻辑用单元测试，UI 用快照/组件测试来验证。
- 只用 UI 自动化测试覆盖核心流程 (量要少，以 Happy path 为主)。
- 对网络/时间依赖进行 Mock，使其确定性(deterministic)。
- 崩溃通过设备日志(Logcat·Console)查看堆栈。
- Release 构建用混淆映射文件(dSYM·Mapping)还原堆栈。

## 2. 规则

### 2-1. 测试金字塔 (移动版)

```
       /\
      /UI\           慢、少 (各 1~2 个 Happy path)
     /----\
    / Comp \         组件 / 集成 — 中间
   /--------\
  /  Unit    \       快、多 — 以 ViewModel/Repository 为中心
 /------------\
```

推荐比例: Unit 70% / Component 20% / E2E UI 10%。

### 2-2. ViewModel 单元测试 (最优先)

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

// Fake — 用 protocol 抽象后更易构建
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

核心规则:
- ViewModel 通过接口(Protocol/abstract)接收依赖。这样才能替换成 Fake。
- 时间/随机数/当前时刻等非确定性应通过注入获得 (`Clock`, `Random`)。

### 2-3. 网络 Mock

```swift
// iOS — URLProtocol 拦截，或 Protocol 抽象
protocol APIClientProtocol {
    func getItems() async throws -> [ItemDto]
}
// 测试中注入 Mock 实现
```

```kotlin
// Android — MockWebServer (配合 Retrofit 最干净)
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

### 2-4. UI 测试 (量要少，仅核心流程)

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

> ⚠️ 给所有可交互元素加上无障碍标识符(accessibilityIdentifier / Modifier.testTag)。文本匹配对多语言/设计变更很脆弱。

### 2-5. 快照测试 (防止 UI 回归)

- iOS: [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
- Android: [Paparazzi](https://github.com/cashapp/paparazzi) (无需模拟器，在 JVM 上运行)

以设计系统组件 / 核心画面为主，30~50 张即可。

### 2-6. 调试工具

| 目的 | iOS | Android |
|------|-----|---------|
| 网络检查器 | Charles / Proxyman / Instruments Network | Charles / Chucker (库) |
| 内存/CPU | Xcode Instruments | Android Studio Profiler |
| 布局检查 | View Debugger | Layout Inspector |
| 强制深色/无障碍 | Environment Overrides | Developer Options → Force Dark |
| 查看慢速动画 | Simulator → Slow Animations | Developer Options → Animation 0.5x |
| 日志 | `print` / `os_log` / Console.app | `Log.d` / Logcat |

```swift
// iOS — Release 构建日志
#if DEBUG
print("...")
#endif
```
```kotlin
// Android
if (BuildConfig.DEBUG) Log.d("Tag", "...")
```

Release 中禁止令牌/个人信息日志。推荐用 Timber 按构建类型设置 Tree。

### 2-7. 崩溃报告

- 发布前务必接入。否则即使一万名用户崩溃也无从知晓。
- 推荐: Firebase Crashlytics (两平台通用)。
- iOS 必须自动化 dSYM 上传(Xcode Build Phase 或 Fastlane)。
- Android 上传 Mapping File(`crashlyticsUploadMappingFileRelease`)。

### 2-8. 真机调试

```
# iOS
- Xcode → Window → Devices and Simulators → 选择设备 → 用 Console 看实时日志
- Safari → 开发菜单 → 选择设备 进行 WebView 调试

# Android
- adb logcat 或 Android Studio Logcat
- adb shell input text / adb shell screencap 等大量自动化命令
- Chrome chrome://inspect 进行 WebView 调试
```

### 2-9. 在 CI 中跑的最小集合

- Unit test (ViewModel + Repository) — 每个 PR 都跑。
- Lint (SwiftLint / ktlint, detekt)。
- Static analysis (Xcode Analyze / Android Lint)。
- 可构建性 (PR 只跑 Debug 构建，Release 构建在 main merge 时)。
- UI 测试在 nightly 或 release 前。

## 3. 常见错误

- ❌ 让 ViewModel 依赖 Activity/UIViewController 而无法测试。
- ❌ 为所有画面都写 UI 测试 (慢 + 易碎)。
- ❌ 在 CI 上每次都运行指向真实服务器的集成测试 → Flaky。
- ❌ Release 构建中仍残留调试日志/网络检查器。
- ❌ 没有崩溃报告就发布。

## 4. 检查清单

- [ ] 是否用单元测试覆盖了 ViewModel/Repository 逻辑 (Unit 70% 目标)
- [ ] 是否通过接口注入依赖，可替换成 Fake/Mock
- [ ] 是否 Mock 了网络/时间依赖使测试确定性
- [ ] 是否只用 UI 测试覆盖核心流程并加了 testTag/标识符
- [ ] Release 构建中是否未残留调试日志/检查器
- [ ] 是否接入了崩溃报告并自动化 dSYM/Mapping 上传
- [ ] 是否在 CI 中接入了 Unit·Lint·Static analysis·构建验证
