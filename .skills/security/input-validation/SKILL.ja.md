---
name: 入力検証 & データサニタイズ (Security)
description: 信頼できない入力をサーバー側で検証・サニタイズして Injection・XSS・Path Traversal を防ぐ汎用(foundational)セキュリティ標準であり、ホワイトリスト・コンテキスト別エスケープ/パラメータ化・HTMLサニタイズ・ファイルアップロードの多重検証を扱う(スタック非依存)。入力を受け取るAPI・フォーム・ファイルアップロードを作る、またはサニタイズ・エスケープロジックを直すときに読む。キーワード: sanitize, whitelist, escape, parameterize, injection, XSS, path traversal, file upload。
rules:
  - "共通土台(要約): 入力は信頼せず、強制はサーバー側で、制約は宣言的スキーマで、失敗は拒否(fail-closed)。 — 詳細は validation-bean。"
  - "ホワイトリスト優先: 「許可する値」を明示的に定義し、残りは拒否する。「危険な値」だけを選んで止めるブラックリストは新しい回避パターンを防げない。"
  - "コンテキストに合わせて処理(エスケープ/パラメータ化): 入力をどこで使うかにより防御が異なる。クエリはパラメータ化(文字列連結禁止)、HTML出力はエンコード/エスケープ、シェル・ファイルパスは該当コンテキストのルールで無力化する。「検証したからそのまま使ってよい」は危険だ。"
  - "危険な出力はサニタイズ: HTMLなどマークアップを許可する必要があれば、検証済みのサニタイズツールで許可タグ・属性だけを通す。自前の正規表現でタグを除こうとしない。"
  - "ファイルアップロードは多重検証: 拡張子・MIMEタイプ・実際の内容(マジックバイト)・サイズをすべて検証し、アップロードファイルをWebから直接実行・提供される場所(Webルート)に保存しない。"
  - "Path Traversal遮断: ファイルパス/名に入力を結合するときは正規化後、許可ディレクトリ内にあるか確認する。"
tags:
  - "sanitize"
  - "whitelist"
  - "escape"
  - "parameterize"
  - "injection"
  - "XSS"
  - "path traversal"
  - "file upload"
  - "validate"
  - "schema"
  - "pydantic"
  - "zod"
  - "DOMPurify"
  - "bleach"
foundational: true
---

# 🛡️ 入力検証 & データサニタイズ (Security)

> 信頼できないすべての入力をサーバー側で検証・サニタイズして Injection・XSS・Path Traversal のような攻撃を防ぐ。入力を受け取るAPI・フォーム・ファイルアップロードを作る、または検証・サニタイズロジックを直すときに読む。特定の言語/ライブラリに依存しない汎用セキュリティ標準である。
>
> このスキルは**セキュリティ観点**(攻撃防御)である。入力モデル検証の一般設計・エラー応答標準は `validation-bean`(入力値検証標準)を併せて見る。出力エンコード・SQL Injection など攻撃カタログ全般は `owasp-top10` を参考にする。

## 1. 基本原則

検証の共通土台(入力不信・サーバー側強制・宣言的スキーマ・fail-closed)は一行だけで触れ、以下は**セキュリティ固有の防御**に集中する。検証・エラー応答の一般設計は `validation-bean`(入力値検証標準)を見る。

- **共通土台(要約)**: 入力は信頼せず、強制はサーバー側で、制約は宣言的スキーマで、失敗は拒否(fail-closed)。 — 詳細は `validation-bean`。
- **ホワイトリスト優先**: 「許可する値」を明示的に定義し、残りは拒否する。「危険な値」だけを選んで止めるブラックリストは新しい回避パターンを防げない。
- **コンテキストに合わせて処理(エスケープ/パラメータ化)**: 入力をどこで使うかにより防御が異なる。クエリは**パラメータ化**(文字列連結禁止)、HTML出力は**エンコード/エスケープ**、シェル・ファイルパスは該当コンテキストのルールで無力化する。「検証したからそのまま使ってよい」は危険だ。
- **危険な出力はサニタイズ**: HTMLなどマークアップを許可する必要があれば、検証済みのサニタイズツールで**許可タグ・属性だけ**を通す。自前の正規表現でタグを除こうとしない。
- **ファイルアップロードは多重検証**: 拡張子・MIMEタイプ・実際の内容(マジックバイト)・サイズをすべて検証し、アップロードファイルをWebから直接実行・提供される場所(Webルート)に保存しない。
- **Path Traversal遮断**: ファイルパス/名に入力を結合するときは正規化後、許可ディレクトリ内にあるか確認する。

