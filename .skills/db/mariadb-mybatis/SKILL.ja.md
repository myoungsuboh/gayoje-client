---
name: MariaDB/MySQL DB設計標準 (MyBatis連携)
description: MariaDB/MySQLのテーブル設計、AUTO_INCREMENT、ページング(LIMIT/OFFSET)とMyBatis Mapper XML連携の標準。MariaDB/MySQLのテーブルを設計したり、MyBatis Mapper XMLで動的クエリ・ページング・UPSERTを書くときに読む。キーワード: mariadb, mysql, mybatis, Mapper, SqlSession, select, insert, update, delete, resultMap, parameterType, AUTO_INCREMENT, LIMIT, OFFSET.
rules:
  - "数値PKはAUTO_INCREMENTで生成する (BIGINT推奨)。"
  - "ページングはLIMIT / OFFSETで実装する。"
  - "テーブル・カラムの命名と共通カラムはdb-common-conventionsが単一の出典だ — 小文字複数形のsnake_case、接頭辞(tb_)・略語禁止、論理削除はdeleted_at(nullable)。本書はMariaDB/MySQL固有の構文のみを扱う。"
  - "MyBatis Mapper XMLにMariaDB/MySQL専用の動的クエリを書く。"
  - "照会条件のカラムにインデックスを設計する。"
tags:
  - "mariadb"
  - "mysql"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "select"
  - "insert"
  - "update"
  - "delete"
  - "resultMap"
  - "parameterType"
  - "AUTO_INCREMENT"
  - "LIMIT"
  - "OFFSET"
  - "<select"
  - "<insert"
  - "<update"
  - "<delete"
---

# 🐬 MariaDB / MySQL DB設計標準 (MyBatis連携)

> MariaDB/MySQLのテーブル設計とMyBatis連携の方式を統一する。新しいテーブルを作成したり、Mapper XMLにページング・動的クエリ・UPSERTを書くときに読む。

## 1. 核心原則
- 数値PKは`AUTO_INCREMENT`で生成する(`BIGINT`推奨)。
- ページングは`LIMIT / OFFSET`で実装する。
- **テーブル・カラムの命名と共通カラムは`db-common-conventions`が単一の出典だ** — 小文字複数形の`snake_case`、接頭辞(`tb_`)・略語禁止、論理削除は`deleted_at`(nullable)。本書はMariaDB/MySQL固有の構文のみを扱う。
- MyBatis Mapper XMLにMariaDB/MySQL専用の動的クエリを書く。
- 照会条件のカラムにインデックスを設計する。

## 2. ルール

### 2-1. テーブル & カラムの命名
テーブルは小文字複数形の`snake_case`(Linuxファイルシステムの大文字小文字区別に注意)。エンジン・文字セットは必ず明示する。命名・共通カラム規格は`db-common-conventions`に従う。

```sql
-- ✅ 推奨 — InnoDB + utf8mb4, 小文字複数形 snake_case, 共通カラム + 論理削除
CREATE TABLE users (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    user_name   VARCHAR(100)    NOT NULL,
    email       VARCHAR(255)    NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),         -- 更新時に自動更新
    deleted_at  DATETIME        NULL,                          -- 論理削除: NULL=アクティブ
    PRIMARY KEY (id),
    UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users COMMENT = 'ユーザー';
```

核心設定:
- `ENGINE=InnoDB`: トランザクション、外部キーをサポート(必ず明示)
- `CHARSET=utf8mb4`: 絵文字を含む韓国語の完全サポート(`utf8`は絵文字を保存不可)
- `COLLATE=utf8mb4_unicode_ci`: 大文字小文字を区別しない比較 (ci = case insensitive)

> UUID PKが必要なら`id VARCHAR(36) NOT NULL DEFAULT (UUID())`。共通カラム(`created_by`・`updated_by`・`deleted_by`等)の全規格は`db-common-conventions`に従う。

