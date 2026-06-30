---
name: スケジューリングおよび非同期処理の標準 (@Scheduled + @Async + ShedLock)
description: Spring Boot の周期タスクのスケジューリングと非同期実行の標準 — 複数インスタンスで ShedLock により重複実行を防止、専用 ThreadPoolTaskExecutor の登録、@Async 自己呼び出しの落とし穴、非同期とトランザクションの分離、Graceful Shutdown。スケジューラや非同期メソッドを作成したり、重複実行・プール隔離・トランザクションの問題を扱うときに読む。キーワード: @Scheduled, @Async, TaskExecutor, ThreadPoolTaskExecutor, ShedLock, cron, fixedRate, fixedDelay.
rules:
  - "複数インスタンス環境の @Scheduled タスクは ShedLock で重複実行を防ぐ。"
  - "@Async タスクは専用の ThreadPoolTaskExecutor ビーンを登録して隔離する — 用途ごとに分離する。"
  - "@Async 自己呼び出しはプロキシを経由しないため、別ビーンに分離して呼び出す。"
  - "非同期メソッドは呼び出し側のトランザクションと分離し、新しいトランザクションで実行する。"
  - "スケジュール周期とスレッドプールサイズは application.yml で環境ごとに設定する。"
tags:
  - "@Scheduled"
  - "@Async"
  - "TaskExecutor"
  - "ThreadPoolTaskExecutor"
  - "ShedLock"
  - "cron"
  - "fixedRate"
  - "fixedDelay"
---

# ⏰ スケジューリングおよび非同期処理の標準 (@Scheduled + @Async + ShedLock)

> 周期タスクと非同期実行を隔離・観測可能なように標準化し、複数インスタンスの重複実行を防ぐ。スケジューラや非同期メソッドを作成したり、重複実行・プール・トランザクションの問題を扱うときに読む。

## 1. 基本原則
- 複数インスタンス環境の `@Scheduled` タスクは ShedLock で重複実行を防ぐ。
- `@Async` タスクは専用の `ThreadPoolTaskExecutor` ビーンを登録して隔離する — 用途ごとに分離する。
- `@Async` 自己呼び出しはプロキシを経由しないため、別ビーンに分離して呼び出す。
- 非同期メソッドは呼び出し側のトランザクションと分離し、新しいトランザクションで実行する。
- スケジュール周期とスレッドプールサイズは `application.yml` で環境ごとに設定する。

## 2. ルール

### 2-1. 依存関係
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'

    // 分散環境での重複実行防止
    implementation 'net.javacrumbs.shedlock:shedlock-spring:5.13.0'
    implementation 'net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.13.0'
    // Redis でロックを管理する場合の代替:
    // implementation 'net.javacrumbs.shedlock:shedlock-provider-redis-spring:5.13.0'
}
```

### 2-2. application.yml
```yaml
spring:
  application:
    name: harness-batch
  task:
    execution:
      pool:
        core-size: 8
        max-size: 32
        queue-capacity: 200
        keep-alive: 60s
      thread-name-prefix: harness-async-
      shutdown:
        await-termination: true
        await-termination-period: 30s
    scheduling:
      pool:
        size: 4
      thread-name-prefix: harness-sched-
      shutdown:
        await-termination: true
        await-termination-period: 30s

harness:
  scheduler:
    asset-sync-cron: "0 */10 * * * *"   # 10分ごと
    report-daily-cron: "0 0 2 * * *"    # 毎日 02:00
```

> Spring Boot は上記設定で `taskExecutor`/`taskScheduler` ビーンを作成してくれるが、非同期タスクの隔離・観測のためには**明示的なビーン登録**(2-4)を推奨する。

### 2-3. スケジューリングの有効化 + ShedLock
`config/SchedulingConfig.java`:
```java
package com.harness.config;

import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import net.javacrumbs.shedlock.support.LockProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import javax.sql.DataSource;

@Configuration
@EnableScheduling
@EnableAsync
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class SchedulingConfig {

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        return new JdbcTemplateLockProvider(
            JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(new JdbcTemplate(dataSource))
                .usingDbTime()   // DB サーバー時刻基準 → インスタンス間の時計差に影響されない
                .build()
        );
    }
}
```

ShedLock 用テーブル(Postgres):
```sql
CREATE TABLE shedlock (
    name       VARCHAR(64)  PRIMARY KEY,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);