```
サーバーで検証 (必須)        > クライアントで検証 (任意のUX)
ホワイトリスト (許可リスト)  > ブラックリスト (遮断リスト)
宣言的スキーマ               > 手書きの正規表現
パラメータ化 / エスケープ    > 入力文字列を直接連結
マジックバイト(実際の内容)  > 拡張子/MIMEだけを信頼
```

## 2. ルール

> 進入点の一括検証・サーバー側強制・宣言的スキーマの一般ルールは `validation-bean` に従う。セキュリティ上、形式・列挙・長さの検証はハンドラごとに手書きの正規表現・`if` で散らさず、宣言的スキーマにまとめる(漏れ・回避防止)。以下はセキュリティ固有のルールだけを置く。

### 2-1. ホワイトリストで許可値を明示する
- 許可する形式・列挙値・範囲を定義し、残りは拒否する。危険な文字列を選んで止めるブラックリストに依存しない。
- 列挙型の値(役割・状態・ソートキーなど)は許可リストで強制し、任意の値がロジック・クエリへ流れ込まないようにする。

```text
// ❌ 禁止 — ブラックリストで「危険そうなもの」だけ遮断 (回避可能)
if input contains "<script>" or "DROP TABLE": reject

// ✅ 推奨 — 許可リストだけを通す
role ∈ { "user", "admin" }          // それ以外は全部拒否
sortKey ∈ { "createdAt", "name" }   // 任意のカラム名を遮断
```

### 2-2. 出力コンテキストに合わせてパラメータ化/エスケープする
- DBクエリは**パラメータ化/バインディング**で処理し、入力を文字列としてつながない(SQL Injection防御)。
- HTMLとして出力する値は出力コンテキストに合わせて**エンコード/エスケープ**する(XSS防御)。
- シェルコマンド・ファイルパスに入力を入れるときは該当コンテキストのルールで無力化し、パスは正規化後、許可ディレクトリ内にあるか確認する(Path Traversal防御)。

```text
// ❌ 禁止 — 入力をそのまま連結 (Injection)
query("SELECT * FROM users WHERE id = " + input.id)
render("<div>" + input.comment + "</div>")
open(baseDir + "/" + input.filename)        // "../" で脱出可能

// ✅ 推奨 — パラメータ化 · エスケープ · パス正規化後に検査
query("SELECT * FROM users WHERE id = ?", [input.id])
render(escapeHtml(input.comment))
path = normalize(baseDir + "/" + input.filename)
assert path startsWith baseDir              // 許可ディレクトリ外なら拒否
```

### 2-3. 危険な出力(HTMLなど)は検証済みツールでサニタイズする
- HTML入力を許可する必要があれば、検証済みのサニタイズツールで**許可タグ・属性だけ**を通し、残りは除去する。
- 自前の正規表現で `<script>` などを除こうとしない — エンコード・ネスト・イベントハンドラなどで回避される。

```text
// ❌ 禁止 — 自前の正規表現でタグ除去 (回避可能)
stripTags(userHtml)

// ✅ 推奨 — 検証済みサニタイザで許可タグ・属性だけを通す
allowTags  = { b, i, em, strong, a, p, br }
allowAttrs = { a: [href, title] }
clean = sanitize(userHtml, allowTags, allowAttrs)
```

### 2-4. ファイルアップロードは多重検証 + 安全な保存
- 拡張子・MIMEタイプ・サイズをホワイトリストで検証し、**実際の内容(マジックバイト)** まで確認して偽装ファイルを防ぐ。
- アップロードファイルをWebルート(直接URLで実行/提供される場所)に保存せず、ファイル名をそのまま使わない(サーバーが生成した名前を使用、パス脱出を遮断)。

```text
// ❌ 禁止 — 拡張子だけ見て信頼、Webルートに元のファイル名で保存
save(file, webroot + "/" + file.name)

// ✅ 推奨 — 拡張子 + MIME + マジックバイト + サイズ、安全な場所に保存
assert ext  ∈ allowedExts
assert mime ∈ allowedMimes
assert magicBytes(file) matches declaredType    // 偽装ファイルを遮断
assert size <= maxSize
save(file, nonWebrootDir + "/" + generatedName) // 元のファイル名は不使用
```

