---
name: Soft Delete & 監査カラム
description: 論理削除・作成/更新/削除の監査カラム・変更履歴の汎用(foundational)標準 — 物理削除の代わりに `deleted_at`、監査カラムの自動更新、アクティブレコードのデフォルトフィルタ、削除を除外した条件付きユニーク、履歴の保存。削除・監査カラムを設計するとき、または削除レコードがユニーク制約と衝突するときに読む(カラム命名・型は `db-common-conventions`)。キーワード: soft-delete, deleted_at, audit, history, partial unique, 履歴テーブル。
rules:
  - "物理削除ではなく論理削除: ビジネスデータは行を消さず「削除時刻」の表示で論理削除する。永久削除は別のアーカイブ/クリーンアップのプロセスでのみ処理する — 復旧・監査の可能性を残す。"
  - "監査カラムはすべてのドメインテーブル共通: 作成/更新/削除の「いつ・誰が」を標準カラム(created_at/updated_at/deleted_at、created_by/updated_by/deleted_by)としてすべてのドメインテーブルに置く。削除フラグは nullable timestamp deleted_at(NULL=アクティブ)を使う — ブール値ではない。カラム命名・型の規約そのものは db-common-conventions スキルに従う。"
  - "監査カラムは自動更新: updated_at のような値は手動更新に頼らず、DB トリガーまたは ORM/アプリケーションのフックで自動的に埋める — 一部の経路で抜けないようにする。"
  - "アクティブレコードのデフォルトフィルタ: 「削除されていない行だけ」という条件をデフォルトクエリに含め、可能なら ORM のグローバルスコープなどで自動適用し、誤って削除行が露出しないようにする。"
  - "削除レコードを除外したユニーク: 自然キー(メールなど)のユニーク制約は「アクティブレコード限定」で掛ける — 削除後に同じ値で再登録するときに衝突しないようにする。"
  - "変更履歴は別テーブル: 重要なデータの変更追跡が必要なら、履歴テーブル(audit_log または *_history サフィックス)を別に運用する。"
  - "無限増殖の防止: 論理削除だけしてクリーンアップしないとテーブルが無限に大きくなる。保存期間・アーカイブ・クリーンアップの方針を併せて定める。"
tags:
  - "soft-delete"
  - "deleted_at"
  - "audit"
  - "history"
  - "partial unique"
  - "이력 테이블"
  - "created_at"
  - "updated_at"
  - "logical-delete"
foundational: true
---

# 🗑️ Soft Delete & 監査カラム

> データを物理削除せず、論理削除・監査・履歴追跡する標準を定める。ドメインテーブルを設計するとき、または変更履歴・削除方針を定めるときに読む。特定の DB/ORM に依存しない汎用標準である。

## 1. 核心原則
- **物理削除ではなく論理削除**: ビジネスデータは行を消さず「削除時刻」の表示で論理削除する。永久削除は別のアーカイブ/クリーンアップのプロセスでのみ処理する — 復旧・監査の可能性を残す。
- **監査カラムはすべてのドメインテーブル共通**: 作成/更新/削除の「いつ・誰が」を標準カラム(`created_at`/`updated_at`/`deleted_at`、`created_by`/`updated_by`/`deleted_by`)としてすべてのドメインテーブルに置く。削除フラグは nullable timestamp `deleted_at`(NULL=アクティブ)を使う — ブール値ではない。カラム命名・型の規約そのものは `db-common-conventions` スキルに従う。
- **監査カラムは自動更新**: `updated_at` のような値は手動更新に頼らず、DB トリガーまたは ORM/アプリケーションのフックで自動的に埋める — 一部の経路で抜けないようにする。
- **アクティブレコードのデフォルトフィルタ**: 「削除されていない行だけ」という条件をデフォルトクエリに含め、可能なら ORM のグローバルスコープなどで自動適用し、誤って削除行が露出しないようにする。
- **削除レコードを除外したユニーク**: 自然キー(メールなど)のユニーク制約は「アクティブレコード限定」で掛ける — 削除後に同じ値で再登録するときに衝突しないようにする。
- **変更履歴は別テーブル**: 重要なデータの変更追跡が必要なら、履歴テーブル(`audit_log` または `*_history` サフィックス)を別に運用する。
- **無限増殖の防止**: 論理削除だけしてクリーンアップしないとテーブルが無限に大きくなる。保存期間・アーカイブ・クリーンアップの方針を併せて定める。

