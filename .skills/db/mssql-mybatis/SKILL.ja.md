---
name: MSSQL(SQL Server) DB設計標準 (MyBatis連携)
description: Microsoft SQL Server のテーブル設計、T-SQL パターン、IDENTITY/ページング(OFFSET·FETCH)と MyBatis Mapper XML 連携の標準。SQL Server テーブルを設計したり、MyBatis Mapper XML で T-SQL の動的クエリ・ページング・MERGE を書くときに読む。キーワード: sqlserver, mssql, T-SQL, jdbc:sqlserver, mybatis, Mapper, SqlSession, IDENTITY, OFFSET, FETCH NEXT, MERGE, NVARCHAR.
rules:
  - "数値 PK は IDENTITY(1,1) で自動採番する。"
  - "ページングは OFFSET ... FETCH NEXT ... ROWS ONLY 構文で実装する (SQL Server 2012+)。"
  - "テーブル・カラムの命名と共通カラムは db-common-conventions が唯一の出典である — 小文字の複数形 snake_case、接頭辞(TB_)・PascalCase・略語は禁止、論理削除は deleted_at。"
  - "文字列は NVARCHAR、日付は DATETIME2 を使う (SQL Server 固有の型)。"
  - "MyBatis Mapper XML に T-SQL 専用の動的クエリを書き、検索条件のカラムにインデックスを設計する。"
tags:
  - "sqlserver"
  - "mssql"
  - "T-SQL"
  - "jdbc:sqlserver"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "IDENTITY"
  - "OFFSET"
  - "FETCH NEXT"
  - "MERGE"
  - "NVARCHAR"
---

# 🪟 MSSQL (SQL Server) DB設計標準 (MyBatis連携)

> SQL Server のテーブル設計と MyBatis 連携の方式を統一する。新しいテーブルを作成したり、Mapper XML に T-SQL のページング・動的クエリ・MERGE を書くときに読む。

## 1. 基本原則
- 数値 PK は `IDENTITY(1,1)` で自動採番する。
- ページングは `OFFSET ... FETCH NEXT ... ROWS ONLY` 構文で実装する (SQL Server 2012+)。
- **テーブル・カラムの命名と共通カラムは `db-common-conventions` が唯一の出典である** — 小文字の複数形 `snake_case`、接頭辞(`TB_`)・PascalCase・略語は禁止、論理削除は `deleted_at`。
- 文字列は `NVARCHAR`、日付は `DATETIME2` を使う (SQL Server 固有の型)。
- MyBatis Mapper XML に T-SQL 専用の動的クエリを書き、検索条件のカラムにインデックスを設計する。

## 2. ルール

### 2-1. テーブル & カラム命名
命名・共通カラムの規格は `db-common-conventions` に従う(小文字の複数形 `snake_case`)。SQL Server 固有の型(`NVARCHAR`·`DATETIME2`·`UNIQUEIDENTIFIER`)のみ適用する。

```sql
-- ✅ 推奨 — 小文字の複数形 snake_case、フルネーム、共通カラム + 論理削除
CREATE TABLE users (
    id          UNIQUEIDENTIFIER  DEFAULT NEWID()  NOT NULL,   -- UUID PK
    user_name   NVARCHAR(100)     NOT NULL,
    email       NVARCHAR(255)     NOT NULL,
    created_at  DATETIME2         DEFAULT GETDATE() NOT NULL,
    updated_at  DATETIME2,
    deleted_at  DATETIME2,                                      -- 論理削除: NULL=有効
    CONSTRAINT pk_users       PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

-- テーブル/カラムの説明 (MS_Description 方式)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ユーザー',
    @level0type = N'SCHEMA', @level0name = 'dbo',
    @level1type = N'TABLE',  @level1name = 'users';
```

命名・型ルール:
- テーブル/カラム: 小文字の複数形 `snake_case`、フルネーム (`db-common-conventions`)
- 文字列: ✅ `NVARCHAR` を使用 (日本語の文字化け防止) / ❌ `VARCHAR` 禁止
- 日付: `DATETIME2` を使用 (`DATETIME` より精度が高い)
- PK: 数値は `IDENTITY`、UUID は `NEWID()` / `NEWSEQUENTIALID()`

### 2-2. IDENTITY 自動採番
```sql
CREATE TABLE items (
    id          INT           IDENTITY(1,1)   NOT NULL,    -- 自動採番
    item_name   NVARCHAR(200) NOT NULL,
    created_at  DATETIME2     DEFAULT GETDATE() NOT NULL,
    deleted_at  DATETIME2,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- INSERT 後に生成された ID を取得
INSERT INTO items (item_name) VALUES (N'テスト商品');
SELECT SCOPE_IDENTITY();          -- 現在のセッションの最後の IDENTITY 値
-- ✅ 推奨 — OUTPUT 句を使用
INSERT INTO items (item_name)
OUTPUT INSERTED.id
VALUES (N'テスト商品');
```

