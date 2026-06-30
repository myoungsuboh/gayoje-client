---
name: PostgreSQL + TimescaleDB 設計 (時系列ドメイン)
description: 時系列データ(IIoTセンサー/イベント)を扱う PostgreSQL + TimescaleDB 専用の設計ガイド。ハイパーテーブル・インデックス・MyBatisマッピング・Flywayマイグレーションを設計する際に読む。一般的なRDBMS共通の命名・カラム規約は db-common-conventions が単一の出典。キーワード: primary key, foreign key, normalize, snake_case, schema, constraint, hypertable, TimescaleDB。
rules:
  - "時系列センサー・イベントデータは PostgreSQL + TimescaleDB のハイパーテーブルに保存する。"
  - "テーブル・カラムの命名は db-common-conventions の標準に従う。"
  - "すべてのテーブルに作成・更新時刻などの共通カラムを含める。"
  - "照会パターンに合わせて複合インデックスを設計する。"
  - "DBスキーマ変更は Flyway マイグレーションで構成管理する。"
tags:
  - "primary key"
  - "foreign key"
  - "normalize"
  - "snake_case"
  - "schema"
  - "constraint"
  - "hypertable"
  - "TimescaleDB"
---

# 🐘 PostgreSQL + TimescaleDB 設計

> 時系列センサー・イベントデータを PostgreSQL + TimescaleDB で設計する。ハイパーテーブル・インデックス・MyBatisマッピング・Flywayマイグレーションを設計する際に読む。

> **共通規約の単一の出典**: テーブル/カラムの命名、共通カラム(`created_at` など)、MyBatisマッピングなど、RDBMS非依存のルールは `db-common-conventions` スキルにある。このファイルは **PostgreSQL/TimescaleDB特化の内容** のみを扱う。他のdialectファイル(`mariadb-mybatis`、`oracle-mybatis` など)と命名規則が衝突する場合は **`db-common-conventions` が優先** される。関連スキル: トランザクション/ロックは `transaction-locking`、HikariCPチューニングは `connection-pool-tuning`、マイグレーションは `db-migration-flyway`。

## 1. 中核原則
- 時系列センサー・イベントデータは PostgreSQL + TimescaleDB のハイパーテーブルに保存する。
- テーブル・カラムの命名は `db-common-conventions` の標準に従う。
- すべてのテーブルに作成・更新時刻などの共通カラムを含める。
- 照会パターンに合わせて複合インデックスを設計する。
- DBスキーマ変更は Flyway マイグレーションで構成管理する。

## 2. ルール

### 2-1. テーブル命名規則 (要約 — 単一の出典は db-common-conventions)
- テーブル名: 小文字 + `snake_case` + 複数形。接頭辞(`tb_`、`TB_`)は **禁止**。
- カラム名: 小文字 + `snake_case`。略語(`_nm`、`_dt`、`use_yn`)は **禁止**。
- Primary Key: 単一テーブル単位の `id`、または参照の明確化が必要なら `<単数>_id`(例: `user_id`)。
- Javaフィールド名(camelCase)↔ DBカラム名(snake_case)のマッピングは `mybatis.configuration.map-underscore-to-camel-case: true` で自動処理。

```sql
-- ✅ 良い例
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL       PRIMARY KEY,
    tag_id          VARCHAR(50)     NOT NULL UNIQUE,
    asset_name      VARCHAR(200)    NOT NULL,
    deck_id         VARCHAR(20),
    sap_asset_id    VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ                              -- 論理削除: NULL=有効
);

-- ❌ 悪い例 (単数形、大文字の混在)
CREATE TABLE AssetMaster (
    id      INT PRIMARY KEY,
    TagId   VARCHAR(50)
);
```

### 2-2. 共通カラム (すべてのテーブルに既定で含める)
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 作成時刻
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 更新時刻
deleted_at  TIMESTAMPTZ                          -- 論理削除: NULL=有効 (db-common-conventions 標準)
```

### 2-3. インデックス戦略
WHERE条件によく使われるカラムにインデックスを張る。インデックスが多すぎるとINSERT/UPDATEの速度が低下するので、本当に必要なものだけを張る。
```sql
-- 単一カラムインデックス
CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);

-- 複合インデックス (2つのカラムを一緒に照会するとき)
CREATE INDEX idx_sensors_deck_time ON sensor_time_series(deck_id, measured_at DESC);

-- 部分インデックス (削除されていないデータのみ)
CREATE INDEX idx_assets_active ON asset_masters(tag_id) WHERE deleted_at IS NULL;
```

### 2-4. TimescaleDB 時系列データ処理
センサーデータのように時間順に蓄積されるデータには TimescaleDB のハイパーテーブルを使う。
```sql
-- 1. まず通常のテーブルを作成
CREATE TABLE sensor_time_series (
    sensor_id    VARCHAR(50)      NOT NULL,
    deck_id      VARCHAR(20)      NOT NULL,
    value        DOUBLE PRECISION,
    unit         VARCHAR(20),
    measured_at  TIMESTAMPTZ      NOT NULL
);

