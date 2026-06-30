---
name: ヘルスチェック & グレースフルシャットダウン (Health Check & Graceful Shutdown)
description: サービスの生存(liveness)・トラフィック受け入れ準備(readiness)を区別して公開し、終了時に処理中のリクエストをドレインするスタック中立な運用標準 — liveness/readiness の分離、依存関係の反映、グレースフルシャットダウン、遅い起動(startup)の分離。ヘルスエンドポイントを作る、無停止デプロイ・オートスケール・コンテナプローブを設定する、または終了中にリクエストが切れるときに読む。キーワード: health-check, liveness, readiness, startup-probe, graceful-shutdown, SIGTERM, drain, zero-downtime。
rules:
  - "liveness ≠ readiness — liveness は「プロセスが生きているか(でなければ再起動)」、readiness は「トラフィックを受ける準備ができたか(でなければ LB から除外)」。混ぜてはならない。"
  - "liveness はシンプルに — 外部依存を入れない。DB・キャッシュ障害で liveness が壊れると正常なインスタンスが無限に再起動する。"
  - "readiness は必須依存を反映しつつ軽量に — トラフィックを受けるのに必須の依存(DB など)が切れたら not-ready でトラフィックを遮断する。ただしチェックは軽量にし、タイムアウト・キャッシュを置く。"
  - "グレースフルシャットダウン — 終了シグナル(SIGTERM)を受けたら即座に死なず: readiness off → 新規リクエスト遮断 → 処理中リクエストのドレイン → 接続の整理 → 終了。"
  - "遅い起動は分離する — 初期化に時間がかかる場合は startup 段階に分離し、起動中を liveness 失敗と誤判定して殺さないようにする。"
  - "ヘルス応答の情報露出に注意 — 詳細な依存関係・バージョン・内部アドレスは認証/内部網のみに。外部公開プローブは最小限の情報のみ。"
tags:
  - "health-check"
  - "liveness"
  - "readiness"
  - "startup-probe"
  - "graceful-shutdown"
  - "SIGTERM"
  - "drain"
  - "zero-downtime"
---

# 💓 ヘルスチェック & グレースフルシャットダウン (Health Check & Graceful Shutdown)

> サービスが「生きているか(liveness)」と「トラフィックを受ける準備ができたか(readiness)」は別の問いだ — この二つを区別して公開し、終了するときは処理中のリクエストを最後まで処理してから抜ける。ヘルスエンドポイントを作る、または無停止デプロイ・オートスケール・コンテナプローブを設定するときに読む。

オーケストレーター(Kubernetes など)・ロードバランサーはヘルスチェックで**再起動するか、トラフィックを送るか**を決める。だからヘルスチェックを誤って作ると運用が揺らぐ — liveness に DB 依存を入れると DB が一瞬遅くなったときに正常なインスタンスが次々に再起動し(再起動の暴走)、終了時にドレインしないとデプロイのたびに処理中のリクエストが切れる。二つの概念を分離し終了を優雅に扱えば無停止デプロイが可能になる。検知・メトリクスは `observability`、コンテナプローブ設定は `docker-containerization` を併せて見る。

## 1. 核心原則

- **liveness ≠ readiness** — liveness は「プロセスが生きているか(でなければ再起動)」、readiness は「トラフィックを受ける準備ができたか(でなければ LB から除外)」。混ぜてはならない。
- **liveness はシンプルに** — 外部依存を入れない。DB・キャッシュ障害で liveness が壊れると正常なインスタンスが無限に再起動する。
- **readiness は必須依存を反映しつつ軽量に** — トラフィックを受けるのに必須の依存(DB など)が切れたら not-ready でトラフィックを遮断する。ただしチェックは軽量にし、タイムアウト・キャッシュを置く。
- **グレースフルシャットダウン** — 終了シグナル(SIGTERM)を受けたら即座に死なず: readiness off → 新規リクエスト遮断 → 処理中リクエストのドレイン → 接続の整理 → 終了。
- **遅い起動は分離する** — 初期化に時間がかかる場合は startup 段階に分離し、起動中を liveness 失敗と誤判定して殺さないようにする。
- **ヘルス応答の情報露出に注意** — 詳細な依存関係・バージョン・内部アドレスは認証/内部網のみに。外部公開プローブは最小限の情報のみ。

## 2. ルール

### 2-1. liveness と readiness を分離して公開する

| プローブ | 問うこと | 失敗時 | 含める対象 |
|---|---|---|---|
| **liveness** | プロセスが生きているか | 再起動(restart) | プロセス自体のみ(外部依存 ❌) |
| **readiness** | トラフィックを受ける準備ができたか | LB/サービスから除外 | 必須依存(DB など)を反映 |
| **startup** | 起動が終わったか | 起動待ち(殺さない) | 遅い初期化の完了可否 |

### 2-2. liveness に外部依存を入れない

```text
❌ 禁止 — liveness が DB を ping → DB の一時障害で正常なアプリが次々に再起動(暴走)
   GET /health/liveness → SELECT 1 from DB

✅ 推奨 — liveness はプロセス生存のみ(イベントループ・デッドロックでない程度)
   GET /health/liveness → 200 (依存検査なし)
```

