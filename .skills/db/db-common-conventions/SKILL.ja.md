---
name: リレーショナルDB共通 命名/型 標準 (Relational DB Conventions)
description: すべてのリレーショナルDBに同一適用する汎用(foundational)な命名・共通カラム・データ型の単一規格。新規テーブル/カラムを設計するとき、略語カラムなどのレガシーを移行するとき、ばらついた命名を統一するときに読む。dialectの差異は専用スキルへ、論理削除・監査は `soft-delete-audit` へ委譲する。キーワード: snake_case, primary key, foreign key, naming, common columns, created_at, deleted_at, data type, decimal。
rules:
  - "命名は一つの規格で: テーブル名は複数形 snake_case、カラム名は単数形 snake_case。接頭辞(TB_, tb_ など)・大文字・略語を混ぜない。"
  - "キーは一貫した形式で: PKは id、FKは 参照テーブル単数_id 形式で統一する。意味が変わりうる自然キー(メール・社員番号)をPKに使わない。"
  - "名前は意味を表す: 略語カラム名を禁止し全体の単語を使う — 名前だけで何かが分かるようにする。"
  - "共通カラムを強制する: すべてのテーブルに作成/更新時刻・作成者などの共通カラムを置く。監査(audit)情報なしで運用しない。"
  - "削除は論理削除が基本: 物理削除の代わりに削除時刻(deleted_at)を埋め、照会は常に「生きている行」(deleted_at IS NULL)だけを見る。監査追跡と参照整合性を保つ(パターン詳細は soft-delete-audit)。"
  - "型は安全な既定値で: 金額は浮動小数点でなく固定小数点、真/偽は専用のブーリアン型、キーは十分に大きい整数型/識別子型を使う。"
  - "製品・ツール依存は委譲する: ページング・UPSERT・自動増分キーのようなdialect差異、マッパー/ORMマッピングのようなツールの使い方は本文ではなく各専用スキル・付録に回す。"
tags:
  - "snake_case"
  - "primary key"
  - "foreign key"
  - "naming"
  - "common columns"
  - "created_at"
  - "deleted_at"
  - "data type"
  - "decimal"
  - "varchar"
  - "updated_at"
foundational: true
---

# 🗄️ リレーショナルDB共通 命名/型 標準

> すべてのリレーショナルDBで同一に適用する命名・共通カラム・型選択の単一標準(Single Source of Truth)。新規テーブル/カラムを設計するとき、レガシーの略語カラムを移行するとき、チーム・製品ごとにばらついた命名を統一するときに読む。特定のDB製品やマッパー/ORMツール・言語に依存しない汎用標準である。

## 1. 目的

- テーブル・カラム・インデックスの命名を **一つの規格** に統一し、人・チーム・DB製品ごとに異なる名付けで生じた混乱(`snake_case`/`PascalCase`、接頭辞の有無など)をなくす。
- すべてのテーブルが同一の **共通カラム** と **論理削除** ポリシーに従うようにし、監査追跡と照会の一貫性を保証する。
- データ型選択の普遍的原則を定め、金額の丸め誤差・型ミスマッチのような繰り返す事故を防ぐ。
- 製品(dialect)・ツール(マッパー/ORM)依存の詳細を本文から外して各専用スキル・付録に委譲し、この文書が **どのスタックでも読める共通規格** として残るようにする。

## 2. 中核原則

- **命名は一つの規格で**: テーブル名は複数形 `snake_case`、カラム名は単数形 `snake_case`。接頭辞(`TB_`、`tb_` など)・大文字・略語を混ぜない。
- **キーは一貫した形式で**: PKは `id`、FKは `参照テーブル単数_id` 形式で統一する。意味が変わりうる自然キー(メール・社員番号)をPKに使わない。
- **名前は意味を表す**: 略語カラム名を禁止し全体の単語を使う — 名前だけで何かが分かるようにする。
- **共通カラムを強制する**: すべてのテーブルに作成/更新時刻・作成者などの共通カラムを置く。監査(audit)情報なしで運用しない。
- **削除は論理削除が基本**: 物理削除の代わりに削除時刻(`deleted_at`)を埋め、照会は常に「生きている行」(`deleted_at IS NULL`)だけを見る。監査追跡と参照整合性を保つ(パターン詳細は `soft-delete-audit`)。
- **型は安全な既定値で**: 金額は浮動小数点でなく固定小数点、真/偽は専用のブーリアン型、キーは十分に大きい整数型/識別子型を使う。
- **製品・ツール依存は委譲する**: ページング・UPSERT・自動増分キーのようなdialect差異、マッパー/ORMマッピングのようなツールの使い方は本文ではなく各専用スキル・付録に回す。

