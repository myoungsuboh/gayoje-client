---
name: Oracle DB設計標準 (MyBatis連携)
description: Oracle のテーブル設計・命名・シーケンス/トリガーパターンと MyBatis Mapper XML 連携の標準。Oracle テーブルを設計したり、MyBatis でページング・UPSERT・動的クエリを書いたり、インデックスを設計するときに読む。キーワード: oracle, ojdbc, jdbc:oracle, mybatis, Mapper, SqlSession, ROWNUM, OFFSET FETCH, sequence, MERGE.
rules:
  - "自動採番 ID はシーケンスで生成し、必要に応じてトリガーで埋める (12c 以上は GENERATED AS IDENTITY が可能)。"
  - "ページングは ROWNUM(12c 未満) または OFFSET/FETCH(12c 以上) 構文で実装する。"
  - "テーブル・カラムの命名と共通カラムは db-common-conventions が唯一の出典である — 小文字の複数形 snake_case、接頭辞(TB_)・大文字・略語は禁止、論理削除は deleted_at。(Oracle は引用符なしの識別子を大文字で保存するが、表記・マッピングは小文字 snake_case に統一する。)"
  - "MyBatis Mapper XML に Oracle 専用の動的クエリを書く。"
  - "検索条件のカラムにインデックスを設計する (等価条件を先に、範囲条件を後に)。"
tags:
  - "oracle"
  - "ojdbc"
  - "jdbc:oracle"
  - "mybatis"
  - "Mapper"
  - "SqlSession"
  - "ROWNUM"
  - "OFFSET FETCH"
  - "sequence"
  - "MERGE"
---

# 🗄️ Oracle DB設計標準 (MyBatis連携)

> Oracle のテーブル設計と MyBatis Mapper XML 連携の方式を統一する。Oracle テーブルを作成したり、MyBatis クエリを作成・修正するときに読む。

## 1. 基本原則
- 自動採番 ID はシーケンスで生成し、必要に応じてトリガーで埋める (12c 以上は `GENERATED AS IDENTITY` が可能)。
- ページングは ROWNUM(12c 未満) または OFFSET/FETCH(12c 以上) 構文で実装する。
- **テーブル・カラムの命名と共通カラムは `db-common-conventions` が唯一の出典である** — 小文字の複数形 `snake_case`、接頭辞(`TB_`)・大文字・略語は禁止、論理削除は `deleted_at`。(Oracle は引用符なしの識別子を大文字で保存するが、表記・マッピングは小文字 `snake_case` に統一する。)
- MyBatis Mapper XML に Oracle 専用の動的クエリを書く。
- 検索条件のカラムにインデックスを設計する (等価条件を先に、範囲条件を後に)。

## 2. ルール

### 2-1. テーブル & カラム命名
命名・共通カラムの規格は `db-common-conventions` に従う(小文字の複数形 `snake_case`、フルネーム、論理削除 `deleted_at`)。以下は Oracle の型・シーケンスを適用した例である。

```sql
-- ✅ 推奨 — 小文字の複数形 snake_case、フルネーム、共通カラム + 論理削除
CREATE TABLE users (
    id          VARCHAR2(36)   DEFAULT SYS_GUID() NOT NULL,   -- UUID PK
    user_name   VARCHAR2(100)  NOT NULL,
    email       VARCHAR2(255)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    updated_at  DATE,
    deleted_at  DATE,                                          -- 論理削除: NULL=有効
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT ux_users_email UNIQUE (email)
);

COMMENT ON TABLE users IS 'ユーザー';
COMMENT ON COLUMN users.id IS 'ユーザー ID';
```

- テーブル: 小文字の複数形 `snake_case` (接頭辞・大文字は禁止)
- 制約: PK `pk_テーブル`、UK `ux_テーブル_カラム`、FK `fk_テーブル_参照テーブル`
- 共通カラム: `created_at`/`updated_at`/`created_by`/`updated_by`/`deleted_at`/`deleted_by` — 規格は `db-common-conventions`

