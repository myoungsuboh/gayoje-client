---
name: テスト戦略 & ピラミッド
description: テストピラミッド（Unit→Integration→E2E）に基づくバランスの取れたテスト戦略の標準。チームのテスト作成方針を定める、または新機能にどのテストをどれだけ置くか決める際に読む。キーワード: test, describe, it(, expect, mock, assert, beforeEach, afterEach, given, テストピラミッド, Given-When-Then。
rules:
  - "テストピラミッドに従う — 単体テスト（70%）が最も多く、統合テスト（20%）、E2E（10%）の順に構成する。"
  - "テストは Given-When-Then（Arrange-Act-Assert）パターンで書き、意図を明確にする。"
  - "テスト名は「何をテストするか」と「どんな条件で」を含む明確な説明文として書く。"
  - "テストは互いに独立していなければならず、実行順序や他のテストの状態に依存しない。"
  - "外部依存（DB・API・ファイルシステム）は単体テストでは Mock・Stub で分離し、統合テストでは実際の依存を使う。"
tags:
  - "test"
  - "describe"
  - "it("
  - "expect"
  - "mock"
  - "assert"
  - "beforeEach"
  - "afterEach"
  - "given"
  - "테스트 피라미드"
  - "Given-When-Then"
foundational: true
---

# 🧪 テスト戦略 & ピラミッド

> テストピラミッドに基づいてバランスの取れたテストを書く。チームのテスト作成方針を定める、または新機能にどのテストをどれだけ置くか決める際に読む。

## 1. 基本原則
- テストピラミッドに従う — 単体テスト（70%）が最も多く、統合テスト（20%）、E2E（10%）の順に構成する。
- テストは Given-When-Then（Arrange-Act-Assert）パターンで書き、意図を明確にする。
- テスト名は「何をテストするか」と「どんな条件で」を含む明確な説明文として書く。
- テストは互いに独立していなければならず、実行順序や他のテストの状態に依存しない。
- 外部依存（DB・API・ファイルシステム）は単体テストでは Mock・Stub で分離し、統合テストでは実際の依存を使う。

## 2. ルール

### 2-1. テストピラミッド（比率で配置）

```
          ┌──────────┐
          │   E2E    │  10% — ユーザーシナリオ全体の流れ
          │(Playwright│
          └──────────┘
        ┌────────────────┐
        │  Integration   │  20% — コンポーネント間の統合、DB 連携
        │   Tests        │
        └────────────────┘
    ┌─────────────────────────┐
    │      Unit Tests         │  70% — 関数/クラス単位の分離検証
    │    (高速・独立的・多い)     │
    └─────────────────────────┘
```

### 2-2. Given-When-Then パターン

```python
# Python
class TestUserService:
    def test_create_user_success(self, mock_db, mock_email):
        # Given — テストの前提条件
        request = CreateUserRequest(name="홍길동", email="hong@example.com")
        mock_db.save.return_value = User(id="u1", **request.dict())

        # When — テスト対象の実行
        result = user_service.create(request)

        # Then — 期待結果の検証
        assert result.id == "u1"
        assert result.name == "홍길동"
        mock_email.send_welcome.assert_called_once_with("hong@example.com")
```

```javascript
// JavaScript (Vitest/Jest)
describe("UserService", () => {
  describe("create()", () => {
    it("유효한 이메일로 사용자 생성 시 id를 반환한다", async () => {
      // Given
      const request = { name: "홍길동", email: "hong@example.com" };
      mockDb.save.mockResolvedValue({ id: "u1", ...request });

      // When
      const result = await userService.create(request);

      // Then
      expect(result.id).toBe("u1");
      expect(mockEmail.sendWelcome).toHaveBeenCalledWith("hong@example.com");
    });
  });
});
```

### 2-3. テスト分離（共有状態なし）

```python
# 各テストは独立 — 共有状態なし
@pytest.fixture(autouse=True)
def reset_db():
    # テスト前の初期化
    yield
    db.rollback()  # テスト後にロールバック
```

### 2-4. Mock vs Stub vs Fake（依存分離方式の選択）

| 種類 | 用途 | 例 |
|------|------|------|
| Mock | 呼び出し検証 | `mockEmail.assert_called_once()` |
| Stub | 固定の戻り値 | `mockDb.find.return_value = user` |
| Fake | 実際のように動作 | インメモリ DB |
| Spy | 実際の呼び出し + 観察 | `jest.spyOn(obj, 'method')` |

## 3. よくある間違い
- ❌ ピラミッドの逆転（E2E 過多） → 遅く壊れやすく保守負担。単体テスト中心に。
- ❌ 実装詳細に結合したテスト → リファクタリングのたびに壊れる。公開された動作・契約を検証する。
- ❌ カバレッジ数値だけを追う → assertion のない「通るだけ」のテストを量産。意味のある断言を置く。
- ❌ テスト間の共有状態 → 実行順序依存・フレーキー。分離・ロールバックで独立を保証する。
- ❌ 単体テストで外部依存（DB・API）を実際に呼び出す → 遅く不安定。Mock/Stub で分離。
- ❌ ハッピーパスだけテスト → エラー・境界値・null・並行性も併せて検証する。
- ❌ 断言メッセージ・明確なテスト名がない → 失敗時に原因の特定が遅れる。

## 4. チェックリスト
- [ ] 単体/統合/E2E の比率がピラミッド（70/20/10）に近く構成されているか
- [ ] 各テストが Given-When-Then で意図を示しているか
- [ ] テスト名に「何を・どんな条件で」が込められているか
- [ ] テストが実行順序・他のテストの状態に依存していないか
- [ ] 単体テストの外部依存を Mock・Stub で分離したか