## 3. ルール

### 3-1. テーブル命名 — 複数形 snake_case、接頭辞・略語禁止

結合(N:M)テーブルは2つのテーブル名をアルファベット順に連結する。

```text
// ✅ 推奨
users
asset_logs
order_items
user_roles          // N:M 結合テーブル (users × roles)

// ❌ 禁止 (即時リファクタリング)
TB_USER             // 接頭辞 + 大文字 + 単数
tbl_orders          // 接頭辞
UserAccount         // PascalCase
usr                 // 略語
```

### 3-2. カラム命名 — PK/FK/一般

| 種類 | ルール | 例 |
|---|---|---|
| PK (単一PK推奨) | `id` または `<単数>_id` | `users.id` または `users.user_id` |
| FK | 参照テーブル単数 + `_id` | `orders.user_id` → `users.id` |
| 一般カラム | `snake_case`、名詞 | `email`、`total_amount` |
| ブーリアン | `is_*` / `has_*` | `is_active`、`has_paid` |
| 日付時刻 | `*_at` (時刻) / `*_on` (日付) | `created_at`、`deleted_at`、`birth_on` |

```text
// ✅ 推奨 — 一貫したキー・ブーリアン・時刻の命名
table orders:
  id            PK
  user_id       FK → users.id
  total_amount  固定小数点の金額
  is_paid       ブーリアン (既定 false)
  paid_at       時刻 (nullable)

// ❌ 禁止 — 略語キー、Y/N フラグ、曖昧な日付カラム
table orders:
  ordr_id, usr_id, amt, pay_yn('Y'/'N'), pay_dt
```

### 3-3. 略語カラム名の禁止 — フルネームを使う

レガシーで最も多い可読性破壊パターン。新規スキーマでは無条件に禁止し、移行時には **最初の作業** としてフルネームに変える。

| ❌ 禁止略語 | ✅ フルネーム | 備考 |
|---|---|---|
| `user_nm` | `user_name` | `_nm` は意味が曖昧 |
| `reg_dt`、`upd_dt` | `created_at`、`updated_at` | `_dt` は日付/時刻が不明確 |
| `del_yn` (`'Y'`/`'N'`) | `deleted_at` (nullable 時刻) | 文字 Y/N はインデックス・条件式で非効率、削除時刻も残せない |
| `use_yn` | `deleted_at` | 有効/削除は削除時刻で表現 |
| `tel_no` | `phone_number` | |
| `cust_cd` | `customer_code` | |

```text
// ❌ 禁止 — 略語の連発
table tb_user:
  user_id, user_nm, use_yn('Y'/'N'), reg_dt, upd_dt

// ✅ 推奨 — フルネーム + 共通カラム
table users:
  id            PK
  user_name
  email
  created_at, updated_at
  created_by, updated_by
  deleted_at, deleted_by   // NULL=有効、NOT NULL=削除済み
```

### 3-4. 共通カラム — すべてのテーブルに強制

すべてのテーブルに以下の意味のカラムを置く(名前はこの標準に従う)。

| カラム | 意味 |
|---|---|
| `created_at` | 作成時刻 |
| `updated_at` | 更新時刻 |
| `created_by` | 作成者識別子 (nullable) |
| `updated_by` | 更新者識別子 (nullable) |
| `deleted_at` | 論理削除時刻 (nullable timestamp、`NULL`=有効・`NOT NULL`=削除済み) |
| `deleted_by` | 削除者識別子 (nullable) |

- **削除フラグは `deleted_at`(nullable timestamp)に統一する**: ブーリアン `is_deleted` の代わりに削除時刻を埋め、「削除済み」と「いつ削除されたか」を一つのカラムで残す。物理削除の代わりに `deleted_at` を埋め、すべての照会に「削除されていない行」(`deleted_at IS NULL`)条件を強制する。論理削除・監査パターンの詳細は `soft-delete-audit` スキルに従う。
- **作成者(`created_by`/`updated_by`)は自動注入**: 認証コンテキストから横取りして埋める(例: 永続層インターセプター・横断的関心事)。コントローラー/サービスが直接埋めない — 実装手段はチームのスタックに委譲する。

