---
name: トランザクションとロック (Transaction & Locking)
description: トランザクション境界・伝播・分離レベル・悲観/楽観ロック・デッドロック回避の汎用標準である — トランザクションは短く、外部I/Oは境界の外へ、衝突頻度でロック戦略を選び、ロック順序を一貫させる。トランザクション境界を定めたり、同時更新・在庫減算・送金整合性を扱う際、コネクションプール枯渇・デッドロック・ロールバック漏れを点検する際に読む。キーワード: transaction, propagation, isolation, deadlock, pessimistic lock, optimistic lock, SELECT FOR UPDATE, version, rollback.
rules:
  - "トランザクション境界はビジネス層（サービス単位）に: 一単位の作業の開始と終了をサービス境界に置く。入口（コントローラ/ハンドラ）やデータアクセス層にトランザクション境界を置かない — 責任境界が崩れる。"
  - "トランザクションは短く保つ: トランザクションの長さ = コネクション占有時間 = 同時実行の限界。すべての最適化は「トランザクションを短く」に帰着する。"
  - "トランザクション内での外部呼び出し・待機を禁止する: 外部API呼び出し、スリープ/待機、大容量I/Oをトランザクション境界の中で行わない — その間コネクションを掴んでプールを枯渇させる（connection-pool-tuningスキルのプール枯渇シナリオに直結）。"
  - "衝突頻度でロック戦略を選ぶ: 同時修正の衝突がまれならバージョンベースの楽観ロックで検知・再試行し、衝突が頻繁または整合性が決定的なら行ロックベースの悲観ロックを使う。"
  - "複数の資源は常に同じ順序でロックする: ロック取得順序を一貫させてデッドロックを回避する。"
  - "分離レベルは必要な分だけ上げる: 既定はコミット済み読み取り、同一性保証が必要な区間のみ一段階上げ、直列化は最後の手段とする。"
  - "失敗は必ずロールバックにつなげる: 例外を握りつぶしたり、ロールバック対象から外れる例外型を放置して部分コミットが漏れないようにする。"
tags:
  - "transaction"
  - "propagation"
  - "isolation"
  - "deadlock"
  - "pessimistic lock"
  - "optimistic lock"
  - "SELECT FOR UPDATE"
  - "version"
  - "rollback"
  - "@Transactional"
  - "ACID"
  - "PESSIMISTIC"
  - "OPTIMISTIC"
  - "rollbackFor"
---

# 🔒 トランザクションとロック (Transaction & Locking)

> トランザクションを短く・明確に・外部呼び出しなしで運用し、同時更新は衝突頻度に合ったロック戦略で扱う。トランザクション境界を定めたり、同時更新・整合性・デッドロックを扱う際に読む。特定の言語/フレームワークに依存しない汎用標準である。

## 1. 中核原則
- **トランザクション境界はビジネス層（サービス単位）に**: 一単位の作業の開始と終了をサービス境界に置く。入口（コントローラ/ハンドラ）やデータアクセス層にトランザクション境界を置かない — 責任境界が崩れる。
- **トランザクションは短く保つ**: トランザクションの長さ = コネクション占有時間 = 同時実行の限界。**すべての最適化は「トランザクションを短く」に帰着する。**
- **トランザクション内での外部呼び出し・待機を禁止する**: 外部API呼び出し、スリープ/待機、大容量I/Oをトランザクション境界の中で行わない — その間コネクションを掴んでプールを枯渇させる（connection-pool-tuningスキルのプール枯渇シナリオに直結）。
- **衝突頻度でロック戦略を選ぶ**: 同時修正の衝突がまれならバージョンベースの**楽観ロック**で検知・再試行し、衝突が頻繁または整合性が決定的なら行ロックベースの**悲観ロック**を使う。
- **複数の資源は常に同じ順序でロックする**: ロック取得順序を一貫させてデッドロックを回避する。
- **分離レベルは必要な分だけ上げる**: 既定はコミット済み読み取り、同一性保証が必要な区間のみ一段階上げ、直列化は最後の手段とする。
- **失敗は必ずロールバックにつなげる**: 例外を握りつぶしたり、ロールバック対象から外れる例外型を放置して部分コミットが漏れないようにする。