> 入力検証・エラー応答などの入口の標準は `validation-bean` スキルに従う。このスキルはデータモデル(削除・監査・履歴)に集中する。

## 2. ルール

### 2-1. 標準監査カラムをすべてのドメインテーブルに置く
- 作成/更新/削除の「いつ(時刻)」と「誰が(行為者)」を標準カラムとして一貫して置く。
- `deleted_at`(または同等の削除時刻/フラグ)は、**空ならアクティブ、埋まっていれば削除済み**を意味する。

```text
// ✅ 推奨 — すべてのドメインテーブルが共有する監査カラム(標準 SQL 疑似表現)
TABLE <ドメイン>:
  id           <識別子>  PRIMARY KEY
  ...業務カラム...

  created_at   TIMESTAMP   NOT NULL   -- 作成時刻
  updated_at   TIMESTAMP   NOT NULL   -- 最終更新時刻(自動更新)
  created_by   <識別子>               -- 作成者
  updated_by   <識別子>               -- 最終更新者
  deleted_at   TIMESTAMP   NULL       -- NULL=アクティブ、NOT NULL=削除済み
  deleted_by   <識別子>   NULL        -- 削除者
```

### 2-2. updated_at など監査カラムは自動更新
- 更新時刻を呼び出し側ごとに手で埋めない — 一つの経路でも抜ければ信頼できないカラムになる。
- DB トリガー(更新直前に自動セット)または ORM/アプリケーションのフックのうち、チーム標準の一つで一貫して自動化する。

```text
// ❌ 禁止 — 更新ごとに手で更新(漏れが発生)
UPDATE <ドメイン> SET name = ?, updated_at = <今> WHERE id = ?   -- どこかで抜ける

// ✅ 推奨 — 更新時に updated_at を自動的に埋める(トリガー/ORM フック)
ON UPDATE <ドメイン>: set updated_at = <今>   // すべての更新経路に自動適用
UPDATE <ドメイン> SET name = ? WHERE id = ?      // updated_at は自動
```

### 2-3. 削除は論理削除、クエリはアクティブレコードのデフォルトフィルタ
- 物理削除(`DELETE`)の代わりに削除時刻を埋める。デフォルトクエリは「削除されていない行だけ」を見る。
- 可能ならアクティブフィルタを ORM のグローバルスコープなどで自動適用し、削除を含むクエリは管理者/監査などの明示的な経路でのみ許可する。

```text
// ❌ 禁止 — 物理削除(復旧・監査不可)
DELETE FROM <ドメイン> WHERE id = ?

// ✅ 推奨 — 論理削除
UPDATE <ドメイン> SET deleted_at = <今>, deleted_by = ? WHERE id = ?

// アクティブレコードのみクエリ(デフォルト — 可能なら自動フィルタ)
SELECT * FROM <ドメイン> WHERE deleted_at IS NULL

// 削除を含むクエリ(管理者/監査 — 明示的な経路でのみ)
SELECT * FROM <ドメイン>
```

### 2-4. ユニーク制約は削除レコードを除外
- 自然キー(メール・コードなど)に「全行」ユニークを掛けると、削除後に同じ値で再登録するときに削除済みの行と衝突する。
- ユニークは「アクティブレコード限定」で掛ける。DB が条件付き(部分)ユニークインデックスをサポートするならそれを、なければ同等の手段(例: ユニークキーに削除表示を含める)を使う。

```text
// ❌ 禁止 — 全体ユニーク: 削除済みの行と再登録が衝突
UNIQUE (email)

// ✅ 推奨 — email はアクティブレコードでのみユニーク(条件付き/部分ユニーク)
UNIQUE (email) WHERE deleted_at IS NULL
```