### 2-3. readiness に必須依存を軽量に反映する

```text
❌ 禁止 — readiness ですべての外部システムを毎回重く点検 → 遅くカスケード
✅ 推奨 — トラフィック処理に「必須」の依存のみ、タイムアウト・短いキャッシュと共に
   GET /health/readiness → 必須 DB 接続の確認(タイムアウト 1s、結果を数秒キャッシュ)
   - 任意依存(推薦サービスなど)が死んだからといって not-ready にしない(部分動作を維持)
```

### 2-4. グレースフルシャットダウンのシーケンスを守る

```text
終了シグナル(SIGTERM)受信時:
  1) readiness を off → LB が新規トラフィックを送らなくなる
  2) (LB 反映まで) 新規リクエスト受信を中断、処理中リクエストは処理を続ける(drain)
  3) 処理中リクエストの完了待ち(シャットダウンタイムアウトの上限を置く)
  4) DB コネクション・キュー消費者・ファイルハンドルなどの資源整理
  5) プロセス終了

❌ 禁止 — SIGTERM で即 exit / ドレインなし → デプロイのたびに処理中リクエストが切れる(5xx)
```

### 2-5. 遅い起動は startup に分離する

```text
❌ 禁止 — 初期化に 30 秒かかるアプリに liveness だけ置くと、起動中を「死」とみなして再起動 → 永遠に立ち上がらない
✅ 推奨 — startup プローブで起動完了を待ってから liveness/readiness を有効化
```

### 2-6. ヘルス応答の情報露出を制御する

```text
❌ 禁止 — 外部公開 /health が DB ホスト・バージョン・内部依存の詳細をそのまま露出
✅ 推奨 — 公開プローブは up/down の最小情報。詳細診断は認証/内部網専用 (`transport-security`)
```

## 3. よくある間違い

- ❌ liveness に DB・キャッシュなど外部依存を含める → 一時障害で正常なインスタンスの再起動暴走
- ❌ liveness と readiness を同じエンドポイントに統合 → トラフィック遮断と再起動が混ざる
- ❌ readiness チェックが重い、またはタイムアウトなし → ヘルスチェック自体が負荷・カスケードを誘発
- ❌ SIGTERM で即終了 → 無停止デプロイのたびに処理中リクエストが 5xx で切れる
- ❌ 遅い起動を startup に分離しない → 起動中を死と誤判定して再起動ループ
- ❌ ヘルスエンドポイントが内部構造・バージョンを外部に露出

> **適用のヒント**: プローブ周期・タイムアウト・失敗閾値はオーケストレーター(Kubernetes など)側の設定と合わせる必要がある — アプリが報告する readiness と LB がトラフィックを抜くタイミングの間の遅延をシャットダウンのドレイン時間に反映する。コンテナ/プローブ設定は `docker-containerization`、依存失敗の回復ポリシーは `error-handling-resilience`。

## 4. チェックリスト

- [ ] liveness と readiness を分離して公開しているか
- [ ] liveness が外部依存を含んでいないか(再起動暴走の防止)
- [ ] readiness が必須依存を軽量に(タイムアウト・キャッシュ)反映しているか
- [ ] SIGTERM 時に readiness off → ドレイン → 資源整理 → 終了の順序を守っているか
- [ ] 遅い起動を startup 段階に分離したか
- [ ] ヘルス応答が機微な内部情報を外部に露出していないか

## 付録: スタック別の例

> 以下は参考用だ。チームのスタックに合わせて同じパターンを適用する。上の 1〜4 の原則が標準であり、付録は適用事例にすぎない。

### Spring Boot (Actuator)

```properties
# liveness/readiness グループの有効化 (Kubernetes 環境では自動)
management.endpoint.health.probes.enabled=true
# → /actuator/health/liveness, /actuator/health/readiness を公開
# readiness グループに必須依存の health indicator を含める(例: db)
management.endpoint.health.group.readiness.include=readinessState,db

# グレースフルシャットダウン
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

- カスタム依存点検は `HealthIndicator` を実装して readiness グループに入れる。liveness グループには外部依存を入れない。

### Node.js

```js
let ready = false
initialize().then(() => { ready = true })          // 起動完了後に readiness on

app.get('/health/liveness', (_req, res) => res.sendStatus(200))   // 依存なし
app.get('/health/readiness', async (_req, res) => {
  if (!ready) return res.sendStatus(503)
  res.sendStatus(await pingDbWithTimeout(1000) ? 200 : 503)        // 必須依存のみ、タイムアウト
})

process.on('SIGTERM', async () => {
  ready = false                                    // 1) readiness off
  await sleep(LB_PROBE_DELAY)                       //    LB が not-ready を検知する時間を確保した後
  server.close(async () => {                       // 2~3) 新規接続中断 + 処理中ドレイン
    await closeDbPool()                            // 4) 資源整理
    process.exit(0)                                // 5) 終了
  })
  setTimeout(() => process.exit(1), 30_000).unref() // ドレインタイムアウトの上限
})
```