## 2. ルール

### 2-1. トランザクション境界はサービス単位に、コントローラ/DAO禁止
- 一単位の作業（複数の書き込みを原子的にまとめるべき範囲）をサービス境界に置く。
- 入口ハンドラやデータアクセス層でトランザクションを開かない — 境界が散らばると、どこでコミット/ロールバックされるか追跡できない。

```text
// ❌ 禁止 — 入口/データ層にトランザクション境界
handler(req):
  begin tx
    ...
  commit                 // 責任境界の破壊、追跡不可

// ✅ 推奨 — サービスの一メソッドが一単位の作業の境界
service.placeOrder(req):
  begin tx
    orders.insert(...)
    payments.insert(...)  // 片方が失敗したら全体ロールバック
  commit
```

### 2-2. 伝播(propagation): 参加 / 独立 / 禁止 の3つで十分
ほとんどのケースは三つの意味で済む。残りの伝播モードはほとんど使う機会がない。

- **参加（既存トランザクションに合流、なければ新規開始）**: 既定値。呼び出しの束が一つの原子単位になる。
- **独立（親と分離された別トランザクション）**: 監査ログ・失敗記録のように、親がロールバックされても生き残るべき作業。ただし**別コネクションを追加で占有**するため、プールサイズ算定に必ず反映する（connection-pool-tuningスキル参照）。
- **禁止（トランザクション内で呼び出されたら拒否）**: 外部API・長時間作業のように、絶対にトランザクション境界の中で動いてはならない作業のガード。

```text
// 参加  — 一トランザクション、片方が失敗したら全体ロールバック
placeOrder: [ orders.insert ; payments.insert ]   (one tx)

// 独立  — 親のロールバックと無関係にコミット（別コネクション占有に注意）
writeAuditLog(event): (new tx) audit.insert(event)

// 禁止  — トランザクション内で呼び出されたら例外で阻止
callExternalApi(): assert no-active-tx ; external.post(...)
```

### 2-3. 分離レベル(isolation): 必要な分だけ上げる
| レベル | 用途 | 備考 |
|---|---|---|
| コミット済み読み取り (Read Committed) | **既定値（推奨）**。大半のOLTP | ダーティリード遮断 |
| 反復可能読み取り (Repeatable Read) | 一トランザクションで同じ行を複数回読み同一性保証が必要（精算、在庫減算） | 一段階上 |
| 直列化 (Serializable) | 最後の手段 | ロック爆発/スループット急減 |
| コミットされていない読み取り (Read Uncommitted) | 使用禁止 | ダーティリード |

```text
// 同じ残高を二度読んでも同一保証が必要な区間のみ一段階上げる
settleAccount(accountId): isolation = RepeatableRead { ... }
```

> 既定の分離レベルと名称はDB製品ごとに異なる。チームが使うDBの既定値を確認し、「必要な区間のみ上げる」という原則に従う。

### 2-4. 悲観ロック: 行を先にロックして作業 (SELECT ... FOR UPDATE)
同時に同じ行を修正する可能性が高いとき（在庫減算、座席予約）。

- 読む時点で行をロックし、トランザクションが終わるまで他のトランザクションの修正を阻む。
- ロック範囲は**必ずトランザクション内でのみ有効**である。ロックをトランザクションの外へ持ち出せない。

```text
// ✅ 悲観ロック — ロックし、確認し、更新（全区間一トランザクション）
decreaseStock(productId, qty):
  begin tx
    stock = SELECT stock FROM products WHERE id = productId FOR UPDATE  // 行ロック
    if stock < qty: throw OutOfStock
    UPDATE products SET stock = stock - qty WHERE id = productId
  commit                                                                // ロック解除
```

> キュー/ワーカーパターンでロックされた行をスキップして取得する変形（例: ロックされた行のスキップ）をサポートするDBもある。チームDBのサポート可否を確認する。

### 2-5. 楽観ロック: バージョンで衝突を検知し再試行
読み取りの比重が圧倒的で、同時修正の衝突がまれなとき。