### 2-2. AUTO_INCREMENT (数値PK)
```sql
-- ✅ 推奨 — BIGINT AUTO_INCREMENT (INTの21億の限界より安全)
CREATE TABLE items (
    id          BIGINT          NOT NULL AUTO_INCREMENT,
    item_name   VARCHAR(200)    NOT NULL,
    price       DECIMAL(15, 2)  NOT NULL DEFAULT 0,
    created_at  DATETIME        NOT NULL DEFAULT NOW(),
    updated_at  DATETIME        NULL ON UPDATE NOW(),
    deleted_at  DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_items_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2-3. MyBatis Mapper XML (MariaDB/MySQL専用パターン)
ページングは`LIMIT ? OFFSET ?`、INSERTは`useGeneratedKeys`でPKを回収、UPSERTは`ON DUPLICATE KEY UPDATE`、論理削除は`deleted_at`を埋めて照会は`deleted_at IS NULL`で絞る。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
    "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.dao.ItemDao">

    <resultMap id="itemResultMap" type="com.example.model.Item">
        <id     property="id"        column="id"/>
        <result property="itemName"  column="item_name"/>
        <result property="price"     column="price"/>
        <result property="createdAt" column="created_at"/>
    </resultMap>

    <!-- LIMIT OFFSET ページング (照会は生きている行のみ) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, price, created_at
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
        ORDER BY created_at DESC
        LIMIT #{limit} OFFSET #{offset}
    </select>

    <!-- 全件数 -->
    <select id="selectItemCount" parameterType="map" resultType="int">
        SELECT COUNT(*)
        FROM items
        WHERE deleted_at IS NULL
        <if test="keyword != null and keyword != ''">
            AND item_name LIKE CONCAT('%', #{keyword}, '%')
        </if>
    </select>

    <!-- INSERT + 生成されたPKを返す -->
    <insert id="insertItem" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, price, created_at)
        VALUES (#{itemName}, #{price}, NOW())
    </insert>

    <!-- INSERT IGNORE (重複無視) -->
    <insert id="insertItemIgnore" parameterType="com.example.model.Item">
        INSERT IGNORE INTO items (item_name, price)
        VALUES (#{itemName}, #{price})
    </insert>

    <!-- UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            <if test="price != null">price = #{price},</if>
            updated_at = NOW()
        </set>
        WHERE id = #{id}
    </update>

    <!-- 論理削除 (deleted_atを埋める) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = NOW()
        WHERE id = #{id}
    </update>

    <!-- ON DUPLICATE KEY UPDATE (UPSERT) -->
    <insert id="upsertItem" parameterType="com.example.model.Item">
        INSERT INTO items (id, item_name, price)
        VALUES (#{id}, #{itemName}, #{price})
        ON DUPLICATE KEY UPDATE
            item_name = VALUES(item_name),
            price     = VALUES(price),
            updated_at = NOW()
    </insert>

    <!-- IN 句 (foreach) -->
    <select id="selectItemsByIds" parameterType="list" resultMap="itemResultMap">
        SELECT id, item_name, price
        FROM items
        WHERE id IN
        <foreach collection="list" item="id" open="(" separator="," close=")">
            #{id}
        </foreach>
        AND deleted_at IS NULL
    </select>

    <!-- バッチ INSERT -->
    <insert id="insertItemBatch" parameterType="list">
        INSERT INTO items (item_name, price, created_at)
        VALUES
        <foreach collection="list" item="item" separator=",">
            (#{item.itemName}, #{item.price}, NOW())
        </foreach>
    </insert>

</mapper>
```

### 2-4. application.yml + 依存関係
```yaml
spring:
  datasource:
    driver-class-name: org.mariadb.jdbc.Driver   # MariaDB専用ドライバ
    # driver-class-name: com.mysql.cj.jdbc.Driver  # MySQL使用時
    url: jdbc:mariadb://localhost:3306/mydb?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Seoul
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 自動変換
    default-statement-timeout: 30
```