### 2-3. MyBatis Mapper XML (MSSQL 専用パターン)
ページングは `OFFSET ... FETCH NEXT`、UPSERT は `MERGE`、論理削除は `deleted_at` を埋める。不等号(`<` `>` `&`)は必ずエスケープするか `CDATA` で囲む。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- MSSQL ページング: OFFSET FETCH (SQL Server 2012 以上) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS
        FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- 全件数 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE '%' + #{keyword} + '%'
        </if>
    </select>

    <!-- INSERT + 生成された ID を返却 -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, GETDATE())
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = GETDATE()
        </set>
        WHERE id = #{id}
    </update>

    <!-- 論理削除 (deleted_at を埋める) -->
    <update id="deleteItem" parameterType="int">
        UPDATE items
        SET deleted_at = GETDATE()
        WHERE id = #{id}
    </update>

    <!-- MERGE (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items AS T
        USING (SELECT #{id} AS id) AS S
        ON (T.id = S.id)
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = GETDATE()
        WHEN NOT MATCHED THEN
            INSERT (item_name, created_at) VALUES (#{itemName}, GETDATE());
    </update>

    <!-- XML 予約文字: < > & の処理 -->
    <!-- MyBatis XML では不等号は必ずエスケープまたは CDATA を使用 -->
    <select id="selectRecentItems" parameterType="int" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        <![CDATA[ AND created_at >= DATEADD(DAY, -#{days}, GETDATE()) ]]>
        ORDER BY created_at DESC
    </select>

</mapper>
```

### 2-4. application.yml + 依存関係
```yaml
spring:
  datasource:
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    url: jdbc:sqlserver://localhost:1433;databaseName=mydb;encrypt=true;trustServerCertificate=true
    username: sa
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 自動変換 (snake_case 標準)
    default-statement-timeout: 30
```

```groovy
implementation 'com.microsoft.sqlserver:mssql-jdbc:12.4.2.jre11'
```

### 2-5. よく使う T-SQL 関数
```sql
-- 日付
GETDATE()                               -- 現在の日時
SYSDATETIME()                           -- より精密な現在時刻 (DATETIME2)
DATEADD(DAY, -7, GETDATE())            -- 7日前
DATEDIFF(DAY, 開始日, 終了日)           -- 日付の差
FORMAT(GETDATE(), 'yyyy-MM-dd')         -- 日付フォーマット文字列

-- NULL 処理
ISNULL(カラム, デフォルト値)            -- Oracle NVL 相当
COALESCE(col1, col2, 'デフォルト値')    -- ANSI 標準、推奨
NULLIF(カラム, 比較値)                  -- 等しければ NULL を返す

-- 文字列
SUBSTRING(カラム, 開始, 長さ)
CHARINDEX('検索語', カラム)             -- Oracle INSTR 相当
TRIM(カラム) / LTRIM / RTRIM
STRING_AGG(カラム, ',') WITHIN GROUP (ORDER BY カラム)  -- GROUP_CONCAT (2017+)
CONCAT(col1, N'-', col2)               -- 文字列連結 (N 接頭辞で Unicode)

-- 条件
IIF(条件, 真の値, 偽の値)              -- 単純な三項
CASE WHEN 条件 THEN 値 ELSE デフォルト値 END

-- 分析関数
ROW_NUMBER() OVER (PARTITION BY グループ ORDER BY ソート)
RANK() / DENSE_RANK()
```

### 2-6. インデックス戦略
```sql
-- クラスター化インデックス: PK に自動生成 (テーブルあたり 1 個)
-- 非クラスター化インデックス: 検索最適化用
CREATE NONCLUSTERED INDEX idx_items_created_at
    ON items (created_at DESC)
    INCLUDE (item_name);    -- INCLUDE: カバリングインデックス (SELECT カラム追加)

-- フィルター付きインデックス (有効な行のみ)
CREATE NONCLUSTERED INDEX idx_items_active
    ON items (created_at DESC)
    WHERE deleted_at IS NULL;   -- 有効なデータのみインデックス化 → サイズ削減
```

## 3. よくある間違い
- 接頭辞(`TB_`)・PascalCase・略語(`UseYn`·`RegDt`)の使用 → `db-common-conventions` 違反。小文字の複数形 `snake_case`・フルネーム・`deleted_at` を使う。
- `VARCHAR` の使用 → 文字化け。文字列は `NVARCHAR`、リテラルは `N'...'`。
- Mapper XML で不等号(`<` `>`)をそのまま書く → XML パースエラー。エスケープまたは `CDATA` を使用。
- `NVARCHAR` カラムの LIKE 検索で先頭に `%` → インデックス不使用。全文検索(Full-Text Search)または Filtered Index を検討。
- 検索で `deleted_at IS NULL` の漏れ → 削除された行まで取得。

## 4. チェックリスト
- [ ] テーブル・カラムの命名が `db-common-conventions`(小文字の複数形 `snake_case`、フルネーム、`deleted_at`)に従っているか
- [ ] 文字列を `NVARCHAR`、日付を `DATETIME2` で宣言したか
- [ ] 数値 PK を `IDENTITY(1,1)` で生成し、ID を `OUTPUT`/`SCOPE_IDENTITY()` で回収したか
- [ ] ページングを `OFFSET ... FETCH NEXT` で、検索に `deleted_at IS NULL` を適用したか
- [ ] Mapper XML の不等号をエスケープ/CDATA で処理したか
- [ ] 検索条件のカラムに(必要に応じてカバリング/フィルター)インデックスを設計したか