```

### 2-4. 専用 ThreadPoolTaskExecutor ビーン
> 既定の `SimpleAsyncTaskExecutor` には**プールがない**。呼び出しごとにスレッドを新規作成し、OOM のリスクがある。必ずプールベースの Executor に置き換える。

`config/AsyncConfig.java`:
```java
package com.harness.config;

import org.slf4j.MDC;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class AsyncConfig implements AsyncConfigurer {

    @Bean(name = "assetTaskExecutor")
    public Executor assetTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(32);
        executor.setQueueCapacity(200);
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("asset-async-");

        // プール+キュー飽和時のポリシー: 呼び出しスレッドが直接実行（バックプレッシャー効果）
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());

        // Graceful shutdown
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);

        // MDC コンテキスト伝播（traceId/userId を維持）
        executor.setTaskDecorator(runnable -> {
            Map<String, String> mdc = MDC.getCopyOfContextMap();
            return () -> {
                Map<String, String> previous = MDC.getCopyOfContextMap();
                if (mdc != null) MDC.setContextMap(mdc);
                try {
                    runnable.run();
                } finally {
                    if (previous != null) MDC.setContextMap(previous);
                    else MDC.clear();
                }
            };
        });

        executor.initialize();
        return executor;
    }

    @Override
    public Executor getAsyncExecutor() {
        return assetTaskExecutor();
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return (ex, method, params) ->
            org.slf4j.LoggerFactory.getLogger(method.getDeclaringClass())
                .error("非同期メソッド例外 method={} params={}", method.getName(), params, ex);
    }
}
```

> 用途ごとに Executor を分けること。ドメインごとに別の `@Bean`（例: `notificationTaskExecutor`, `reportTaskExecutor`）を作り、`@Async("ドメインExecutor")` で指定すれば、一方のタスクの急増がもう一方を塞がない。

### 2-5. @Scheduled の使用パターン
```java
package com.harness.src.asset.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class AssetSyncScheduler {

    private final AssetSyncService assetSyncService;

    /**
     * 10分ごとに SAP PM 資産を同期。
     * - cron: 開始時刻固定（定時基準）
     * - fixedDelay: 直前の実行終了後 N ms（タスクが重ならない）
     * - fixedRate:  直前の実行開始後 N ms（長いタスクでは重なる可能性があり危険）
     */
    @Scheduled(cron = "${harness.scheduler.asset-sync-cron}", zone = "Asia/Seoul")
    @SchedulerLock(name = "AssetSyncScheduler.sync",
                   lockAtLeastFor = "PT30S",   // 早すぎる再実行を防止
                   lockAtMostFor  = "PT9M")    // 失敗時にロックを自動解除
    public void sync() {
        log.info("資産同期スケジュール開始");
        try {
            assetSyncService.syncFromSap();
        } catch (Exception e) {
            log.error("資産同期失敗", e);   // 例外を投げるとスケジューラが次の実行をスキップしないよう catch
        }
    }

    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT10S")
    @SchedulerLock(name = "AssetSyncScheduler.healthcheck")
    public void healthcheck() {
        assetSyncService.pingDownstream();
    }
}
```

### 2-6. @Async の使用パターン + 自己呼び出しの落とし穴
> **同じクラス内のメソッドを呼び出すと `@Async` は動作しない。** Spring AOP はプロキシベースのため、`this.foo()` はプロキシを経由しないから。別ビーンに分離するか、自分自身をビーンとして注入する必要がある。

```java
// ❌ アンチパターン: 同じクラスの self-call → 同期実行される
@Service
public class ReportService {
    public void run() {
        sendNotification();  // ❌ @Async 無効
    }

    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}

// ✅ 推奨 1: 非同期メソッドを別ビーンに分離
@Service
@RequiredArgsConstructor
public class ReportService {
    private final NotificationAsyncService asyncService;

    public void run() {
        asyncService.sendNotification();  // 別ビーン → プロキシ経由 → 非同期動作
    }
}

@Service
public class NotificationAsyncService {
    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}
```

戻り値の型:
```java
@Service
public class AssetAsyncService {

    // void: fire-and-forget
    @Async("assetTaskExecutor")
    public void notify(String tagId) { ... }