## 3. よくある間違い

> クライアント検証だけを信じる・進入点検証の漏れなど一般的な罠は `validation-bean` を参考。以下はセキュリティ固有の罠。

- **ブラックリストで危険な値だけ遮断** → 新しい回避パターンを防げない。ホワイトリストで。
- **検証したから安全だと仮定してそのまま使用** → 検証と出力処理は別物だ。クエリはパラメータ化、HTMLはエスケープ。
- **自前の正規表現でHTML/スクリプト除去** → エンコード・ネストでXSS回避。検証済みサニタイザで。
- **ファイルを拡張子/MIMEだけ見て信頼** → 偽装ファイルが実行されうる。マジックバイトまで確認。
- **アップロードファイルをWebルートに元の名前で保存** → アップロードしたスクリプトが実行されるか、パス脱出が発生する。
- **パス/ファイル名に入力をそのまま結合** → `../` でディレクトリを脱出する。正規化後に許可範囲を検査。
- **エラー応答に内部情報を露出** → スタックトレース・実装詳細をそのまま出さない(`validation-bean` 参考)。

## 4. チェックリスト

> サーバー側検証・宣言的スキーマなど一般項目は `validation-bean` チェックリストで。以下はセキュリティ固有の項目。

- [ ] **ホワイトリスト(許可リスト)** 方式で形式・列挙・範囲を強制するか (手書きの正規表現への依存禁止)
- [ ] DBクエリを**パラメータ化/バインディング**し、入力を文字列としてつながないか (SQL Injection)
- [ ] HTML出力値を出力コンテキストに合わせて**エスケープ/エンコード**するか (XSS)
- [ ] ファイルパス/名に入る入力を正規化後、**許可範囲内か**を検査するか (Path Traversal)
- [ ] HTML入力は**検証済みサニタイザ**で許可タグ・属性だけを通すか
- [ ] ファイルアップロードの拡張子・MIME・**マジックバイト**・サイズをすべて検証するか
- [ ] アップロードファイルを**Webルート外**にサーバー生成の名前で保存するか
- [ ] 検証失敗が**拒否(fail-closed)** であり、応答に内部情報を露出しないか

## 付録: スタック別の例

> 以下は参考用の実装例である。チームが使うスタックに合わせて同じパターンで追加する。上記1〜4の原則・ルールが標準であり、付録はその適用事例にすぎない。

### Python (Pydantic) — 宣言的スキーマ検証

```python
# ✅ 권장 — 선언적 스키마로 구조·타입·범위를 강제
from pydantic import BaseModel, EmailStr, constr, validator

class CreateUserRequest(BaseModel):
    name: constr(min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(ge=0, le=150)
    role: Literal["user", "admin"]  # 화이트리스트 강제

    @validator("name")
    def name_no_html(cls, v):
        if "<" in v or ">" in v:
            raise ValueError("이름에 HTML 태그를 사용할 수 없습니다.")
        return v
```

### TypeScript/JavaScript (Zod) — 宣言的スキーマ検証

```typescript
// ✅ 권장 — safeParse 로 검증하고 실패 시 400 응답
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});

const result = createUserSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.flatten() });
}
```

### Python — ファイルアップロードセキュリティ

拡張子・MIMEタイプ・サイズを検証し、マジックバイトで実際の形式まで確認する。

```python
# ✅ 권장 — 화이트리스트로 확장자·MIME·크기를 모두 검증
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_upload(file):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("허용되지 않는 파일 형식입니다.")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("MIME 타입이 올바르지 않습니다.")
    if file.size > MAX_FILE_SIZE:
        raise ValueError("파일 크기는 10MB 이하여야 합니다.")
    # 매직 바이트로 실제 형식 추가 검증 권장 (python-magic 라이브러리)
```

### Python (bleach) — HTMLサニタイズ

```python
# ❌ 금지 — 자체 정규식으로 태그를 거르려는 시도 (우회 가능)
# ✅ 권장 — 검증된 라이브러리(bleach)로 허용 태그·속성만 통과
import bleach

ALLOWED_TAGS = ["b", "i", "em", "strong", "a", "p", "br"]
ALLOWED_ATTRS = {"a": ["href", "title"]}

clean_html = bleach.clean(user_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS)
```

> フロントエンド(ブラウザ)でHTMLをレンダリングする前にサニタイズが必要なら DOMPurify のような検証済みライブラリを使う。
