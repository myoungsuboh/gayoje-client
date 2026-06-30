---
name: 統合テスト — DB·API·コンポーネント連携
description: 実際の DB·外部サービス·API を含むコンポーネント間の協調を検証する汎用統合テスト標準 — テスト専用依存、テスト間の隔離(初期化·整理)、契約(スキーマ·ステータス·ヘッダー)検証、外部サービスのサンドボックス化、CI 再現性。API 契約·DB 連携·外部サービス連携をテストしたり、CI で依存サービスを起動して検証するときに読む。特定の言語/フレームワーク/ツールに依存しない。
rules:
  - "本番に触れない: テスト専用の DB·キュー·キャッシュ·バケットのみ使い、実際の本番データに接続しない。"
  - "テスト間の隔離: 各テストは既知の状態から始まり、終わったら痕跡を消す(ロールバック/整理) — 実行順序に関係なく同じ結果が出なければならない。"
  - "実装ではなく契約を見る: 本物のリクエストを送り、外部から観察可能な契約(スキーマ·ステータス/エラーコード·ヘッダー·ペイロード)を検証する。"
  - "外部副作用は代役で: 決済·メール·SMS などはサンドボックス/偽サーバーで代替し、本物の課金·送信·外部変更を起こさない。"
  - "決定的で再現可能に: 時間·乱数·タイミング·順序に依存せず(非同期は完了を待ってから断言)、依存サービスをコードで起動してローカルと CI を同じにする。"
tags:
  - "testcontainers"
  - "docker-compose"
  - "pytest-asyncio"
  - "supertest"
  - "TestClient"
  - "integration"
  - "database"
  - "httpx"
---

# 🔗 統合テスト — DB·API·コンポーネント連携

> 単体テストが一つの単位を隔離して検証するなら、統合テストは実際の DB·外部サービス·API を含む **コンポーネント間の協調** を検証する。API 契約や DB 連携をテストし、CI で依存サービスを再現可能に起動するときに読む。特定の言語/フレームワーク/テストツールに依存しない汎用標準である。入力値検証そのものは `入力値検証標準` に従う。

## 1. コア原則
- **本番に触れない**: テスト専用の DB·キュー·キャッシュ·バケットのみ使い、実際の本番データに接続しない。
- **テスト間の隔離**: 各テストは既知の状態から始まり、終わったら痕跡を消す(ロールバック/整理) — 実行順序に関係なく同じ結果が出なければならない。
- **実装ではなく契約を見る**: 本物のリクエストを送り、外部から観察可能な契約(スキーマ·ステータス/エラーコード·ヘッダー·ペイロード)を検証する。
- **外部副作用は代役で**: 決済·メール·SMS などはサンドボックス/偽サーバーで代替し、本物の課金·送信·外部変更を起こさない。
- **決定的で再現可能に**: 時間·乱数·タイミング·順序に依存せず(非同期は完了を待ってから断言)、依存サービスをコードで起動してローカルと CI を同じにする。

## 2. ルール

### 2-1. 本番ではなくテスト専用の依存を使う
- DB/キュー/キャッシュ/ストレージは、テスト環境では隔離されたインスタンス(インメモリまたはコンテナ)を指すようにする。
- 接続情報は環境別の設定で注入し、本番の接続情報がテスト経路に漏れないようにする。

```text
// ❌ 禁止 — 本番 DB で統合テスト
connect(PROD_DATABASE_URL); runTests()      // データ汚染·事故

// ✅ 推奨 — テスト専用の隔離インスタンス
connect(TEST_DATABASE_URL); runTests()      // インメモリまたはコンテナ
```

### 2-2. テスト間の隔離 — 開始状態を保証、終わったら整理
- 各テスト(またはケースのまとまり)の前にスキーマ/データを既知の状態にし、後にロールバックするか空にする。
- 隔離戦略(毎テストのトランザクションロールバック / テーブル truncate / 毎回再生成)は一つ選び、一貫して適用する。
- 共用の可変状態をテスト同士で共有しない — 順序依存が生まれる。

```text
// ❌ 禁止 — 整理なしにデータが積み上がる → 順序によって結果が変わる
test A: insert X
test B: count == 1   // A が先に回ると壊れる

// ✅ 推奨 — 各テストが隔離される
beforeEach: reset to known state
afterEach:  rollback / cleanup
```

### 2-3. API 統合は本物のリクエストで契約を検証する
- ハンドラ関数を直接呼ばず、実際の HTTP 経路(ルーティング·シリアライズ·検証·ミドルウェア込み)を通したリクエストを送る。
- ステータス/エラーコード、レスポンススキーマ、主要ヘッダーを断言する。書き込み後はもう一度読んで実際に反映されたか確認する。

```text
// ❌ 禁止 — 内部関数を直接呼ぶ(シリアライズ·ルーティング·検証をスキップ)
result = controller.create(obj); assert result.ok

// ✅ 推奨 — 実際のリクエスト → ステータス·スキーマ·往復検証
res = POST /users {name, email}
assert res.status == 201
id = res.body.id
got = GET /users/{id}
assert got.status == 200 and got.body.name == name
```

### 2-4. コンポーネント(UI など)統合は外部呼び出しを代役で塞ぎ、非同期完了後に断言する
- UI/ビュー統合テストはコンポーネントを実際にレンダリング/マウントするが、外に出ていくネットワーク呼び出しは偽レスポンスで横取りする。
- 非同期データロードが終わった後(明示的な待機)、画面に反映された結果を検証する。

