---
name: gRPC サービス設計
description: protobuf 契約、ストリーミング、標準エラーモデル、フィールド互換性、内部サービス間通信の標準。gRPC サービスを設計する、または proto 契約・ストリーミング・互換性を扱うときに読む。キーワード: grpc, protobuf, streaming, rpc, backward-compatibility.
rules:
  - "proto ファイルが単一契約(source of truth) — クライアント・サーバーコードは proto から生成し手で直さない。"
  - "フィールド番号は絶対に再利用しない — フィールド削除時は reserved で予約し下位互換を守る。"
  - "エラーは google.rpc.Status + 標準コード(NOT_FOUND・INVALID_ARGUMENT・DEADLINE_EXCEEDED など)で表現する。"
  - "用途に合わせ unary/ストリーミングを選ぶ — 単件は unary、大容量・リアルタイムは server/client/bidi ストリーミング。"
  - "gRPC は内部サービス間通信に適する — 外部公開 API はゲートウェイで REST/GraphQL に公開する。"
tags:
  - "grpc"
  - "protobuf"
  - "streaming"
  - "rpc"
  - "backward-compatibility"
---

# 📡 gRPC サービス設計

> proto 契約・ストリーミング・エラー・互換性を標準化する。gRPC サービスを設計する、または内部サービス間通信を定めるときに読む。

HTTP/2 ベースのバイナリ RPC で、低遅延・ストリーミング・強い型付け契約が強みだ。内部 MSA 通信に主に使う。

## 1. 核心原則
- proto ファイルが単一契約(source of truth) — クライアント・サーバーコードは proto から生成し手で直さない。
- フィールド番号は絶対に再利用しない — フィールド削除時は reserved で予約し下位互換を守る。
- エラーは `google.rpc.Status` + 標準コード(NOT_FOUND・INVALID_ARGUMENT・DEADLINE_EXCEEDED など)で表現する。
- 用途に合わせ unary/ストリーミングを選ぶ — 単件は unary、大容量・リアルタイムは server/client/bidi ストリーミング。
- gRPC は内部サービス間通信に適する — 外部公開 API はゲートウェイで REST/GraphQL に公開する。

## 2. 規則

### 2-1. 契約優先 (proto codegen)
proto でメッセージ・サービスを定義しコードを生成する。変更は proto レビューで管理する。

```proto
syntax = "proto3";
package user.v1;                 // パッケージにバージョンを埋め込み互換崩壊時に v2 へ分離

service UserService {
  rpc GetUser(GetUserRequest) returns (User);             // unary
  rpc ListUsers(ListUsersRequest) returns (stream User);   // server streaming
  rpc UploadEvents(stream Event) returns (UploadSummary);  // client streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage); // bidi
}

message GetUserRequest { string id = 1; }
message User {
  string id = 1;
  string name = 2;
  // フィールド削除の痕跡 — 番号・名前の再利用禁止
  reserved 3;
  reserved "legacy_email";
}
```
```text
// ❌ 禁止 — 生成された stub/サーバーコードを手で修正 (再生成時に消失)
// ✅ 推奨 — proto のみ修正し codegen、生成物はビルド成果物として扱う
```

### 2-2. フィールド互換性 (reserved)
フィールド追加は安全(新番号)、削除・番号変更は危険 — `reserved` で予約する。フィールドの意味(型)を変えることも breaking change だ。

```proto
// ❌ 禁止 — 削除したフィールド番号を再利用 / 型変更(int32 → string)
// ✅ 推奨 — 削除時は reserved、変更の代わりに新フィールド追加
message Order {
  reserved 2, 5 to 7;
  reserved "old_status";
  string id = 1;
  OrderStatus status = 8;        // 旧フィールドの代替は新番号で
}
```

### 2-3. エラー処理
一般例外を投げず、`google.rpc.Status` + 標準コード + details(構造化エラー)でクライアントが分岐できるようにする。

```text
// ❌ 禁止 — throw new RuntimeException("not found")  → クライアントは INTERNAL としか見えない
// ✅ 推奨 — 標準コード + 構造化 details
Status.newBuilder()
  .setCode(Code.NOT_FOUND_VALUE)
  .setMessage("user not found")
  .addDetails(Any.pack(ErrorInfo.newBuilder()
      .setReason("USER_NOT_FOUND").putMetadata("id", req.getId()).build()))
  .build();
```
主要な標準コード: `INVALID_ARGUMENT`(検証失敗) · `NOT_FOUND` · `ALREADY_EXISTS` · `PERMISSION_DENIED` · `UNAUTHENTICATED` · `DEADLINE_EXCEEDED` · `UNAVAILABLE`(再試行候補) · `RESOURCE_EXHAUSTED`(rate limit)。

### 2-4. ストリーミング選択
用途に合った RPC 種類を選ぶ。無限・大容量を unary で受けるとメモリが爆発する。

| 種類 | 形態 | 用途 |
|---|---|---|
| unary | 1 リクエスト → 1 レスポンス | 単件照会/コマンド |
| server streaming | 1 リクエスト → N レスポンス | 大容量リスト、リアルタイムフィード/購読 |
| client streaming | N リクエスト → 1 レスポンス | アップロード、バッチ投入、集計 |
| bidi streaming | N ↔ N | チャット、双方向リアルタイム同期 |

### 2-5. 可観測性 & deadline
trace-id 伝播 + インターセプタでロギング・認証を横断処理し、**クライアントは常に deadline を設定**する。

```text
// ✅ deadline のない呼び出しは障害時に無限待機 → スレッド・コネクション枯渇
stub.withDeadlineAfter(5, TimeUnit.SECONDS).getUser(req);
// サーバーは context.isCancelled() 確認でキャンセルされた作業を早期中断
```

### 2-6. 外部公開
外部公開 API は gRPC を直接公開せず、ゲートウェイ(gRPC-Gateway/BFF)で REST/GraphQL に変換して公開する。(ブラウザは gRPC を直接呼び出せない — gRPC-Web が必要)

## 3. よくある間違い
- ❌ 生成された stub/サーバーコードを手で修正 → proto 再生成時に消失。proto のみ修正する。
- ❌ 削除したフィールド番号・名前の再利用、またはフィールド型変更 → 旧バージョンのクライアントのデコードが壊れる。reserved + 新フィールド。
- ❌ deadline のない呼び出し → ダウンストリーム障害が呼び出し側の資源枯渇へ伝播。
- ❌ 無限/大容量データを unary で → メモリ爆発。ストリーミングで。
- ❌ エラーを一般例外で投げる → クライアントが INTERNAL としか認識しない。`google.rpc.Status` 標準コードで。
- ❌ 外部に gRPC を直接公開 → ゲートウェイで REST/GraphQL に変換。
- ❌ パッケージにバージョンなし(`package user;`) → 互換崩壊時に分離不可。`user.v1` のようにバージョンを埋め込む。

## 4. チェックリスト
- [ ] proto を単一契約とし、コードを生成したか (生成物の修正禁止)
- [ ] 削除したフィールドを reserved で予約したか (番号・名前の再利用・型変更禁止)
- [ ] エラーを `google.rpc.Status` + 標準コード + details で表現したか
- [ ] 用途に合った unary/ストリーミングを選択したか (大容量はストリーミング)
- [ ] クライアントに deadline を設定し trace-id を伝播したか
- [ ] 外部公開はゲートウェイを通じて REST/GraphQL で公開したか