- 行にバージョン値を置き、更新時に「自分が読んだバージョンと同じときのみ」更新しバージョンを上げる。
- 更新された行が0なら、その間に誰かが先に変えたということ → 衝突とみなし**再読み取りして再試行**する。

```text
// 行に version カラムを置く
products(id, stock, version, ...)

// ✅ 楽観ロック — 読んだバージョンがそのままのときのみ更新、0件なら衝突 → 再試行
updateStock(id, newStock):
  retry up to N times:
    cur = read(id)                       // cur.version を確保
    affected = UPDATE products
                 SET stock = newStock, version = cur.version + 1
               WHERE id = id AND version = cur.version
    if affected == 0: conflict → 再試行
    else: 成功
```

> 衝突率がおよそ5%を超えると楽観ロックはむしろ非効率（再試行の浪費）— 悲観ロックへの切り替えを検討する。

### 2-6. デッドロック回避: ロック順序の一貫性
- **ロック取得順序を一貫させる**: 複数の資源をロックする際、常に同じ基準でソートしてロックする。一方がA→B、他方がB→Aでロックすると即座にデッドロック。
- **トランザクションを短く**: ロック保有時間がそのままデッドロック確率である。
- **インデックスのない大量更新を禁止**: 条件にインデックスがないとフルスキャンし、行ロックがより広いロックに拡張されうる。

```text
// ❌ 禁止 — 呼び出し元ごとにロック順序が異なる → デッドロック
transfer(from, to): lock(from) ; lock(to)   // 別のリクエストは lock(to);lock(from)

// ✅ 推奨 — 常に同じ順序（例: id昇順）でロックする
transfer(from, to):
  first  = min(from, to)
  second = max(from, to)
  lock(first) ; lock(second)
  // ここで実際の送金
```

### 2-7. 外部呼び出しはトランザクション境界の外へ
- 外部API・リモート呼び出し・長時間待機はトランザクションを開く前か閉じた後に行う。
- 大きな単位の作業は「短いトランザクション → 外部呼び出し → 短いトランザクション」に分割する。

```text
// ❌ 禁止 — トランザクションを占有したまま外部API待機 → コネクションプール枯渇
begin tx
  orders.insert(...)
  payment.charge(...)   // 数秒待機 → その間コネクション占有
  orders.markPaid(...)
commit

// ✅ 推奨 — 外部呼び出しを境界の外へ分離
orderId = (tx) createPending(...)     // 短いTX
result  = payment.charge(...)         // TX外
          (tx) markPaid(orderId, result)  // 短いTX
```

> 外部呼び出し1秒 × プールサイズ10なら、同時11番目のリクエストから即座にタイムアウト。connection-pool-tuningスキルのプール枯渇シナリオに直結する。

### 2-8. 読み取り専用の意図表示
- 書き込みのない作業は「読み取り専用」であることを明示する — 一部のランタイム/ORMはこれを根拠に最適化（不要なフラッシュ省略など）し、そうでなくても「この作業は変更がない」というレビューシグナルになる。
- 読み取り専用境界の中で書き込みを呼び出さない。

```text
// ✅ 推奨 — 照会作業は読み取り専用として表示
findAll(): readOnly { ... }
```

### 2-9. 自己呼び出し/迂回経路でトランザクションが漏れないように
宣言的トランザクションが**呼び出し横取り（インターセプション/プロキシ）**で動作する環境では、同じオブジェクト内部で自己メソッドを直接呼ぶと横取りを迂回し、トランザクション設定が無視されうる。

- トランザクション境界が必要なメソッドは**別の単位（別コンポーネント）に分離し、外部経路で呼び出される**ようにする。
- 同じ罠が同一メカニズムで動作する他の宣言的機能（非同期実行・キャッシュなど）にも適用される — scheduler-asyncスキルの自己呼び出しの罠と同じメカニズム。

```text
// ❌ バグ — 同じオブジェクト内部の直接呼び出しが横取りを迂回 → トランザクション無視
outer():            // トランザクション境界
  this.inner()      // innerのトランザクション設定がかからない

// ✅ 推奨 — innerを別単位に分離し境界が保証されるよう呼び出す
outer(): other.inner()   // 外部経路 → トランザクション設定適用
```