```text
// ✅ 推奨 — 外部呼び出しの横取り + 非同期完了待機後に断言
mockNetwork(GET /user/u1 → {name: "..."})
render(Profile, {userId: "u1"})
awaitAsyncSettled()              // 非同期処理の完了を待つ
assert screen.contains("...")
```

### 2-5. 外部サービスはサンドボックス/代役で — 本物の副作用禁止
- 決済·メール·SMS·サードパーティ API はテストモード/サンドボックスキーまたはローカルの偽サーバーで代替する。
- 本物の課金·送信·外部状態変更を起こさない。レスポンス遅延·失敗のような境界状況も代役で再現する。

```text
// ❌ 禁止 — テストが実際の決済/送信を呼ぶ
charge(realCard)        // コスト·副作用·不安定

// ✅ 推奨 — サンドボックス/偽サーバーで契約だけ検証
charge(sandboxCard) → assert request shape & handled response
```

### 2-6. 依存サービスをコードで起動し CI で再現する
- DB·キャッシュなど依存サービスを宣言的に(コンテナ定義など)起動し、**準備完了(healthcheck)** を確認してからテストを始める。
- 同じ定義をローカルと CI が共有し、「私の PC では動く」をなくす。

```text
// ✅ 推奨 — 依存サービス起動 → 準備確認 → テスト
services: [db, cache]  with healthcheck
wait until healthy
then run integration tests
```

## 3. よくある間違い

ルール(§2)を破ったときに現れる症状 — 見えたら該当ルールに戻る。

- **データ汚染·事故** → 本番リソースに接続してテストする(2-1)。
- **順序によって壊れる(flaky)** → setup/teardown の欠落(2-2)、非同期完了を待たない(2-4)、時間·乱数·順序依存(決定性)のいずれか。
- **契約の欠陥を捕まえられない** → 内部関数を直接呼んで「API テスト」と称し、シリアライズ·ルーティング·検証·ミドルウェアをスキップする(2-3)。
- **コスト·副作用** → 外部サービスを実際に呼ぶ(2-5)。
- **「私の PC では動く」** → 依存サービスをコードで宣言せず、CI で壊れる(2-6)。

## 4. チェックリスト
- [ ] テスト専用の DB/依存(インメモリ·コンテナ)を使い、本番リソースに触れないか
- [ ] 各テストが既知の状態から始まり、終わったらロールバック/整理して互いに隔離されるか
- [ ] API 統合テストが本物のリクエストでステータス·スキーマ·ヘッダーなど **契約** を検証するか
- [ ] 書き込み後にもう一度読んで実際の反映(往復)を確認するか
- [ ] UI/コンポーネント統合で外部呼び出しを代役で塞ぎ、非同期完了後に断言するか
- [ ] 外部サービスをテストモード/サンドボックス/偽サーバーで処理したか(本物の副作用なし)
- [ ] 時間·乱数·順序依存を除去して決定的か
- [ ] 依存サービスをコードで起動し準備確認後に実行して CI で再現可能か

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(例: JVM/Spring+Testcontainers、Node/Jest+supertest、Go/testify など)に合う例を同じパターンで追加する。上の 1〜4 の原則·ルールが標準であり、付録はその適用例にすぎない。

### Python (pytest + httpx + SQLAlchemy + Testcontainers)

本物のリクエストで契約·往復検証 + テストごとの DB 初期化(2-3, 2-2):

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine
from app.main import app

# テスト専用 DB (インメモリ SQLite または Docker PostgreSQL)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
async def reset_db():
    """各テスト前にテーブル初期化"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_create_and_get_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 作成
        create_res = await client.post("/users", json={
            "name": "ホン・ギルドン", "email": "hong@example.com"
        })
        assert create_res.status_code == 201
        user_id = create_res.json()["id"]

        # 取得 — 実際の DB から読み出す
        get_res = await client.get(f"/users/{user_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "ホン・ギルドン"
```

インメモリで足りなければコンテナ(Testcontainers)で実際の PostgreSQL を起動し、テスト後にロールバック:

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url()

@pytest.fixture
async def db_session(postgres):
    engine = create_async_engine(postgres)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
        await session.rollback()  # テスト後にロールバック
```

### Vue (Vue Test Utils + Pinia + MSW)

外部呼び出しの代役 + 非同期完了後に断言(2-4):

```javascript
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import UserProfile from "@/components/UserProfile.vue";

// 実際の API モック (MSW または vi.mock)
vi.mock("@/utils/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { id: "u1", name: "ホン・ギルドン", email: "hong@example.com" }
    })
  }
}));

test("ユーザープロフィールのロードと表示", async () => {
  const wrapper = mount(UserProfile, {
    props: { userId: "u1" },
    global: { plugins: [createPinia()] }
  });

  await flushPromises();  // 非同期処理完了

  expect(wrapper.text()).toContain("ホン・ギルドン");
  expect(wrapper.text()).toContain("hong@example.com");
});
```

### CI 依存サービス (Docker Compose)

healthcheck で依存サービスを起動してから実行し、CI で再現(2-6):

```yaml
# docker-compose.test.yml
services:
  test:
    build: .
    command: pytest tests/integration/ -v
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://postgres:test@postgres:5432/testdb

  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: test }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 2s
      retries: 10
```
