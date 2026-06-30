---
name: ユニットテスト — 隔離・高速・信頼
description: 関数・クラス単位を外部依存から隔離し、高速で信頼できるユニットテストを書くための、言語・ツールに依存しない汎用(foundational)標準 — 1動作1テスト、FIRST、境界値・例外、外部依存(時間・HTTP・DB・ファイル)の隔離、パラメータ化。ユニットテストを新しく書くとき、または外部依存・時間・境界値をどう扱うか決めるときに読む(ユニット/統合/E2Eの範囲選択は test-strategy)。特定の言語/ツールに依存しない。
rules:
  - "1動作1テスト: テスト1つは1つの動作(論理フロー・結果)だけを検証する — 1つの動作を確認するための複数のアサーションは構わない。ケースが異なれば分ける。"
  - "外部と非決定要素を隔離する: DB・HTTP・ファイル・時間・乱数のようにユニットの外にあるものはテストダブルで置き換え、結果が外部環境・実行順序・現在時刻に左右されない(決定的)ようにする。"
  - "正常だけでなく境界・例外まで: 境界値(0・最小・最大・null・空コレクション)と失敗経路を併せて見る。"
  - "自動判定 + 良い失敗メッセージ: 目視で比較しなくても成功/失敗が自動で分かれ、失敗時には何がなぜ間違っているのかが明らかになる。"
  - "テストもプロダクション品質で: 繰り返しの準備は共通fixture/helperで、入力だけが異なるケースはパラメータ化でまとめる。"
tags:
  - "jest"
  - "vitest"
  - "pytest"
  - "unittest"
  - "mock"
  - "spy"
  - "assert"
  - "toBe"
  - "toEqual"
  - "@Test"
  - "JUnit"
foundational: true
---

# 🔬 ユニットテスト — 隔離・高速・信頼

> 関数・クラス単位を外部依存から隔離し、高速でいつでも同じ結果を出す信頼できるテストを作る。ユニットテストを新しく書くとき、または外部依存・時間・境界値をどう扱うか決めるときに読む。特定の言語/テストツールに縛られない汎用標準である。(何をユニット/統合/E2Eのどれで検証するかの範囲決定は test-strategy 参照)

## 1. 核心原則
- **1動作1テスト**: テスト1つは1つの動作(論理フロー・結果)だけを検証する — 1つの動作を確認するための複数のアサーションは構わない。ケースが異なれば分ける。
- **外部と非決定要素を隔離する**: DB・HTTP・ファイル・時間・乱数のようにユニットの外にあるものはテストダブルで置き換え、結果が外部環境・実行順序・現在時刻に左右されない(決定的)ようにする。
- **正常だけでなく境界・例外まで**: 境界値(0・最小・最大・null・空コレクション)と失敗経路を併せて見る。
- **自動判定 + 良い失敗メッセージ**: 目視で比較しなくても成功/失敗が自動で分かれ、失敗時には何がなぜ間違っているのかが明らかになる。
- **テストもプロダクション品質で**: 繰り返しの準備は共通fixture/helperで、入力だけが異なるケースはパラメータ化でまとめる。

## 2. ルール

### 2-1. 良いユニットテストの特性 (FIRST)

| 特性 | 意味 |
|------|------|
| **F**ast | ミリ秒単位で実行(DB・ネットワークなし) |
| **I**solated | 他のテストと独立(共有状態・実行順序に無関係) |
| **R**epeatable | いつどこでも同じ結果 |
| **S**elf-validating | 自動で成功/失敗を判断 |
| **T**imely | プロダクションコード作成の前後、適時に作成 |

### 2-2. 1つのテストは1つの動作だけを検証する
- ケース(正常・境界・例外)が異なればテストを分ける。1つのテストに複数の動作を詰め込まない。
- テスト名を見ただけで「何を保証するのか」が読み取れるようにする。

```text
// ❌ 禁止 — 1つのテストが複数の動作を一度に検証(失敗時に原因が曖昧)
test("discount"):
  assert discount(10000, member=true)  == 9000
  assert discount(0,     member=true)  == 0
  assert discount(10000, member=false) == 10000

// ✅ 推奨 — 動作ごとに別テスト、名前で意図が表れる
test("会員は10%割引"):        assert discount(10000, member=true)  == 9000
test("価格0なら0"):           assert discount(0,     member=true)  == 0
test("非会員は割引なし"):     assert discount(10000, member=false) == 10000
```

### 2-3. 境界値と例外経路を必ず検証する
- 正常ケースだけを見ず、境界(0、最小・最大、null/なし、空コレクション)と失敗・例外を併せて見る。
- 例外は「投げられるか」だけでなく「正しい種類/理由で投げられるか」まで検証する。

```text
// ❌ 禁止 — 正常経路1行だけ検証、境界・例外は放置
test("正常価格の割引だけ確認")

// ✅ 推奨 — 境界・例外までケースに分けて検証
test("境界: 価格0 → 0")
test("例外: 負の価格 → '価格は0以上' のエラーを投げる")
test("境界: 空のカート → 合計0")
```

### 2-4. 外部依存はテストダブルで隔離する
- DB・HTTP・ファイルシステム・メッセージキューなどユニットの外のリソースは実際に呼ばず、Mock/Stub/Fakeで置き換える。
- ユニットが協力者に「何をどう要求したか」(相互作用)と「応答をどう処理するか」を検証する。

