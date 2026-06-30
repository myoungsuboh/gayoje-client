---
name: テストデータ & Fixture 管理
description: テストデータ・フィクスチャ・シードの汎用標準 — テスト内部での生成、デフォルト値 + 必要な値だけオーバーライド、偽データ、フィクスチャのスコープとテスト間の分離、冪等なシード。テストデータを生成・共有する、または DB シードスクリプトを作成・整備する際に読む。スタックに依存しない。
rules:
  - "データはテストが所有する: あらかじめ埋めた共有グローバルではなく、各テスト（またはそのセットアップ）が自分のデータを作り、実行順序に揺らがないようにする。"
  - "デフォルト + オーバーライド: 生成器がすべてのフィールドに妥当なデフォルト値を埋め、テストは意味のある値だけを上書きする — 重複と無関係なフィールドの結合を断つ。"
  - "偽・決定的データ: 機微な実データの代わりに生成された偽の値を使い（セキュリティ・規制）、ランダムはシードを固定して再現可能にしつつ多様性は保つ。"
  - "分離と再利用のバランス: 作るのが高価なリソースは広いスコープで一度作って再利用し、テストが作ったデータは狭いスコープで分離してクリーンアップ/ロールバックする。"
  - "重いものや繰り返すものは外へ: 大容量入力はファイル + パス定数として置き、DB シードは冪等に（あれば無視/更新）書く。"
tags:
  - "factory"
  - "fixture"
  - "faker"
  - "seed"
  - "mock_data"
  - "pytest.fixture"
  - "beforeEach"
  - "factory_boy"
---

# 🏭 テストデータ & Fixture 管理

> テストデータを、妥当なデフォルト値を備えたファクトリでテスト内部に作り、偽データを使い、コストの大きいリソースはスコープを分けて再利用しつつテスト同士は分離し、シードは冪等に書く。テストデータを生成・共有する、または DB シードスクリプトを作成・整備する際に読む。特定の言語/フレームワーク/ライブラリに依存しない汎用標準である。

## 1. 基本原則
- **データはテストが所有する**: あらかじめ埋めた共有グローバルではなく、各テスト（またはそのセットアップ）が自分のデータを作り、実行順序に揺らがないようにする。
- **デフォルト + オーバーライド**: 生成器がすべてのフィールドに妥当なデフォルト値を埋め、テストは意味のある値だけを上書きする — 重複と無関係なフィールドの結合を断つ。
- **偽・決定的データ**: 機微な実データの代わりに生成された偽の値を使い（セキュリティ・規制）、ランダムはシードを固定して再現可能にしつつ多様性は保つ。
- **分離と再利用のバランス**: 作るのが高価なリソースは広いスコープで一度作って再利用し、テストが作ったデータは狭いスコープで分離してクリーンアップ/ロールバックする。
- **重いものや繰り返すものは外へ**: 大容量入力はファイル + パス定数として置き、DB シードは冪等に（あれば無視/更新）書く。

## 2. ルール

### 2-1. テストデータはファクトリで、テスト内部で生成
- 共有グローバルフィクスチャにあらかじめ埋め込んだデータを、複数のテストが一緒に読み書きしない。
- 各テスト（またはそのセットアップ）が自分のデータを作り、他のテストと干渉しないようにする。

```text
// ❌ 禁止 — グローバルにあらかじめ作ったデータを共有（順序・干渉に脆弱）
GLOBAL.users = [alice, bob]        // モジュールロード時に1回生成
test A: GLOBAL.users[0].有効化()    // 状態を変える
test B: assert GLOBAL.users[0].有効?  // Aが先に走ると壊れる

// ✅ 推奨 — テストごとにファクトリで新規生成
test A: u = makeUser();  u.有効化();  assert ...
test B: u = makeUser();  assert u.無効?
```

### 2-2. 生成器はデフォルト値を埋め、テストは必要な値だけオーバーライド
- データ生成器はすべての必須フィールドにもっともらしいデフォルト値を提供する。
- 呼び出すテストは、そのテストの意図と直接関係するフィールドだけを上書きする — 残りはデフォルト値に任せる。

