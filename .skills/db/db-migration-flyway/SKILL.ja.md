---
name: Flyway DB マイグレーション運用標準
description: Flyway ベースの DB スキーマ管理標準。ディレクトリ/命名/チェックサム規則、環境別ポリシー、Zero-downtime マイグレーション、補償マイグレーションによるロールバック、Spring Boot/マルチモジュール統合、CI 検証を扱う。スキーマを変更したり、マイグレーションファイルを作成・レビュー・デプロイする際に読む。キーワード: flyway, migration, V1__, baseline, db.migration, zero-downtime, flyway_schema_history.
rules:
  - "DB スキーマ管理は Flyway で行い、V{バージョン}__{説明}.sql の命名に従う。SQL を人が本番 DB に直接実行しない。"
  - "すでに適用された V ファイルは絶対に修正せず、新しいバージョンを追加する(チェックサム不一致を防ぐ)。"
  - "DROP とデプロイを同一リリースで同時に行わない。"
  - "flyway_schema_history テーブルを手動で触らない(flyway repair のみ使用)。"
  - "カラムの追加・削除は Zero-downtime のため段階的にデプロイする。"
  - "Flyway は自動ロールバックがないため、補償マイグレーションで戻す。"
tags:
  - "flyway"
  - "migration"
  - "V1__"
  - "baseline"
  - "db.migration"
  - "zero-downtime"
  - "flyway_schema_history"
  - "V2__"
  - "FlywayMigration"
---

# 🛫 Flyway DB マイグレーション標準

> すべてのスキーマ変更はバージョン管理されたマイグレーションファイルのみで行う。スキーマを変更したり、マイグレーションファイルを作成・レビュー・デプロイする際に読む。この原則が破られると、環境ごとにスキーマがずれ、ロールバック/再現が不可能になる。

## 1. 中核原則
- DB スキーマ管理は Flyway で行い、`V{バージョン}__{説明}.sql` の命名に従う。SQL を人が本番 DB に直接実行しない。
- すでに適用された `V` ファイルは絶対に修正せず、新しいバージョンを追加する(チェックサム不一致を防ぐ)。
- `DROP` とデプロイを同一リリースで同時に行わない。
- `flyway_schema_history` テーブルを手動で触らない(`flyway repair` のみ使用)。
- カラムの追加・削除は Zero-downtime のため段階的にデプロイする。
- Flyway は自動ロールバックがないため、補償マイグレーションで戻す。

> **Flyway vs Liquibase**: 純粋な SQL をそのままレビュー/デバッグできる Flyway は、コードレビュー・DBA 協業・障害デバッグで有利なため新規プロジェクトの基本。Liquibase(XML/YAML DSL、一部自動ロールバック)はマルチ DBMS 変換が中核の場合のみ検討する。

## 2. 規則

### 2-1. ディレクトリ & 命名
```
src/main/resources/db/migration/
├── V1.0.0__init_schema.sql
├── V1.0.1__create_users.sql
├── V1.0.2__create_orders.sql
├── V1.1.0__add_orders_payment_status.sql
├── V1.2.0__seed_reference_data.sql
└── R__refresh_views.sql            # Repeatable (チェックサムが変わるたびに再実行)
```
- 接頭辞 `V`(Versioned、1 回実行) / `R`(Repeatable、チェックサム変更時に再実行) / `U`(Undo、有料版)。
- バージョン: `V{major}.{minor}.{patch}__{説明}.sql`。アンダースコア **2 個**。
- 説明は `snake_case`、動詞開始を推奨: `create_users`、`add_orders_status_index`、`backfill_user_country`。
- 1 ファイル = 1 つの変更単位。100 行を超えない。

```yaml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false      # 新規は false、既存 DB 導入時のみ true
    validate-on-migrate: true       # チェックサム検証 (prod 必須)
    out-of-order: false             # prod では false、dev/staging のみ true 許可
    placeholder-replacement: false  # ${var} 置換を無効化 (ミス防止)
```

### 2-2. すでに適用された `V` ファイルを修正しない
Flyway は `flyway_schema_history` に各ファイルのチェックサムを保存する。適用済みのファイルを修正すると検証が失敗する。
```
ERROR: Validate failed: Migration checksum mismatch for migration version 1.0.1
-> Applied to database : 1234567890
-> Resolved locally    : 9876543210
```
```sql
-- ❌ 禁止 — V1.0.1__create_users.sql を修正してカラム追加
-- ✅ 推奨 — 新しい V ファイルを追加: V1.0.5__add_users_phone.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

### 2-3. DROP とデプロイを同時に行わない
```sql
-- ❌ 禁止 — V2.0.0__drop_legacy_column.sql
ALTER TABLE users DROP COLUMN old_field;
-- デプロイ中に旧バージョンのインスタンスが old_field を SELECT → 即 500
```
→ Zero-downtime パターン(2-5)で分離する。

### 2-4. 環境別ポリシー
| 環境 | `clean` | `validate` | `out-of-order` | `baseline` |
|---|---|---|---|---|
| local/dev | 許可 | true | true | true (必要時) |
| staging | **禁止** | true | false | false |
| prod | **絶対禁止** (構成で無効化) | true | false | false |

```yaml
# prod 追加保護 — コードからの clean() 呼び出しすら遮断
spring:
  flyway:
    clean-disabled: true