```text
// ❌ 禁止 — 実際の外部システムを叩いて遅く不安定
test("プロフィール取得"):
  result = userApi.fetchProfile("u1")   // 実サーバーへのHTTP呼び出し → ネットワークに依存
  assert result.name == "ホン・ギルドン"

// ✅ 推奨 — 協力者をダブルで置き換え、ユニットロジックだけ検証
test("プロフィール取得"):
  httpClient.get = stub(returns { id:"u1", name:"ホン・ギルドン" })
  result = userApi.fetchProfile("u1")
  assert result.name == "ホン・ギルドン"
```

### 2-5. 時間・乱数などの非決定要素を固定する
- 「現在時刻」・乱数・UUIDのように呼ぶたびに変わる値はテストダブル/フェイクで固定して決定的にする。
- コードが時計・乱数源を直接呼ばず注入を受けるように設計すれば固定しやすい。

```text
// ❌ 禁止 — 実際の現在時刻に依存 → 土曜日だけ通過/失敗
test("週末かどうか"):
  assert isWeekend() == true     // 今日が土曜日のときだけ正しい

// ✅ 推奨 — 時間を固定して結果を決定的に
test("土曜日は週末である"):
  clock.fixTo("2026-06-14")      // 土曜日に固定
  assert isWeekend() == true
```

### 2-6. 重複はパラメータ化・fixtureで除去する
- 入力だけが異なり検証構造が同じケースは表(データ)にまとめてパラメータ化する。
- 繰り返される準備(setup)は共通fixture/helperに抽出するが、テストの意図が隠れない程度にだけ共有する。

```text
// ❌ 禁止 — 同じ検証を入力だけ変えてコピペ
test("a@b.com 有効"):     assert isValidEmail("a@b.com") == true
test("invalid 無効"):     assert isValidEmail("invalid") == false
test("@no.com 無効"):     assert isValidEmail("@no.com") == false

// ✅ 推奨 — ケースをデータにまとめて1テストに
test_each([
  ("a@b.com", true),
  ("invalid", false),
  ("@no.com", false),
  ("",        false),
])("メール検証", (input, expected):
  assert isValidEmail(input) == expected
)
```

## 3. よくある間違い

ルール(§2)を破ったときに現れる症状 — 見えたら該当ルールに戻る。

- **失敗しても原因を特定できない** → 1つのテストに複数の動作をまとめて(2-2)何が壊れたか曖昧、または失敗メッセージが "expected true, got false" だけ(自動判定・メッセージの不在)。
- **プロダクションでだけ落ちる** → 正常経路だけ検証し、境界・例外(2-3)を放置した。
- **たまに/特定環境でだけ壊れる(flaky)** → 外部依存を実際に呼ぶ(2-4)、現在時刻・乱数に依存する(2-5)、またはテスト間で状態を共有して実行順序に左右される(isolation)。
- **テストが膨れて壊れやすい** → 入力だけが異なるケースをコピペする(2-6)。

## 4. チェックリスト
- [ ] テスト1つが1つの動作だけを検証しているか(名前で意図が読み取れるか)
- [ ] 境界値(0・最小・最大・null/なし・空コレクション)と例外経路を検証したか
- [ ] 外部依存(DB・HTTP・ファイルシステム・時間・乱数)をテストダブルで隔離したか
- [ ] 時間・乱数などの非決定要素を固定して決定的(repeatable)にしたか
- [ ] テスト間で状態を共有せず実行順序に無関係か(isolated)
- [ ] 成功/失敗が自動判定され(self-validating)、失敗メッセージで原因が分かるか
- [ ] 重複ケースをパラメータ化に、繰り返しの準備を共通fixture/helperに抽出したか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタック(テストランナー・モッキングライブラリ)に合った例を同じパターンで追加する。上の1〜4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Python (pytest)

境界・例外(2-3):

```python
class TestCalculateDiscount:
    # 정상 케이스
    def test_10percent_for_membership(self):
        assert calculate_discount(price=10000, is_member=True) == 9000

    # 경계값
    def test_zero_price_returns_zero(self):
        assert calculate_discount(price=0, is_member=True) == 0

    def test_negative_price_raises_error(self):
        with pytest.raises(ValueError, match="가격은 0 이상이어야 합니다"):
            calculate_discount(price=-100, is_member=True)

    # 예외 케이스
    def test_non_member_no_discount(self):
        assert calculate_discount(price=10000, is_member=False) == 10000
```

時間の隔離(2-5, `unittest.mock.patch`):

```python
from unittest.mock import patch
from datetime import datetime, date

def test_is_weekend_saturday():
    with patch("app.services.datetime") as mock_dt:
        mock_dt.today.return_value = date(2026, 6, 14)  # 토요일
        assert is_weekend() is True
```

HTTPの隔離(2-4, `AsyncMock`):

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_fetch_user_profile():
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value={"id": "u1", "name": "홍길동"})

    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await user_api.fetch_profile("u1")

    assert result.name == "홍길동"
```

パラメータ化(2-6, `@pytest.mark.parametrize`):

```python
@pytest.mark.parametrize("input,expected", [
    ("hello@email.com", True),
    ("invalid-email", False),
    ("@nodomain.com", False),
    ("", False),
])
def test_email_validation(input, expected):
    assert is_valid_email(input) == expected
```

### JS (Jest など)

時間の隔離(2-5, fake timer):

```javascript
// Jest — 시스템 시간 모킹
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-14") });
});
afterEach(() => jest.useRealTimers());
```