### 2-2. シーケンス (自動採番 ID)
```sql
-- ✅ 数値 PK が必要ならシーケンスを使用
CREATE SEQUENCE seq_items
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;

CREATE TABLE items (
    id          NUMBER         DEFAULT seq_items.NEXTVAL NOT NULL,
    item_name   VARCHAR2(200)  NOT NULL,
    created_at  DATE           DEFAULT SYSDATE NOT NULL,
    deleted_at  DATE,
    CONSTRAINT pk_items PRIMARY KEY (id)
);

-- ✅ Oracle 12c 以上: IDENTITY カラムが使用可能
-- id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

### 2-3. MyBatis Mapper XML — Oracle 専用パターン
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

    <!-- ✅ Oracle: ROWNUM ベースのページング (12c 未満) -->
    <select id="selectItemList" parameterType="map" resultMap="itemResultMap">
        SELECT *
        FROM (
            SELECT A.*, ROWNUM AS rnum
            FROM (
                SELECT id, item_name, created_at
                FROM items
                WHERE deleted_at IS NULL
                <if test="keyword != null and keyword != ''">
                    AND item_name LIKE '%' || #{keyword} || '%'
                </if>
                ORDER BY created_at DESC
            ) A
            WHERE ROWNUM &lt;= #{endRow}
        )
        WHERE rnum &gt; #{startRow}
    </select>

    <!-- ✅ Oracle 12c 以上: OFFSET FETCH ページング -->
    <select id="selectItemListV2" parameterType="map" resultMap="itemResultMap">
        SELECT id, item_name, created_at
        FROM items
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        OFFSET #{offset} ROWS FETCH NEXT #{limit} ROWS ONLY
    </select>

    <!-- ✅ INSERT: シーケンスを使用 -->
    <insert id="insertItem" parameterType="com.example.model.Item">
        <selectKey keyProperty="id" resultType="long" order="BEFORE">
            SELECT seq_items.NEXTVAL FROM DUAL
        </selectKey>
        INSERT INTO items (id, item_name, created_at)
        VALUES (#{id}, #{itemName}, SYSDATE)
    </insert>

    <!-- ✅ INSERT: GENERATED AS IDENTITY 使用時 -->
    <insert id="insertItemAuto" parameterType="com.example.model.Item"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO items (item_name, created_at)
        VALUES (#{itemName}, SYSDATE)
    </insert>

    <!-- ✅ UPDATE -->
    <update id="updateItem" parameterType="com.example.model.Item">
        UPDATE items
        <set>
            <if test="itemName != null">item_name = #{itemName},</if>
            updated_at = SYSDATE
        </set>
        WHERE id = #{id}
    </update>

    <!-- ✅ 論理削除 (deleted_at を埋める) -->
    <update id="deleteItem" parameterType="long">
        UPDATE items
        SET deleted_at = SYSDATE
        WHERE id = #{id}
    </update>

    <!-- ✅ MERGE INTO (UPSERT) -->
    <update id="mergeItem" parameterType="com.example.model.Item">
        MERGE INTO items T
        USING DUAL
        ON (T.id = #{id})
        WHEN MATCHED THEN
            UPDATE SET T.item_name = #{itemName}, T.updated_at = SYSDATE
        WHEN NOT MATCHED THEN
            INSERT (id, item_name, created_at)
            VALUES (seq_items.NEXTVAL, #{itemName}, SYSDATE)
    </update>

</mapper>
```

### 2-4. application.yml Oracle 設定
```yaml
spring:
  datasource:
    driver-class-name: oracle.jdbc.OracleDriver
    url: jdbc:oracle:thin:@//localhost:1521/XEPDB1   # サービス名方式
    # url: jdbc:oracle:thin:@localhost:1521:ORCL     # SID 方式 (旧バージョン)
    username: app_user
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000
      idle-timeout: 600000

mybatis:
  mapper-locations: classpath:mappers/**/*.xml
  configuration:
    map-underscore-to-camel-case: true   # item_name → itemName 自動変換
    default-fetch-size: 100
    default-statement-timeout: 30
```

> `map-underscore-to-camel-case: true` を設定すると resultMap なしでも自動マッピングが可能。

### 2-5. よく使う Oracle 関数
```sql
-- 日付フォーマット
TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')
TO_DATE('2024-01-01', 'YYYY-MM-DD')
TRUNC(SYSDATE)          -- 本日 00:00:00
SYSDATE - 7             -- 7日前

-- NULL 処理
NVL(カラム, デフォルト値)
NVL2(カラム, NULLでないとき, NULLのとき)
COALESCE(col1, col2, 'デフォルト値')  -- ANSI 標準、推奨

-- 文字列
SUBSTR(カラム, 開始, 長さ)
INSTR(カラム, '検索語')
TRIM(カラム) / LTRIM / RTRIM
LISTAGG(カラム, ',') WITHIN GROUP (ORDER BY カラム)  -- GROUP_CONCAT

-- 条件
DECODE(カラム, 'A', '甲', 'B', '乙', 'その他')  -- CASE WHEN 単純形
CASE WHEN 条件 THEN 値 ELSE デフォルト値 END

-- 分析関数 (ウィンドウ)
ROW_NUMBER() OVER (PARTITION BY グループカラム ORDER BY ソートカラム)
RANK() / DENSE_RANK()
SUM(金額) OVER (PARTITION BY 月 ORDER BY 日 ROWS UNBOUNDED PRECEDING)
```

### 2-6. インデックス戦略
```sql
-- ✅ 単一インデックス
CREATE INDEX idx_items_created_at ON items (created_at DESC);

-- ✅ 複合インデックス (有効行の検索最適化: 等価 → 範囲の順序)
CREATE INDEX idx_items_active_created ON items (deleted_at, created_at DESC);

-- ✅ 関数ベースのインデックス (LIKE 検索の最適化)
CREATE INDEX idx_items_name_upper ON items (UPPER(item_name));
```

> WHERE 句のカラムは等価条件を先に、範囲条件を後に。カーディナリティが低いカラムは単独インデックスが非効率 → 複合インデックスの先頭に配置。

## 3. よくある間違い
- 接頭辞(`TB_`)・大文字・略語(`USE_YN`·`REG_DT`)の使用 → `db-common-conventions` 違反。小文字の複数形 `snake_case`・フルネーム・`deleted_at` を使う。
- シーケンスなしでアプリケーション側で ID を採番 → 同時実行の衝突。
- ROWNUM ページングで ORDER BY をインラインビュー内に置かない → ソートが崩れる。
- カーディナリティの低いカラムに単独インデックスを作成 → 非効率。
- `map-underscore-to-camel-case` をオフにし、resultMap もない → マッピング漏れ。

## 4. チェックリスト
- [ ] テーブル・カラムの命名が `db-common-conventions`(小文字の複数形 `snake_case`、フルネーム、`deleted_at`)に従っているか
- [ ] 自動採番 ID をシーケンスまたは IDENTITY で生成しているか
- [ ] ページングを ROWNUM/OFFSET FETCH 構文で実装し、検索に `deleted_at IS NULL` を適用したか
- [ ] 検索条件のカラムにインデックスを設計したか (等価 → 範囲の順序)
- [ ] 論理削除・UPSERT などの共通パターンを Mapper で統一したか
