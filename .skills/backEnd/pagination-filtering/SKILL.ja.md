---
name: ページネーション & フィルタリング標準 (Pagination & Filtering)
description: カーソルベース・オフセットベースのページネーションと動的フィルタリングAPI設計の標準（スタック中立）。一覧APIを作成したり、大量データの取得・ソート・フィルタを設計するときに読む。キーワード: pagination, cursor, offset, filtering, page, limit, sort。
rules:
  - "大規模データセットはオフセットではなくカーソルベースのページネーションを使い、OFFSET N の性能劣化を防ぐ。"
  - "ページネーションのレスポンスに next_cursor（または next_page）、total_count、has_more を含める。"
  - "フィルタパラメータは明示的な許可リスト（whitelist）でのみ処理し、SQL/NoSQLインジェクションを防ぐ。"
  - "デフォルトのソート基準を常に明示し（例: created_at DESC, id DESC）、ソートなしでページネーションしない。"
  - "ページサイズ（limit）に最大値を設定する（例: 最大100）。クライアントが無制限に要求できないようにする。"
tags:
  - "pagination"
  - "cursor"
  - "offset"
  - "filtering"
  - "page"
  - "limit"
  - "sort"
---

# 📄 ページネーション & フィルタリング標準

> 一覧APIのページネーション・ソート・フィルタ方式を統一する。新しい一覧APIを作成したり、大量取得の性能を改善するときに読む。

## 1. 基本原則
- 大規模データセットはオフセットではなくカーソルベースのページネーションを使い、OFFSET N の性能劣化を防ぐ。
- ページネーションのレスポンスに next_cursor（または next_page）、total_count、has_more を含める。
- フィルタパラメータは明示的な許可リスト（whitelist）でのみ処理し、SQL/NoSQLインジェクションを防ぐ。
- デフォルトのソート基準を常に明示し（例: created_at DESC, id DESC）、ソートなしでページネーションしない。
- ページサイズ（limit）に最大値を設定する（例: 最大100）。クライアントが無制限に要求できないようにする。

## 2. ルール

### 2-1. オフセット vs カーソルの選択
| 方式 | 長所 | 短所 | 推奨される状況 |
|------|------|------|-----------|
| オフセット | 特定ページへの直接移動が可能 | OFFSETが大きいほど遅い、リアルタイムデータで不安定 | 少量（<10万）、管理者一覧 |
| カーソル | 一定の性能、安定的 | 特定ページへのジャンプ不可 | 大量、無限スクロール |

### 2-2. カーソルベースのレスポンス形式
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "has_more": true,
    "limit": 20
  }
}
```

### 2-3. フィルタ許可リストのパターン
```python
# ❌ 禁止 — クライアントが送ったフィルタキーをそのままクエリに渡す（インジェクションの危険）
# ✅ 推奨 — 明示的な許可リストでのみ処理
ALLOWED_FILTERS = {"status", "category", "created_after", "created_before"}

def validate_filters(params: dict) -> dict:
    return {k: v for k, v in params.items() if k in ALLOWED_FILTERS}
```

### 2-4. カーソル生成 (opaque base64)
```python
import base64, json

def encode_cursor(row_id: int) -> str:
    return base64.b64encode(json.dumps({"id": row_id}).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.b64decode(cursor).decode())
```

### 2-5. ソート・limit の強制
```text
// ❌ 禁止 — ソートなしのページネーション、limit 無制限
SELECT * FROM items LIMIT :clientLimit

// ✅ 推奨 — 明示的なソート + limit 上限
SELECT * FROM items ORDER BY created_at DESC, id DESC LIMIT min(:clientLimit, 100)
```

## 3. よくある誤り
- 大量データなのにオフセットを使用 → OFFSETが大きくなるほどクエリが急激に遅くなる。
- ソートなしのページネーション → ページごとに順序が揺れて重複・欠落が発生する。
- フィルタキーを許可リストなしで通過 → SQL/NoSQLインジェクションの危険。
- limit 上限の未設定 → クライアントが一度に全件を引き出して負荷を引き起こす。

## 4. チェックリスト
- [ ] 大量一覧にカーソルベースを使用したか
- [ ] レスポンスに next_cursor・has_more（必要なら total_count）を含めたか
- [ ] フィルタを明示的な許可リストでのみ処理したか
- [ ] デフォルトのソート基準を明示したか（ソートなしのページネーション禁止）
- [ ] limit の最大値を設定したか
