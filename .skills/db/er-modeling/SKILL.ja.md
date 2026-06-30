---
name: ER モデリング規約
description: エンティティ-リレーションシップモデリング、正規化、命名、関係設計の標準(DB 中立)。新しいテーブル・スキーマを設計したり、PK・FK・N:M 関係・正規化レベルを決める際に読む。キーワード: er, entity, relationship, normalization, foreign-key, schema, naming, uuid.
rules:
  - "テーブル・カラム名は snake_case、複数形(users・orders)を使用し、予約語と衝突する名前を避ける。"
  - "主キーは UUID(v7) または auto-increment BIGINT を使用し、ビジネスキー(メール・注文番号)を PK として使用しない。"
  - "第3正規形(3NF)を基本に設計するが、性能が必要なら意図的に非正規化し、理由をコメントで残す。"
  - "FK 制約は必ず宣言して参照整合性を DB が保証するようにする — アプリケーションだけで検証しない。"
  - "N:M 関係は中間テーブル(join table)で解消し、中間テーブルにも監査カラム(created_at)を含める。"
tags:
  - "er"
  - "entity"
  - "relationship"
  - "normalization"
  - "foreign-key"
  - "schema"
  - "naming"
  - "uuid"
---

# 🗂️ ER モデリング規約

> エンティティ-リレーションシップモデリングの命名・正規化・関係設計を統一する。新しいテーブルやスキーマを設計したり、PK・FK・N:M 関係を決める際に読む。

## 1. 中核原則
- テーブル・カラム名は snake_case、複数形(users・orders)を使用し、予約語と衝突する名前を避ける。
- 主キーは UUID(v7) または auto-increment BIGINT を使用し、ビジネスキー(メール・注文番号)を PK として使用しない。
- 第3正規形(3NF)を基本に設計するが、性能が必要なら意図的に非正規化し、理由をコメントで残す。
- FK 制約は必ず宣言して参照整合性を DB が保証するようにする — アプリケーションだけで検証しない。
- N:M 関係は中間テーブル(join table)で解消し、中間テーブルにも監査カラム(created_at)を含める。

## 2. 規則

### 2-1. 命名規則
| 対象 | 規約 | 例 |
|------|--------|------|
| テーブル | snake_case、複数形 | `users`, `order_items` |
| カラム | snake_case | `created_at`, `user_id` |
| PK | `id` | `id UUID PRIMARY KEY` |
| FK | `{table_singular}_id` | `user_id`, `order_id` |
| インデックス | `idx_{table}_{cols}` | `idx_orders_user_status` |
| ユニーク | `uq_{table}_{cols}` | `uq_users_email` |

```sql
-- ❌ 禁止 — 単数形・camelCase・ビジネスキーを PK として使用
CREATE TABLE User (userEmail VARCHAR(200) PRIMARY KEY);

-- ✅ 推奨 — 複数形・snake_case・代理キー(PK)
CREATE TABLE users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL
);
```

### 2-2. 基本テーブル構造
```sql
CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  category_id  UUID NOT NULL REFERENCES categories(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP   -- soft delete
);
```

### 2-3. N:M 関係 (中間テーブル)
```sql
-- ユーザー ↔ ロール (N:M)
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

### 2-4. 正規化レベル
```
1NF: 原子値、繰り返しグループの除去
2NF: 部分関数従属の除去 (複合 PK の場合)
3NF: 推移関数従属の除去 (A→B→C で B,C を分離)

非正規化の例: 集計値のキャッシュ (order.total_amount)
  → 理由: 毎回 SUM(order_items.price) はコストが大きい。
```

### 2-5. FK 動作ポリシー
| ポリシー | 説明 | 使用時点 |
|------|------|-----------|
| RESTRICT | 参照行があれば削除を拒否 | デフォルト推奨 |
| CASCADE | 親の削除時に子も削除 | 依存データ |
| SET NULL | 親の削除時に FK を NULL に | 任意参照 |

## 3. よくあるミス
- ビジネスキー(メール・注文番号)を PK として使用 → 値が変わると参照が壊れる。
- FK 制約を宣言せずアプリケーションだけで検証 → 整合性が保証されない。
- 理由のない非正規化 → データ不整合の原因になる。
- 中間テーブルに監査カラムの欠落 → 関係の生成時点を追跡できない。

## 4. チェックリスト
- [ ] テーブル・カラム名が snake_case、複数形か
- [ ] PK が代理キー(UUID/BIGINT)でビジネスキーを使っていないか
- [ ] 基本は 3NF、非正規化には理由コメントがあるか
- [ ] FK 制約を宣言し動作ポリシー(RESTRICT/CASCADE/SET NULL)を決めたか
- [ ] N:M を中間テーブルで解消し監査カラムを含めたか