```text
// ❌ 禁止 — 監査カラムなし + 物理削除
table products: id, name, price          // created_at/updated_at なし
DELETE FROM products WHERE id = ?         // 痕跡なく消える

// ✅ 推奨 — 共通カラム + 論理削除
table products: id, name, price, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by
UPDATE products SET deleted_at = <現在>, deleted_by = ? WHERE id = ?
SELECT ... FROM products WHERE deleted_at IS NULL   // 照会は常に生きている行のみ
```

### 3-5. インデックス / 制約の命名

| 種類 | 形式 | 例 |
|---|---|---|
| インデックス | `idx_<テーブル>_<カラム群>` | `idx_orders_user_id_created_at` |
| ユニークインデックス | `ux_<テーブル>_<カラム群>` | `ux_users_email` |
| FK制約 | `fk_<テーブル>_<参照テーブル>` | `fk_orders_user` |
| CHECK制約 | `ck_<テーブル>_<カラム>` | `ck_orders_total_amount` |

```text
// ✅ 推奨 — 一目で種類・対象が読める名前
idx_orders_user_id_created_at   on orders(user_id, created_at desc)
ux_users_email                  on users(email)

// ❌ 禁止 — 自動生成された意味のない名前 / 種類不明
orders_idx1, SYS_C0012345
```

### 3-6. データ型選択 — 安全な既定値

| 用途 | 推奨 | ❌ 避ける |
|---|---|---|
| PK / FK | 大きい整数型(例: 64-bit)または識別子(UUID) | 小さい整数型(範囲限界) |
| 短い文字列 | 可変長文字列、長さ上限を統一(例: 255) | 無制限/まちまちの長さ |
| コード値 | 短い可変文字列(例: 50) | |
| 長いテキスト | 大容量テキスト型 | |
| **金額** | **固定小数点(decimal/numeric)** | **浮動小数点(float/double) — 丸め誤差** |
| 真/偽 | 専用のブーリアン型 | 文字 `'Y'`/`'N'` (インデックス・条件式で非効率) |
| 日付時刻 | 時刻型 (UTC保存を推奨) | |
| 日付のみ | 日付型 | |

- **金額に浮動小数点を禁止**: `0.1 + 0.2 = 0.30000000000000004` のような誤差が会計事故につながる。常に固定小数点。
- **真/偽はブーリアン型**: 文字 Y/N はカーディナリティが低く、大文字小文字のヒューマンエラー(`'y'`)が起きる。
- **タイムゾーンはUTC保存**: サーバー・DB・ランタイムをUTCで保存し、表示時点でのみ地域時刻に変換する。具体的な型・セッションタイムゾーン処理はdialect差異である(下記 3-7 へ委譲)。

```text
// ❌ 禁止
amount  float                 // 丸め誤差
is_paid char(1) 'Y'/'N'       // インデックス/条件式で非効率
id      int                   // 範囲限界

// ✅ 推奨
amount  decimal(15,2)
is_paid boolean
id      bigint (または uuid)
```

### 3-7. dialect・ツール差異は専用スキルへ委譲

この文書は **共通規格のみ** を扱う。製品(dialect)別の文法やツールの使い方は本文に書かず、各専用スキルを見る。

| 項目 | どこで扱うか |
|---|---|
| ページング、UPSERT、自動増分PK、ブーリアン/時刻の具体的な型 | 各dialect専用スキル (例: PostgreSQL/MySQL/Oracle スキル) |
| トランザクション・ロック | `transaction-locking` スキル |
| コネクションプール | `connection-pool-tuning` スキル |
| マイグレーション | `db-migration-flyway` スキル |
| マッパー/ORMマッピング・共通句の中央集約 | 付録のスタック別例 (下記) |

## 4. よくある間違い

