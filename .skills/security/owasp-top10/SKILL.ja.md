---
name: OWASP Top 10 セキュリティガイド
description: OWASP Top 10（2021）に基づき主要な脆弱性を予防する防御的コーディング標準 — Injection、XSS、認証の不備、脆弱な依存関係などを扱う。新機能を設計・実装するとき、外部入力・認証・権限・データ露出を扱うとき、セキュリティ点検・コードレビュー時に読む。キーワード: sanitize, escape, parameterized, IDOR, XSS, injection, npm audit, Content-Security-Policy。
rules:
  - "すべての外部入力（ユーザー・API・ファイル）は信頼せず、ホワイトリスト検証またはパラメータ化クエリを使う。"
  - "HTML出力時はユーザー入力を必ずエスケープし、innerHTMLに未検証データを挿入しない。"
  - "IDOR防止のため、リソースアクセス時に所有権・権限をサーバーで再検証する。"
  - "機微なデータ（パスワード・トークン・PII）はレスポンスボディ・URL・ログに露出しない。"
  - "依存関係は定期的に脆弱性をスキャンし（npm audit / pip-audit）、CRITICALな脆弱性は直ちにパッチする。"
tags:
  - "sanitize"
  - "escape"
  - "parameterized"
  - "IDOR"
  - "XSS"
  - "injection"
  - "npm audit"
  - "Content-Security-Policy"
foundational: true
---

# 🔒 OWASP Top 10 セキュリティガイド

> OWASP Top 10（2021）に基づき主要な脆弱性を予防する防御的コーディングを標準化する。新機能を設計・実装するとき、外部入力・認証・権限・機微なデータを扱うとき、セキュリティ点検・コードレビュー時に読む。

## 1. 核心原則

- すべての外部入力（ユーザー・API・ファイル）は信頼せず、ホワイトリスト検証またはパラメータ化クエリを使う。
- HTML出力時はユーザー入力を必ずエスケープし、`innerHTML`に未検証データを挿入しない。
- IDOR防止のため、リソースアクセス時に所有権・権限をサーバーで再検証する。
- 機微なデータ（パスワード・トークン・PII）はレスポンスボディ・URL・ログに露出しない。
- 依存関係は定期的に脆弱性をスキャンし（`npm audit` / `pip-audit`）、CRITICALな脆弱性は直ちにパッチする。

## 2. ルール

### 2-1. OWASP Top 10 (2021) 概要

| 順位 | 脆弱性 | 核心的な予防策 |
|------|--------|-------------|
| A01 | アクセス制御の不備 | サーバー側の権限検証、IDOR遮断 |
| A02 | 暗号化の失敗 | HTTPS強制、機微なデータの暗号化保存 |
| A03 | インジェクション | パラメータ化クエリ、入力検証 |
| A04 | 安全でない設計 | 脅威モデリング、セキュア設計パターン |
| A05 | セキュリティ設定ミス | デフォルト値の変更、不要な機能の無効化 |
| A06 | 脆弱で古いコンポーネント | SCAスキャン、自動アップデート |
| A07 | 認証・セッションの失敗 | MFA、セッション失効、安全なトークン保存 |
| A08 | ソフトウェア・データ完全性の失敗 | 署名検証、CI/CDセキュリティ |
| A09 | セキュリティログ・監視の失敗 | 監査ログ、異常検知アラート |
| A10 | SSRF | 外部URLリクエストのホワイトリスト |

### 2-2. SQL Injectionの予防 (A03)

```python
# ❌ 금지 — 문자열 조합 쿼리 (입력이 SQL로 해석됨)
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ 권장 — 파라미터화 쿼리
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

### 2-3. XSSの予防 (A03)

```javascript
// ❌ 금지 — 미검증 입력을 innerHTML에 삽입 (스크립트 실행 위험)
element.innerHTML = userInput;

// ✅ 권장
element.textContent = userInput;       // DOM API
DOMPurify.sanitize(htmlContent);       // HTML 허용 시 sanitize
```

### 2-4. IDOR（オブジェクト直接参照の脆弱性）の予防 (A01)

```python
# ✅ 권장 — 서버에서 소유권 항상 재검증
def get_order(order_id: str, current_user: User):
    order = db.get(order_id)
    if order.user_id != current_user.id:
        raise ForbiddenError("접근 권한이 없습니다")
    return order
```

## 3. よくある間違い

- クライアントでのみ権限を確認し、サーバーで再検証しない → アクセス制御の回避。
- 機微なデータをログ・URLクエリ文字列に残す → 漏洩経路の生成。
- 依存関係の脆弱性スキャンをCIに入れず、古いコンポーネントが蓄積する。

## 4. チェックリスト

- [ ] すべての外部入力をホワイトリスト検証またはパラメータ化クエリで処理したか
- [ ] HTML出力時にエスケープし、`innerHTML`に未検証データを入れていないか
- [ ] リソースアクセス時に所有権・権限をサーバーで再検証したか
- [ ] 機微なデータをレスポンスボディ・URL・ログに露出していないか
- [ ] 依存関係の脆弱性をスキャンし、CRITICALをパッチしたか

---

- 入力検証の**具体的な実装**（Pydantic/Zodの宣言的検証など）は `input-validation` スキルを参照する — 本スキルはTop 10の概要・優先順位を扱う。