```text
// ❌ 禁止 — 毎テストが全フィールドを指定（重複 + 無関係なフィールドに脆弱）
makeUser(id=…, name=…, email=…, role="user", createdAt=…, active=true)

// ✅ 推奨 — デフォルト値の上に意味のある値だけオーバーライド
makeUser()                       // すべてデフォルト値
makeUser(role="admin")           // このテストが気にする値だけ
makeAdmin() = makeUser(role="admin")   // よく使う変種は名前付きヘルパーで
```

### 2-3. 機微な実データの代わりに偽データ
- 実名・実際のメール・電話・住所・カード番号などをテストに入れない。
- 仮想データ生成器で形式だけ合った偽の値を作る。必要ならロケールを指定する。

```text
// ❌ 禁止 — 実際の個人情報
makeUser(name="山田太郎", email="real.person@gmail.com")

// ✅ 推奨 — 生成された偽データ
makeUser(name=fakeName(locale="ko"), email=fakeEmail())
```

### 2-4. フィクスチャ階層: スコープでコストを分け、テストは分離
- 作るのが高価なリソース（DB エンジン/スキーマ、アプリコンテキストなど）は広いスコープ（スイート/セッション）で一度だけ作って再利用する。
- 各テストが作ったデータは狭いスコープ（テストごと）に置き、終わったらロールバック/クリーンアップして次のテストに漏れないようにする。

```text
// ✅ 推奨 — スコープを分けて: 高価なものは1回、データはテストごと + 分離
fixture(scope=セッション)  dbEngine:  スキーマ生成   → すべてのテストが共有
fixture(scope=テスト) dbSession: トランザクション開始 → (テスト) → 終わったらロールバック
fixture(scope=テスト) sampleUser(dbSession): makeUser() 後に返す
```

### 2-5. 結果を揺らすランダムはシード固定
- ランダム生成で検証が不安定になりうるところは、シードを固定して再現可能にする。
- ただし、同じ値ばかり繰り返してエッジケースを見落とさないよう、データの多様性は保つ。

```text
// ❌ 禁止 — 毎回実行のたびに値が変わり時々失敗 (flaky)
random.seed = 現在時刻

// ✅ 推奨 — シード固定で再現可能
random.seed = 1234
```

### 2-6. 大容量データはファイルで、パスは定数で
- 大きな入力（サンプル JSON/CSV など）はテストコードにインライン化せずファイルとして置く。
- そのパスはテストごとに相対パスでばら撒かず、一箇所の定数として定義して参照する。

```text
// ❌ 禁止 — あちこちに壊れやすい相対パス
load("../../../fixtures/big.json")

// ✅ 推奨 — 一箇所に定数として定義して参照
FIXTURES_DIR = <プロジェクト基準の絶対/ルートパス>
load(FIXTURES_DIR + "/big.json")
```

### 2-7. シードスクリプトは冪等に
- DB シードは「あれば無視（または更新）」方式で書き、複数回実行しても重複・エラーなく同じ状態になるようにする。
- 無条件に INSERT しない — 再実行時に重複キー・重複行を作る。

```text
// ❌ 禁止 — 再実行すると重複/エラー
for name in カテゴリ: INSERT category(name)

// ✅ 推奨 — 冪等（あれば無視/更新）
for name in カテゴリ: getOrCreate category(name)
```

## 3. よくある間違い

ルール（§2）を破ったときに現れる症状 — 見えたら該当するルールに戻る。

- **順序によって結果が変わる** → グローバル共有データに依存するか（2-1）、テストが残した痕跡を片付けず（2-4）次のテストが汚染される。
- **無関係な変更でテストが壊れる** → デフォルト値なしで毎回全フィールドを指定し（2-2）、気にしないフィールドまで結合している。
- **時々失敗（flaky）** → シード固定なしのランダム（2-5）のため実行のたびに値が変わる。
- **遅い** → 高価なリソースを毎テストごとに再生成する（2-4）。
- **再実行が壊れる** → シードが冪等でなく（2-7）重複キー・重複行を作る。
- **その他** → 実データ露出（2-3）、大容量インライン + 相対パス乱用（2-6）も各ルールで防ぐ。