```
> dev では自由に `mvn flyway:clean flyway:migrate` で初期化してよいが、prod には `clean-disabled: true` を打ち込み、誤ってもデータが消えないようにする。`flyway_schema_history` は手で触らず `flyway repair` でのみ処理する。

### 2-5. Zero-downtime マイグレーション
デプロイ中に旧バージョン/新バージョンが同時に起動していても両方が動作しなければならない。カラムの追加/削除を一度に行わない。
```sql
-- カラム追加: nullable → backfill → not null
-- リリース 1: V1.5.0__add_users_country_nullable.sql
ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;
-- リリース 2: V1.5.1__backfill_users_country.sql
UPDATE users SET country = 'KR' WHERE country IS NULL;
-- リリース 3: V1.5.2__alter_users_country_not_null.sql
ALTER TABLE users MODIFY country VARCHAR(2) NOT NULL;
```
```
カラム削除: アプリ変更 → デプロイ → DROP
1) アプリコードから該当カラムの SELECT/INSERT/UPDATE を削除 → デプロイ
2) 一定期間(最低 1 週間)運用の安定性を確認
3) 次のリリースで V x.y.z__drop_users_old_field.sql を適用

カラム rename: 追加 → 二重書き込み → 読み取り切替 → 削除
1) new_name カラムを追加
2) アプリが両方に書き込むよう変更 (二重書き込み)
3) バックフィルで過去データをコピー
4) アプリが new_name を読むよう変更 + old_name 書き込みを削除
5) old_name を DROP
```
> Zero-downtime は「1 デプロイ = 1 マイグレーション」モデルを諦める代わりに、ロールバック可能な小さなステップに分割することである。

### 2-6. ロールバック — 補償マイグレーション
Flyway は自動ロールバックがない(`undo` は有料 Teams Edition で実用性が低い)。標準は補償マイグレーションである。
```sql
-- 失敗した変更: V2.0.0__add_orders_discount.sql
ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;

-- ロールバックが必要なら新しいマイグレーションを追加
-- V2.0.1__revert_orders_discount.sql
ALTER TABLE orders DROP COLUMN discount;
```
- データ変更マイグレーションは事前バックアップ + 検証クエリを PR 本文に添付する。
- 大きな変更は staging で prod サイズの dump で時間を計測する。`ALTER TABLE` が 5 時間かかるケースはよくある。

### 2-7. Spring Boot 統合 & マルチモジュール
```groovy
// build.gradle
implementation 'org.flywaydb:flyway-core'
runtimeOnly  'org.flywaydb:flyway-mysql'  // MariaDB/MySQL 10.x+ は別モジュール必須
```
```yaml
# マルチモジュールで location を分離 — 衝突回避
spring:
  flyway:
    locations:
      - classpath:db/migration/common
      - classpath:db/migration/${MODULE_NAME}    # user / order / payment
    table: flyway_schema_history_${MODULE_NAME}  # モジュール別の履歴テーブルを分離
```
> サービスが自分のスキーマを所有するなら履歴テーブルも分離する。1 つの DB に複数サービスが接続する過渡期には `table` の分離が衝突を防ぐ。

### 2-8. CI/CD での検証
```yaml
# GitHub Actions / GitLab CI ステップ
- name: Flyway validate
  run: ./gradlew flywayValidate -Pflyway.url=$STAGING_DB_URL

- name: Migration dry-run on staging clone
  run: |
    pg_dump prod | psql staging-clone
    ./gradlew flywayMigrate -Pflyway.url=$STAGING_CLONE_URL
```
> PR マージ前に staging clone でマイグレーションを実行し、実行時間/ロック時間/失敗の有無を計測した結果を本文に貼ることを標準手順とする。

## 3. よくあるミス
```sql
-- [アンチ] V ファイルに DML(INSERT/UPDATE)ばかり大量に → 環境ごとに異なって適用される。R__ または別の seed で
-- [アンチ] 大容量テーブルに ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT → ロック + フルスキャン → 運用停止
ALTER TABLE huge_table ADD COLUMN flag BOOLEAN NOT NULL DEFAULT FALSE;
-- [アンチ] 1 つの V ファイルに無関係な変更を複数まとめる → 部分適用のリスク、レビュー難易度が急増
```
```yaml
# [アンチ] prod でチェックサム検証を切る → 意味のないスキーマ管理
spring.flyway.validate-on-migrate: false
```
> コンソールでの `psql -c "ALTER TABLE ..."` 一行が運用事故への最短経路だ。マイグレーションはコード変更である — PR でレビューを受け、CI で検証し、ロールバックを準備する。

## 4. チェックリスト
- [ ] すべてのスキーマ変更を `V{バージョン}__{説明}.sql` ファイルにしたか (直接 SQL 実行は禁止)
- [ ] すでに適用された `V` ファイルを修正せず新しいバージョンを追加したか
- [ ] 1 ファイル = 1 変更単位、100 行以内か
- [ ] DROP/カラム変更を Zero-downtime ステップに分離したか
- [ ] 環境別ポリシー(prod `clean-disabled`、`validate-on-migrate: true`)を適用したか
- [ ] ロールバックが必要な変更に補償マイグレーションとバックアップ/検証クエリを準備したか
- [ ] PR マージ前に staging clone で dry-run により時間/ロック/失敗を計測したか
- [ ] `flyway_schema_history` を手で触らなかったか