-- 2. ハイパーテーブルへ変換 (時間カラム基準で自動パーティショニング)
SELECT create_hypertable('sensor_time_series', 'measured_at');

-- 3. Deck IDベースの空間パーティショニングを追加 (クエリ性能向上)
SELECT add_dimension('sensor_time_series', 'deck_id', number_partitions => 8);

-- 4. データ保持ポリシー (2年以降は自動削除)
SELECT add_retention_policy('sensor_time_series', INTERVAL '2 years');
```

### 2-5. MyBatis Mapper XML と DBカラムの連携
DBカラム名(snake_case)とJavaフィールド名(camelCase)は `<resultMap>` で明示的にマッピングする。`application.yml` に `map-underscore-to-camel-case: true` を設定すると自動変換されるが、複雑なクエリやJOINがある場合は `<resultMap>` を直接書くほうが明確である。
```xml
<!-- 基本 ResultMap -->
<resultMap id="assetResultMap" type="com.harness.dto.response.AssetResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <result property="deckId"    column="deck_id" />
    <result property="sapAssetId" column="sap_asset_id" />
    <result property="createdAt" column="created_at" />
</resultMap>

<!-- JOINがある場合 - association で関連オブジェクトをマッピング -->
<resultMap id="assetDetailResultMap" type="com.harness.dto.response.AssetDetailResponse">
    <id     property="assetId"   column="asset_master_id" />
    <result property="tagId"     column="tag_id" />
    <result property="assetName" column="asset_name" />
    <!-- 関連オブジェクト (1:1) -->
    <association property="sensorInfo" javaType="com.harness.dto.response.SensorInfoResponse">
        <result property="sensorId"   column="sensor_id" />
        <result property="protocol"   column="protocol" />
    </association>
    <!-- 関連コレクション (1:N) -->
    <collection property="anomalyEvents" ofType="com.harness.dto.response.AnomalyEventResponse">
        <result property="eventId"    column="event_id" />
        <result property="score"      column="anomaly_score" />
    </collection>
</resultMap>
```

### 2-6. 動的クエリパターン (MyBatis)
検索条件があるときだけ WHERE 句を追加する動的クエリの書き方である。
```xml
<!-- 検索条件DTOを受け取って動的にクエリを生成 -->
<select id="findByCondition" parameterType="com.harness.dto.request.AssetSearchRequest"
        resultMap="assetResultMap">
    SELECT asset_master_id
         , tag_id
         , asset_name
         , deck_id
      FROM asset_masters
     <where>
           deleted_at IS NULL
        <if test="deckId != null and deckId != ''">
           AND deck_id = #{deckId}
        </if>
        <if test="keyword != null and keyword != ''">
           AND asset_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        <if test="sapAssetId != null and sapAssetId != ''">
           AND sap_asset_id = #{sapAssetId}
        </if>
     </where>
     ORDER BY created_at DESC
    <if test="limit != null">
     LIMIT #{limit} OFFSET #{offset}
    </if>
</select>

<!-- IN句の動的処理 -->
<select id="findByDeckIds" resultMap="assetResultMap">
    SELECT asset_master_id, tag_id, asset_name, deck_id
      FROM asset_masters
     WHERE deck_id IN
    <foreach item="deckId" collection="deckIds" open="(" separator="," close=")">
        #{deckId}
    </foreach>
       AND deleted_at IS NULL
</select>
```

### 2-7. Flyway マイグレーション (DB構成管理)
DBスキーマの変更履歴をコードで管理する。SQLファイルを直接DBに実行しない。ファイル名規則: `V{バージョン}__{説明}.sql`(アンダースコア2個)。
```
src/main/resources/db/migration/
├── V1__create_asset_masters.sql
├── V2__create_sensor_time_series.sql
├── V3__add_sap_asset_id_to_assets.sql
└── V4__create_audit_logs.sql
```
```sql
-- V1__create_asset_masters.sql
CREATE TABLE asset_masters (
    asset_master_id BIGSERIAL    PRIMARY KEY,
    tag_id          VARCHAR(50)  NOT NULL UNIQUE,
    asset_name      VARCHAR(200) NOT NULL,
    deck_id         VARCHAR(20),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_assets_tag_id ON asset_masters(tag_id);
```

## 3. よくある間違い
- テーブル/カラムに接頭辞・略語を使う → `db-common-conventions` 標準違反。
- 時系列データを通常のテーブルに格納 → パーティショニング・保持ポリシーの欠如により性能・容量問題。
- インデックスの乱発 → INSERT/UPDATE 性能低下。
- SQLファイルをDBに直接実行 → スキーマの構成管理が不能、環境間の不整合。

## 4. チェックリスト
- [ ] 命名・共通カラムが `db-common-conventions` 標準に従っているか
- [ ] 時系列データをハイパーテーブルにし、パーティショニング・保持ポリシーを設定したか
- [ ] 照会パターンに合わせた複合/部分インデックスを設計したか(不要なインデックスはないか)
- [ ] MyBatis `<resultMap>` マッピングがカラム名と一致しているか
- [ ] スキーマ変更を Flyway マイグレーション(`V{バージョン}__{説明}.sql`)で管理しているか