## 4. チェックリスト
- [ ] テストデータをテスト内部で生成し、共有グローバル状態に依存していないか
- [ ] データ生成器がデフォルト値を提供し、テストは必要な値だけオーバーライドしているか
- [ ] 実際の機微データの代わりに偽（生成された）データを使っているか
- [ ] 高価なリソースは広いスコープで1回生成し、各テストデータは終わったらクリーンアップ/ロールバックして分離しているか
- [ ] 検証を揺らすランダムはシードを固定して再現可能にしたか
- [ ] 大容量データをファイルとして置き、パスを定数として定義したか
- [ ] シードスクリプトが冪等に動作するか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック（テストランナー・フィクスチャツール・偽データライブラリ）に合った例を同じパターンで追加する。上記 1〜4 の原則・ルールが標準であり、付録はその適用事例にすぎない。2つのスタック例は同じルールを示すサンプルであり、片方にだけコードがあってもルールは両方に同じく適用される。

### Python (factory_boy / Faker)

#### Factory パターン
デフォルト値を備えた Factory を定義し、テストで必要な値だけオーバーライドする。

```python
# tests/factories.py
from factory import Factory, Faker, SubFactory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = db.session

    id = Factory.LazyFunction(lambda: str(uuid4()))
    name = Faker("name", locale="ko_KR")
    email = Faker("email")
    role = "user"
    created_at = Factory.LazyFunction(datetime.utcnow)

class OrderFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Order
        sqlalchemy_session = db.session

    user = SubFactory(UserFactory)
    total_amount = Faker("random_int", min=1000, max=100000)
    status = "pending"

# テストで使用
def test_user_can_view_own_orders():
    user = UserFactory.create()
    orders = OrderFactory.create_batch(3, user=user)
    # デフォルト値オーバーライド
    special_order = OrderFactory.create(user=user, status="completed", total_amount=50000)
```

#### pytest Fixture 階層
スコープ（session/function）を分けて、コストの大きいリソースは一度だけ作り、各テストはトランザクションロールバックで分離する。

```python
# conftest.py — 共有 fixture

@pytest.fixture(scope="session")
def db_engine():
    """セッション全体で一度だけ生成"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """各テストごとにトランザクションロールバック"""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_user(db_session):
    """テスト用ユーザー生成"""
    user = UserFactory(session=db_session)
    db_session.flush()
    return user
```

#### 冪等シードスクリプト
`get_or_create` のようにすでにあれば無視するように書き、複数回実行しても結果が同じになるようにする。

```python
# scripts/seed.py
def seed_categories():
    categories = ["Electronics", "Books", "Clothing"]
    for name in categories:
        # すでにあれば無視 — 冪等
        Category.get_or_create(name=name)

if __name__ == "__main__":
    seed_categories()
    print("Seed completed")
```

### TypeScript / JavaScript (faker-js)

#### Factory パターン
`overrides` を展開してデフォルト値の上にテストごとの値だけを上書きし、変種は別のヘルパーで作る。

```typescript
// tests/factories/user.factory.ts
import { faker } from "@faker-js/faker";

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: "user",
  createdAt: new Date(),
  ...overrides,  // テストごとのオーバーライド
});

export const createAdmin = () => createUser({ role: "admin" });

// テストで使用
test("管理者はすべてのユーザーを照会できる", () => {
  const admin = createAdmin();
  const users = Array.from({ length: 5 }, () => createUser());
  // ...
});
```

#### フィクスチャスコープ · 冪等シード（概念マッピング）

上記 Python 例の `pytest fixture` 階層（2-4）と冪等シード（2-7）は JS/TS でも同じルールで適用される。ツールが違うだけである:

- **スコープ·分離（2-4）**: `beforeAll` で高価なリソース（DB/コンテナ）を1回準備し、`beforeEach`/`afterEach` で各テストをトランザクションロールバックや truncate で分離する（Vitest/Jest 共通）。
- **冪等シード（2-7）**: シードスクリプトは `INSERT` の代わりに ORM の upsert（例: Prisma `upsert`、TypeORM `save`）で「あれば更新/無視」するように書く。
