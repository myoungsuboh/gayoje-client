---
name: モバイル テスト/デバッグガイド
description: ViewModelの単体テスト、UIスナップショット/インストルメンテーションテスト、ネットワークモッキング、実機デバッグをiOS/Android両方でまとめた標準。テストを新たに書くときやCIセットを決めるとき、クラッシュ・リグレッションをデバッグするときに読む。バイブコーディングでもViewModelの単体テストは必須。キーワード: junit, XCTest, espresso, @Test, assertEquals, XCAssert, mockk, Mockito, MockWebServer, Crashlytics。
rules:
  - "ビジネスロジックは単体テストで、UIはスナップショット・コンポーネントテストで検証する。"
  - "コアフローのみをUI自動化テストで扱う (量は少なく、Happy path中心)。"
  - "ネットワーク・時間依存はモックして決定的(deterministic)にする。"
  - "クラッシュはデバイスログ(Logcat・Console)でスタックを確認する。"
  - "リリースビルドは難読化マッピングファイル(dSYM・Mapping)でスタックを復元する。"
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

# 🧪 モバイル テスト/デバッグガイド

> 画面は手で確認できるが、ViewModelのロジックは単体テストが唯一の安全装置だ。非同期 + ステートマシンなので、リグレッションが簡単に起きる。テストを書くときやクラッシュをデバッグするときに読む。

## 1. 核心原則

- ビジネスロジックは単体テストで、UIはスナップショット・コンポーネントテストで検証する。
- コアフローのみをUI自動化テストで扱う (量は少なく、Happy path中心)。
- ネットワーク・時間依存はモックして決定的(deterministic)にする。
- クラッシュはデバイスログ(Logcat・Console)でスタックを確認する。
- リリースビルドは難読化マッピングファイル(dSYM・Mapping)でスタックを復元する。

## 2. ルール

### 2-1. テストピラミッド (モバイル版)

```
       /\
      /UI\           遅い、少なく (Happy path 1~2個ずつ)
     /----\
    / Comp \         コンポーネント / 統合 — 中間
   /--------\
  /  Unit    \       速い、多く — ViewModel/Repository 中心
 /------------\
```

比率の推奨: Unit 70% / Component 20% / E2E UI 10%。

### 2-2. ViewModel単体テスト (最優先)

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

// Fake — protocolで抽象化しておくと作りやすい
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

核心ルール:
- ViewModelはインターフェース(Protocol/abstract)で依存性を受け取る。そうすればFakeに差し替えられる。
- 時間/乱数/現在時刻のような非決定性は注入させよ (`Clock`, `Random`)。

### 2-3. ネットワークモッキング

```swift
// iOS — URLProtocol で横取り、またはProtocol抽象化
protocol APIClientProtocol {
    func getItems() async throws -> [ItemDto]
}
// テストではMock実装を注入
```

```kotlin
// Android — MockWebServer (Retrofitが最もきれい)
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

### 2-4. UIテスト (量は少なく、コアフローのみ)

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

> ⚠️ アクセシビリティ識別子(accessibilityIdentifier / Modifier.testTag)をすべてのインタラクティブ要素に付けよ。テキストマッチングは多言語/デザイン変更に弱い。

### 2-5. スナップショットテスト (UIリグレッション防止)

- iOS: [swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
- Android: [Paparazzi](https://github.com/cashapp/paparazzi) (エミュレータなしでJVM上で実行)

デザインシステムのコンポーネント / コア画面を中心に30~50枚で十分。

### 2-6. デバッグツール

| 目的 | iOS | Android |
|------|-----|---------|
| ネットワークインスペクタ | Charles / Proxyman / Instruments Network | Charles / Chucker (ライブラリ) |
| メモリ/CPU | Xcode Instruments | Android Studio Profiler |
| レイアウト検査 | View Debugger | Layout Inspector |
| 強制ダーク/アクセシビリティ | Environment Overrides | Developer Options → Force Dark |
| 遅いアニメーション確認 | Simulator → Slow Animations | Developer Options → Animation 0.5x |
| ログ | `print` / `os_log` / Console.app | `Log.d` / Logcat |

```swift
// iOS — リリースビルドのロギング
#if DEBUG
print("...")
#endif
```
```kotlin
// Android
if (BuildConfig.DEBUG) Log.d("Tag", "...")
```

リリースでトークン/個人情報のログ禁止。Timberでビルドタイプ別のTree設定を推奨。

### 2-7. クラッシュレポーティング

- リリース前に必ず導入。さもないとユーザー1万人がクラッシュしても気づかない。
- 推奨: Firebase Crashlytics (両プラットフォーム共通)。
- iOSはdSYMアップロードの自動化が必須(Xcode Build PhaseまたはFastlane)。
- AndroidはMapping Fileのアップロード(`crashlyticsUploadMappingFileRelease`)。

### 2-8. 実機デバッグ

```
# iOS
- Xcode → Window → Devices and Simulators → 機器を選択 → Console でリアルタイムログ
- Safari → 開発メニュー → 機器を選択 でWebViewデバッグ

# Android
- adb logcat または Android Studio Logcat
- adb shell input text / adb shell screencap など自動化コマンド多数
- Chrome chrome://inspect でWebViewデバッグ
```

### 2-9. CIで回す最小セット

- Unit test (ViewModel + Repository) — PRごとに常に。
- Lint (SwiftLint / ktlint, detekt)。
- Static analysis (Xcode Analyze / Android Lint)。
- ビルド可否 (Debugビルドのみ PR、Releaseビルドは main merge 時)。
- UIテストはnightlyまたはrelease前。

## 3. よくある間違い

- ❌ ViewModelをActivity/UIViewController依存にしてテスト不可能にする。
- ❌ すべての画面にUIテストを書く (遅い + 壊れやすい)。
- ❌ 実サーバーに向けた統合テストをCIで毎回実行 → Flaky。
- ❌ リリースビルドにデバッグログ/ネットワークインスペクタが残っている。
- ❌ クラッシュレポーティングなしでリリース。

## 4. チェックリスト

- [ ] ViewModel/Repositoryのロジックを単体テストで覆ったか (Unit 70% 目標)
- [ ] 依存性をインターフェースで注入し、Fake/Mockに差し替えられるか
- [ ] ネットワーク・時間依存をモックしてテストが決定的か
- [ ] コアフローのみをUIテストで扱い、testTag/識別子を付けたか
- [ ] リリースビルドにデバッグログ・インスペクタが残っていないか
- [ ] クラッシュレポーティングを導入し、dSYM/Mappingのアップロードを自動化したか
- [ ] CIにUnit・Lint・Static analysis・ビルド検証を組み込んだか