- **略語の連発**: `tb_usr(usr_nm, reg_dt, use_yn)` — 新規スキーマで禁止、フルネームに。
- **真/偽を文字 Y/N で**: `WHERE use_yn = 'Y'` — インデックスのカーディナリティが低く小文字 `'y'` のヒューマンエラー。ブーリアン型に。
- **自然キーをPKに**: メール・社員番号をPKに使うと値の変更が不可になり、FK伝播コストが急増する。
- **金額に浮動小数点**: `0.1 + 0.2 = 0.30000000000000004` の丸め誤差。
- **物理削除**: 痕跡なく消えて監査追跡が不能になり、参照整合性が壊れる。論理削除に。
- **照会で削除条件の漏れ**: `deleted_at IS NULL` を抜かして削除済みの行まで照会される。
- **共通カラムの欠落**: 作成/更新時刻・作成者なしで作ると事後の監査・追跡が不能。
- **dialect文法を共通規格に埋め込む**: 特定製品専用の文法をこの文書に書くと他製品で壊れる — 専用スキルへ委譲。

## 5. チェックリスト

- [ ] テーブル=複数形 `snake_case`、接頭辞なし、カラム=単数形 `snake_case` か
- [ ] PKは `id`、FKは `参照テーブル単数_id` 形式か (自然キーPKでない)
- [ ] 略語カラム(`_nm`、`_dt`、`_yn` など)なしにフルネームを使ったか
- [ ] 共通カラム(`created_at`、`updated_at`、`created_by`、`updated_by`、`deleted_at`、`deleted_by`)をすべて入れたか
- [ ] 物理削除の代わりに論理削除(`deleted_at` 埋め)を適用したか
- [ ] すべての照会に「削除されていない行」条件(`deleted_at IS NULL`)が含まれているか
- [ ] インデックス/制約の接頭辞(`idx_`/`ux_`/`fk_`/`ck_`)に従ったか
- [ ] 金額は固定小数点、真/偽はブーリアン、PKは大きい整数型/UUID か
- [ ] dialect・ツール依存の詳細(ページング・UPSERT・マッパー設定など)を専用スキル/付録へ委譲したか

## 付録: スタック別例

> 以下は参考用の実装例である。上記 1〜5 の原則・ルールが標準であり、付録はその適用事例にすぎない。**チームが使うスタック(マッパー/ORM・言語)に合う例を同じパターンで追加** する。

### MyBatis (Java)

永続層で `resultMap` と `<sql>`/`<include>` でマッピングと共通句を中央集約する。カラムが変わっても一箇所だけ直せば全Mapperに反映される。

```yaml
mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # user_name → userName (全プロジェクト統一)
    default-statement-timeout: 30
    jdbc-type-for-null: NULL              # Oracle 互換
    cache-enabled: false                  # 2次キャッシュは別のキャッシュレイヤーで
```
```xml
<!-- ✅ resultMap: 単純なマッピングでも常に書く (JOIN 拡張に備える) -->
<resultMap id="userResultMap" type="com.example.dto.UserResponse">
    <id     property="id"         column="id"/>
    <result property="userName"   column="user_name"/>
    <result property="email"      column="email"/>
    <result property="createdAt"  column="created_at"/>
</resultMap>

<!-- ✅ 共通カラムのSELECT句は <sql> に抽出して中央集約 -->
<sql id="userColumns">
    id, user_name, email, created_at, updated_at, deleted_at
</sql>
<sql id="activeWhere">
    AND deleted_at IS NULL
</sql>

<select id="findById" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id = #{id}
       <include refid="activeWhere"/>
</select>

<!-- IN句の動的処理 -->
<select id="findByIds" resultMap="userResultMap">
    SELECT <include refid="userColumns"/>
      FROM users
     WHERE id IN
     <foreach collection="ids" item="id" open="(" separator="," close=")">
         #{id}
     </foreach>
     <include refid="activeWhere"/>
</select>
```
> `<sql>` + `<include>` でSELECTカラムと共通WHERE句を中央集約すれば、カラム追加時に一箇所だけ直せば全Mapperに反映される。

#### MyBatis特有のよくある間違い
- **`resultMap` なしで `SELECT *` の自動マッピングに依存** — カラム追加時に運用段階でマッピング崩れを発見する。単純なマッピングでも `resultMap` を書く。
- **共通WHERE句の未中央集約** — `deleted_at IS NULL` をMapperごとに直接書いて漏れが生じる。`<sql>`/`<include>` で中央集約する。