```groovy
// MariaDB
implementation 'org.mariadb.jdbc:mariadb-java-client:3.3.2'
// MySQL使用時
implementation 'com.mysql:mysql-connector-j:8.3.0'
```

### 2-5. よく使う関数
```sql
-- 日付
NOW()                               -- 現在の日時
CURDATE()                           -- 今日の日付 (時間なし)
DATE_ADD(NOW(), INTERVAL -7 DAY)   -- 7日前
DATEDIFF(終了日, 開始日)            -- 日付の差 (日)
DATE_FORMAT(NOW(), '%Y-%m-%d')     -- 日付フォーマット

-- NULL処理
IFNULL(カラム, 既定値)             -- Oracle NVL相当
COALESCE(col1, col2, '既定値')     -- ANSI標準
NULLIF(カラム, 比較値)

-- 文字列
SUBSTRING(カラム, 開始, 長さ)
LOCATE('検索語', カラム)
TRIM(カラム) / LTRIM / RTRIM
GROUP_CONCAT(カラム ORDER BY カラム SEPARATOR ',')   -- グループ結合
CONCAT(col1, '-', col2)

-- 条件
IF(条件, 真の値, 偽の値)
CASE WHEN 条件 THEN 値 ELSE 既定値 END
ELT(インデックス, 値1, 値2, 値3)        -- インデックスに基づく選択

-- 分析関数 (MariaDB 10.2+, MySQL 8.0+)
ROW_NUMBER() OVER (PARTITION BY グループ ORDER BY ソート)
RANK() / DENSE_RANK()
```

### 2-6. インデックス戦略
```sql
-- 単一インデックス
ALTER TABLE items ADD INDEX idx_items_created_at (created_at DESC);

-- 複合インデックス (アクティブ行の照会最適化)
ALTER TABLE items ADD INDEX idx_items_active_created (deleted_at, created_at DESC);

-- 全文検索インデックス (LIKE検索の代替)
ALTER TABLE items ADD FULLTEXT INDEX ft_items_name (item_name)
    WITH PARSER ngram;   -- 韓国語分割: ngramパーサが必須

-- 全文検索クエリ
SELECT * FROM items
WHERE MATCH(item_name) AGAINST('検索語' IN BOOLEAN MODE)
  AND deleted_at IS NULL;
```

## 3. よくあるミス
- エンジン・文字セット未明示 → 絵文字/韓国語の文字化け、トランザクション未サポート。
- `INT` PKの使用 → 21億の限界に到達するリスク(`BIGINT`推奨)。
- 接頭辞(`tb_`)・略語(`user_nm`・`reg_dt`)・`use_yn 'Y'/'N'`フラグ → `db-common-conventions`違反。フルネーム・`deleted_at`を使う。
- 照会で`deleted_at IS NULL`漏れ → 削除された行まで照会。
- `lower_case_table_names`未確認 → Linuxでテーブル名の大文字小文字区別によりクエリ失敗。Docker配備時は`my.cnf`に明示を推奨。
- LIKE検索の先頭に`%` → インデックス未使用(全文検索インデックスを検討)。

## 4. チェックリスト
- [ ] テーブル=小文字複数形`snake_case`、カラム=フルネーム、共通カラム・`deleted_at`を適用したか(`db-common-conventions`)
- [ ] テーブルに`ENGINE=InnoDB`、`CHARSET=utf8mb4`、`COLLATE`を明示したか
- [ ] 数値PKを`BIGINT AUTO_INCREMENT`で生成したか
- [ ] ページングを`LIMIT / OFFSET`で、照会に`deleted_at IS NULL`を適用したか
- [ ] INSERTで`useGeneratedKeys`によりPKを回収したか
- [ ] 照会条件のカラムにインデックスを設計したか
- [ ] `lower_case_table_names`設定を確認したか