### 2-10. 失敗がロールバックにつながるように
- **例外を握りつぶさない**: try/catchで捕まえてログだけ残すと作業はそのままコミットされる。失敗を知らせるには例外を再スローするか明示的にロールバックする。
- **ロールバック対象から外れる例外型に注意**: 環境によっては特定の例外型（例: 一部の言語の検査例外）は既定でロールバックをトリガーしないことがある。その場合はロールバック対象を明示する。

```text
// ❌ 禁止 — 例外を握りつぶして部分コミットが漏れる
save():
  begin tx
    try { mapper.insert(...) }
    catch (e) { log(e) }   // スローしないとそのままコミットされる
  commit

// ✅ 推奨 — 失敗時に例外を伝播してロールバック
save():
  begin tx
    mapper.insert(...)     // 例外発生時にロールバック
  commit
```

## 3. よくあるミス
- **トランザクションが長い** → 外部呼び出し/待機/大容量I/Oが境界の中にあり、コネクションを長く掴み同時実行が崩れる。境界を短く分割する。
- **外部呼び出しをトランザクション内で** → プール枯渇の第一原因。呼び出しを境界の外へ出す。
- **ロック順序の不一致** → 二つの資源を互いに異なる順序でロックしデッドロック。常に同じ基準でソートしてロックする。
- **衝突頻度に合わないロック選択** → 衝突が頻繁なのに楽観ロック（再試行の浪費）・まれなのに悲観ロック（不要な直列化）。頻度で選ぶ。
- **例外の握りつぶし** → 捕まえてログだけ残し失敗がコミットされる。再スローするか明示的にロールバックする。
- **ロールバックされない例外型の放置** → 特定の例外が既定のロールバック対象でなく部分コミットが漏れる。ロールバック対象を明示する。
- **自己呼び出しでトランザクション漏れ** → 横取り迂回で設定が無視される。別単位に分離する。
- **分離レベルを過度に上げる** → 全域直列化でスループット急減。必要な区間のみ一段階上げる。
- **インデックスのない大量更新** → 行ロックが広いロックに拡張され同時実行崩壊。更新条件にインデックスを置く。

## 4. チェックリスト
- [ ] トランザクション境界を**サービス単位**に置いたか（入口/データ層禁止）
- [ ] トランザクション内の外部呼び出し・待機・大容量I/O を除去したか
- [ ] 大きな作業を「短いTX → 外部呼び出し → 短いTX」に分割したか
- [ ] 衝突頻度に合わせて悲観ロック / 楽観ロックを選択したか
- [ ] 複数の資源のロックを常に同じ順序で取得するか（デッドロック回避）
- [ ] 分離レベルを必要な区間のみ一段階上げたか（全域直列化回避）
- [ ] 自己呼び出し/迂回経路でトランザクションが漏れる箇所はないか
- [ ] 失敗が必ずロールバックにつながるか（例外握りつぶし・ロールバック漏れの点検）
- [ ] 独立トランザクションが追加で占有するコネクションをプールサイズに反映したか

## 付録: スタック別の例

> 以下は上の1〜4標準をSpring(Java)にマッピングしたコード例だ。概念・原則の説明は本文（括弧内の節番号）を参照し、ここではSpring固有の適用のみを扱う。チームが使う他のスタックは同じパターンで追加する。

### Spring (Java)

`@Transactional`（AOPプロキシベース）でサービスメソッドにトランザクション境界を置き、MyBatisマッパーでロックをかける。

#### 伝播(2-2) — `REQUIRED` / `REQUIRES_NEW` / `NEVER`

```java
@Transactional                                                   // 参加（既定）
public void placeOrder(OrderRequest req) { orderMapper.insert(...); paymentMapper.insert(...); }

@Transactional(propagation = Propagation.REQUIRES_NEW)            // 独立 — 別コネクション占有に注意
public void writeAuditLog(AuditEvent event) { auditMapper.insert(event); }

@Transactional(propagation = Propagation.NEVER)                   // 禁止 — 外部APIガード
public void callExternalApi() { restClient.post(...); }
```