    // CompletableFuture: 結果の await/組み合わせが可能
    @Async("assetTaskExecutor")
    public CompletableFuture<AssetResponse> fetchAsync(String tagId) {
        return CompletableFuture.completedFuture(assetDao.findByTagId(tagId));
    }
}

// 使用
CompletableFuture<AssetResponse> f1 = asyncService.fetchAsync("TAG-001");
CompletableFuture<AssetResponse> f2 = asyncService.fetchAsync("TAG-002");
CompletableFuture.allOf(f1, f2).join();
```

### 2-7. 非同期とトランザクションの分離
> `@Async` は新しいスレッドで実行されるため、**呼び出し側の `@Transactional` は伝播しない。** 非同期メソッド内で DB 処理を行うには、そのメソッド自体に `@Transactional` を付ける。また、トランザクションのコミット**前に**非同期タスクが開始されると、まだ見えないデータを読む可能性があり危険。

```java
@Service
@RequiredArgsConstructor
public class AssetService {

    private final NotificationAsyncService asyncService;
    private final AssetDao assetDao;

    @Transactional
    public void createAsset(AssetCreateRequest req) {
        assetDao.insert(req);
        // ❌ ここで呼び出すと非同期スレッドがまだコミットされていないデータを見られない
        // asyncService.sendNotification(req.getTagId());

        // ✅ トランザクションのコミット後に呼び出すことを保証
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override public void afterCommit() {
                    asyncService.sendNotification(req.getTagId());
                }
            }
        );
    }
}
```

```java
@Service
public class NotificationAsyncService {

    @Async("assetTaskExecutor")
    @Transactional   // 非同期メソッド自体にトランザクション
    public void sendNotification(String tagId) {
        // ...
    }
}
```

### 2-8. Graceful Shutdown
`application.yml`:
```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
```

> Kubernetes などで SIGTERM を受けると、進行中の非同期/スケジュールタスクが終わるまで待つ。`setWaitForTasksToCompleteOnShutdown(true)` + `setAwaitTerminationSeconds(30)` の組み合わせが必須。

## 3. よくあるミス
- **HTTP レスポンス内で長いタスクを同期処理**: ユーザーが 30 秒待つ。`@Async` + 即時レスポンス + 状態ポーリングまたはウェブフック。
- **同じクラスの self-call で `@Async` を呼び出す**: 無効。別ビーンに分離。
- **`SimpleAsyncTaskExecutor` の既定値をそのまま使う**: スレッドの無限生成 → OOM。
- **複数インスタンスで `@Scheduled` のみ使用**: すべてのインスタンスが同時実行される。ShedLock 必須。
- **`fixedRate` で長いタスクを実行**: 前のタスクが終わっていないのに次のタスクが開始して重なる。`fixedDelay` または `cron` + ShedLock を使用。
- **スケジュールメソッドで例外を propagate**: 次の実行が塞がれる可能性がある。catch してログ出力。
- **トランザクション内で非同期呼び出し**: 非同期スレッドはコミット前のデータを見られない。`afterCommit` コールバックを使用。
- **共有可変状態（static 変数）の使用**: 非同期環境での race condition。不変オブジェクトまたは並行データ構造。
- **プールサイズ無限大（`Integer.MAX_VALUE`）**: キューが無限だとタスクが溜まり OOM。適正な `queueCapacity` + `CallerRunsPolicy`。

```java
// アンチパターン
@Async   // ❌ Executor 未指定 → 既定の SimpleAsyncTaskExecutor
public void process() { ... }

// 推奨
@Async("assetTaskExecutor")   // ✅ 明示的なプール指定
public void process() { ... }
```

## 4. チェックリスト
- [ ] 複数インスタンスの `@Scheduled` に ShedLock(`@SchedulerLock`)を掛けたか
- [ ] `@Async` に専用のプールベース Executor を明示指定したか（SimpleAsyncTaskExecutor 不使用）
- [ ] Executor を用途ごとに分離したか
- [ ] `@Async` 自己呼び出しではなく別ビーンを経由しているか
- [ ] 非同期メソッドに `@Transactional` を付け、コミット後(`afterCommit`)に呼び出しているか
- [ ] 長いタスクに `fixedRate` の代わりに `fixedDelay`/`cron` を使ったか
- [ ] Graceful Shutdown(`waitForTasksToCompleteOnShutdown` + `awaitTermination`)を設定したか