### 2-5. 変更履歴は別の履歴テーブルへ
- 重要なデータの変更追跡が必要なら、本テーブルに押し込まず履歴テーブルを別に運用する(`audit_log` または `*_history`)。
- 履歴には最低限「何を(action)・いつ(時刻)・誰が(行為者)・内容(変更された行のスナップショット)」を残す。スナップショットの保存形式(ドキュメント/JSON/カラム展開)はチームの DB 能力に合わせる。

```text
// ✅ 推奨 — 変更履歴テーブル(標準 SQL 疑似表現)
TABLE <ドメイン>_history:
  history_id   <自動増分識別子>  PRIMARY KEY
  action       VARCHAR   NOT NULL    -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP             -- 変更時刻
  changed_by   <識別子>              -- 変更者
  row_data     <行スナップショット>   -- 変更前/後の全行(ドキュメント/JSON/展開カラム)
```

## 3. よくある間違い
- **デフォルトクエリにアクティブフィルタの欠落** → 削除済みレコードがそのまま露出する。「削除されていない行だけ」をデフォルトで(可能なら自動で)適用する。
- **全体ユニーク制約** → 削除後に同じ値で再登録するときに衝突する。アクティブレコード限定ユニークに。
- **`updated_at` の手動更新への依存** → 一部の経路で抜けて信頼できなくなる。トリガー/ORM フックで自動化する。
- **アーカイブ・クリーンアップの不在** → 論理削除だけが積み上がりテーブルが無限に大きくなる。保存・クリーンアップの方針を併せて定める。
- **監査カラム名がばらばら** → テーブルごとに異なる名前を使うと共通処理・クエリが難しい。チームで一つに統一する。

## 4. チェックリスト
- [ ] ビジネスデータを物理削除ではなく**論理削除**(削除時刻/フラグ)しているか
- [ ] すべてのドメインテーブルに作成/更新/削除の**監査カラム**があり、名前が統一されているか
- [ ] `updated_at` など更新時刻が**トリガー/ORM フックで自動更新**されるか
- [ ] デフォルトクエリが**アクティブレコードのみ**(削除を除外)見るよう(可能なら自動で)フィルタされるか
- [ ] ユニーク制約が**削除レコードを除外**(アクティブ限定)するか
- [ ] 変更履歴が必要なテーブルに**履歴テーブル**を別に運用しているか
- [ ] 論理削除データの**保存・アーカイブ・クリーンアップの方針**があるか

## 付録: スタック別の例

> 以下は上記 1〜4 の標準の PostgreSQL 実装例である(概念・ルールの説明は本文参照)。チームが使う DB(例: MySQL、Oracle、SQL Server、SQLite など)に合う例を同じパターンで追加する。

### PostgreSQL

PostgreSQL は `gen_random_uuid()`、`plpgsql` トリガー、部分ユニークインデックス(`WHERE`)、`JSONB` などを標準で提供する。

```sql
-- 標準監査カラム (2-1)
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR NOT NULL,
  name        VARCHAR NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES users(id),
  updated_by  UUID REFERENCES users(id),
  deleted_at  TIMESTAMP,          -- NULL = アクティブ、NOT NULL = 削除済み
  deleted_by  UUID REFERENCES users(id)
);

-- updated_at 自動更新トリガー (2-2)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 論理削除 + アクティブフィルタ (2-3)
UPDATE users SET deleted_at = NOW(), deleted_by = $user WHERE id = $id;
SELECT * FROM users WHERE deleted_at IS NULL;

-- アクティブレコード限定ユニーク (2-4) — 部分ユニークインデックス
CREATE UNIQUE INDEX ON users(email) WHERE deleted_at IS NULL;

-- 変更履歴テーブル (2-5) — スナップショットは JSONB
CREATE TABLE users_history (
  history_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action       VARCHAR NOT NULL,  -- INSERT | UPDATE | DELETE
  changed_at   TIMESTAMP DEFAULT NOW(),
  changed_by   UUID,
  row_data     JSONB              -- 変更前の全行
);
```