#### 分離レベル(2-3) — Spring既定値とのマッピング

本文表の各レベルに対応するenumとDB別の既定値のみ記す。

| Spring enum | 本文レベル | DB既定値 |
|---|---|---|
| `READ_COMMITTED` | コミット済み読み取り（既定推奨） | Postgres·Oracle既定 |
| `REPEATABLE_READ` | 反復可能読み取り | MariaDB/MySQL既定 |
| `SERIALIZABLE` | 直列化（最後の手段） | — |
| `READ_UNCOMMITTED` | コミットされていない読み取り（禁止） | — |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void settleAccount(Long accountId) { /* 同じ残高を二度読んでも同一保証 */ }
```

#### 悲観ロック(2-4) — MyBatis `FOR UPDATE`

```xml
<select id="selectStockForUpdate" resultType="int">
    SELECT stock_count FROM products WHERE id = #{id} FOR UPDATE
</select>
```
```java
@Transactional
public void decreaseStock(Long productId, int qty) {
    int stock = productMapper.selectStockForUpdate(productId);  // 行ロック
    if (stock < qty) throw new OutOfStockException();
    productMapper.decreaseStock(productId, qty);
}                                                                // トランザクション終了時にロック解除
```

#### 楽観ロック(2-5) — `version` カラム + `@Retryable`

`affected == 0`なら衝突。Spring Retryで再試行を宣言する。

```xml
<update id="updateWithVersion">
    UPDATE products SET stock_count = #{stock}, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = #{id} AND version = #{version}
</update>
```
```java
@Retryable(value = OptimisticLockException.class, maxAttempts = 3, backoff = @Backoff(delay = 50))
@Transactional
public void updateStock(Long id, int stock) {
    Product p = productMapper.findById(id);
    if (productMapper.updateWithVersion(id, stock, p.getVersion()) == 0)
        throw new OptimisticLockException("再試行");
}
```

#### デッドロック回避(2-6) — ロック順序のソート

```java
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    accountMapper.lockForUpdate(Math.min(from, to));   // 常にid昇順
    accountMapper.lockForUpdate(Math.max(from, to));
    // ここで実際の送金
}
```

#### 外部呼び出しは境界の外へ(2-7)

```java
// ✅ トランザクション分離 — 外部APIはTX外
public void placeOrder(...) {
    Long orderId = orderService.createPending(...);  // 短いTX
    PaymentResult r = paymentApi.charge(...);         // TX外
    orderService.markPaid(orderId, r);                // 短いTX
}
```

#### `readOnly = true`(2-8)

```java
@Transactional(readOnly = true)
public List<UserResponse> findAll() { ... }
```
- **JPA**: 1次キャッシュのflush省略など実質的な最適化。**MyBatis**: 意図表示が主（レビューシグナル）。

#### 自己呼び出しの罠(2-9) — プロキシ迂回

```java
@Service
public class OrderService {
    @Transactional
    public void outer() { this.inner(); }   // ❌ プロキシ迂回 → @Transactional無視
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void inner() { ... }
}
```
解決: ① 別のBeanに抽出（推奨） ② `AopContext.currentProxy()` ③ 自己注入（`@Autowired self`）。同じ罠が`@Async`·`@Cacheable`にも適用される（scheduler-asyncスキル）。

#### ロールバック(2-10) — Spring固有の罠

```java
// ❌ 例外握りつぶし → コミットされる
@Transactional
public void save() { try { mapper.insert(...); } catch (Exception e) { log.error("失敗", e); } }

// ❌ 検査例外は既定でロールバックしない → rollbackFor明示が必要
@Transactional   // (rollbackFor = Exception.class)
public void save() throws IOException { mapper.insert(...); throw new IOException(); }
```
- `@Transactional`をcontrollerに置かない（責任境界の破壊）— サービス層で管理する(2-1)。
- トランザクション内で`Thread.sleep`·大容量ファイルI/O禁止(2-7)。
