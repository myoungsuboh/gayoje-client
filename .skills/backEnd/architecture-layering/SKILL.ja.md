---
name: アプリケーションアーキテクチャ — レイヤリング & 関心の分離 (MVC/Clean)
description: コントローラ・サービス・リポジトリの各レイヤを分離し、ビジネスロジックの置き場所と依存方向を定めるスタック中立のアーキテクチャガイド。新機能のコード配置を決めるとき、またはコントローラ・UI にロジックが混ざらないようレビューするときに読む。キーワード: MVC, MVVM, layered-architecture, clean-architecture, hexagonal, controller, service, repository, separation-of-concerns, dependency-inversion, DTO.
rules:
  - "レイヤを分離する — Controller(リクエスト/レスポンス)・Service(ビジネスロジック)・Repository(データアクセス)。1 つのファイルが 2 つの責務を兼ねない。"
  - "ビジネスロジックは Service レイヤにのみ置く — コントローラは入力検証・呼び出し・レスポンス変換のみ、UI/ビューは表示のみを担う。"
  - "依存は内側(ドメイン)へのみ向ける — Controller→Service→Repository。逆方向参照(Repository が Service を呼ぶ)は禁止する。"
  - "レイヤ間の境界は DTO でやり取りし、DB エンティティをコントローラ/ビューまでそのまま露出しない。"
  - "外部依存(DB・外部 API・ファイル)はインターフェースの背後に抽象化し、ドメインロジックが実装に縛られないようにする(依存性逆転)。"
  - "フロントエンドは MVVM/コンポーネント構造で — ビュー(テンプレート)・状態(store/composable)・API 呼び出し(service)を分離し、コンポーネントにビジネスロジックを置かない。"
tags:
  - "MVC"
  - "MVVM"
  - "layered-architecture"
  - "clean-architecture"
  - "hexagonal"
  - "controller"
  - "service"
  - "repository"
  - "separation-of-concerns"
  - "dependency-inversion"
  - "DTO"
---

# 🏛️ アプリケーションアーキテクチャ — レイヤリング & 関心の分離

> Controller・Service・Repository の境界をルールとして固定し、ビジネスロジックが一箇所(Service)に集まるようにする。新機能のコードの置き場所を決めるときや構造をレビューするときに読む。

AI エージェントが最もよく犯す構造的ミスは、**コントローラや UI コンポーネントにビジネスロジックを詰め込むこと**だ。最初は速く見えても、テスト・再利用・変更が急激に難しくなる。レイヤ境界をルールとして固定すれば、AI もその枠の中でコードを生成する。

## 1. 核心原則

- レイヤを分離する — Controller(リクエスト/レスポンス)・Service(ビジネスロジック)・Repository(データアクセス)。1 つのファイルが 2 つの責務を兼ねない。
- ビジネスロジックは Service レイヤにのみ置く — コントローラは入力検証・呼び出し・レスポンス変換のみ、UI/ビューは表示のみを担う。
- 依存は内側(ドメイン)へのみ向ける — Controller→Service→Repository。逆方向参照(Repository が Service を呼ぶ)は禁止する。
- レイヤ間の境界は DTO でやり取りし、DB エンティティをコントローラ/ビューまでそのまま露出しない。
- 外部依存(DB・外部 API・ファイル)はインターフェースの背後に抽象化し、ドメインロジックが実装に縛られないようにする(依存性逆転)。
- フロントエンドは MVVM/コンポーネント構造で — ビュー(テンプレート)・状態(store/composable)・API 呼び出し(service)を分離し、コンポーネントにビジネスロジックを置かない。

## 2. ルール

### 2-1. 標準レイヤ (バックエンド)

```
요청 → Controller → Service → Repository → DB
        (검증/변환)  (로직)    (데이터접근)
```

| レイヤ | 責務 | 置いてはいけないもの |
|---|---|---|
| Controller | リクエストのパース・入力検証・レスポンス変換 | ビジネスルール、SQL |
| Service | ビジネスロジック・トランザクション・ポリシー | HTTP/リクエストオブジェクト、直接の SQL |
| Repository | データアクセス(クエリ) | ビジネス判断 |

- **依存方向**: Controller→Service→Repository(一方向)。逆参照禁止。
- **DTO 境界**: レイヤ間は DTO で。DB エンティティをコントローラ/ビューまでそのまま流さない(過露出・結合)。
- **依存性逆転**: 外部依存(DB・外部 API)はインターフェースの背後へ → ドメインロジックが実装に縛られない(Clean/Hexagonal)。

### 2-2. フロントエンド (MVVM / コンポーネント)

```
View(템플릿) ── 상태(store/composable) ── API(service 모듈)
```

- コンポーネントは**表示**のみ。データ加工・ポリシーは composable/store/service へ。
- API 呼び出しをコンポーネントに散らさず service レイヤに集める。
- グローバル状態は store、画面ローカル状態はコンポーネント — 境界を混ぜない。

## 3. よくあるミス

AI がよく作るもの — レビュー時に弾く。

- ❌ コントローラメソッドの中に if/計算/SQL が入り混じった「fat controller」
- ❌ Vue コンポーネントの `<script setup>` にビジネスルール・複雑なデータ加工
- ❌ DB エンティティを API レスポンスとしてそのまま返す(フィールド過露出)
- ❌ Service が HttpServletRequest などの Web 層オブジェクトに依存
- ❌ Repository が Service を呼ぶ逆方向参照

> **適用のヒント**: AGENTS.md / ルールファイルに「ビジネスロジックは Service にのみ、コントローラは薄く」の一行を埋め込んでおけば、エージェントは生成のたびにこの境界を守る。(『エージェントルールファイル』スキルと併用すると効果的)

## 4. チェックリスト

- [ ] ビジネスロジックが Service レイヤにのみあるか(コントローラ・UI に混ざっていないか)
- [ ] 依存方向が Controller→Service→Repository の一方向か(逆参照なし)
- [ ] レイヤ間を DTO でやり取りし、DB エンティティを外部にそのまま露出していないか
- [ ] 外部依存(DB・外部 API)をインターフェースの背後に抽象化したか
- [ ] フロントエンドのコンポーネントが表示のみを担い、API 呼び出しを service に集めたか
