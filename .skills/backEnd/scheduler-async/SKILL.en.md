---
name: Scheduling and Async Processing Standard (@Scheduled + @Async + ShedLock)
description: Standard for scheduling periodic tasks and async execution in Spring Boot — preventing duplicate runs across multiple instances with ShedLock, registering a dedicated ThreadPoolTaskExecutor, the @Async self-invocation pitfall, separating async from transactions, Graceful Shutdown. Read this when building a scheduler or async method, or dealing with duplicate runs, pool isolation, or transaction issues. Keywords: @Scheduled, @Async, TaskExecutor, ThreadPoolTaskExecutor, ShedLock, cron, fixedRate, fixedDelay.
rules:
  - "In a multi-instance environment, guard @Scheduled tasks with ShedLock to prevent duplicate runs."
  - "Isolate @Async tasks by registering a dedicated ThreadPoolTaskExecutor bean — separate them by purpose."
  - "@Async self-invocation bypasses the proxy, so split it into a separate bean and call it from there."
  - "Run async methods in a new transaction, separated from the caller's transaction."
  - "Configure schedule intervals and thread-pool sizes per environment via application.yml."
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

# ⏰ Scheduling and Async Processing Standard (@Scheduled + @Async + ShedLock)

> Standardize periodic tasks and async execution to be isolated and observable, and prevent duplicate runs across multiple instances. Read this when building a scheduler or async method, or dealing with duplicate runs, pools, or transaction issues.

## 1. Core Principles
- In a multi-instance environment, guard `@Scheduled` tasks with ShedLock to prevent duplicate runs.
- Isolate `@Async` tasks by registering a dedicated `ThreadPoolTaskExecutor` bean — separate them by purpose.
- `@Async` self-invocation bypasses the proxy, so split it into a separate bean and call it from there.
- Run async methods in a new transaction, separated from the caller's transaction.
- Configure schedule intervals and thread-pool sizes per environment via `application.yml`.

## 2. Rules

### 2-1. Dependencies
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'

    // Prevent duplicate runs in a distributed environment
    implementation 'net.javacrumbs.shedlock:shedlock-spring:5.13.0'
    implementation 'net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.13.0'
    // Alternative when managing locks with Redis:
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
    asset-sync-cron: "0 */10 * * * *"   # every 10 minutes
    report-daily-cron: "0 0 2 * * *"    # daily at 02:00
```

> Spring Boot creates the `taskExecutor`/`taskScheduler` beans from the settings above, but for isolation/observability of async tasks, **explicit bean registration** (2-4) is recommended.

### 2-3. Enabling Scheduling + ShedLock
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
                .usingDbTime()   // based on DB server time → unaffected by clock skew between instances
                .build()
        );
    }
}
```

Table for ShedLock (Postgres):
```sql
CREATE TABLE shedlock (
    name       VARCHAR(64)  PRIMARY KEY,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);
```

### 2-4. Dedicated ThreadPoolTaskExecutor Bean
> The default `SimpleAsyncTaskExecutor` **has no pool**. It creates a new thread on every call, risking OOM. Always replace it with a pool-based Executor.

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

        // Policy on pool+queue saturation: the calling thread runs it directly (backpressure effect)
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());

        // Graceful shutdown
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);

        // Propagate the MDC context (keep traceId/userId)
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
                .error("async method exception method={} params={}", method.getName(), params, ex);
    }
}
```

> Split Executors by purpose. Create a separate `@Bean` per domain (e.g., `notificationTaskExecutor`, `reportTaskExecutor`) and assign it with `@Async("domainExecutor")`, so a surge in one task does not block the other.

### 2-5. @Scheduled Usage Pattern
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
     * Sync SAP PM assets every 10 minutes.
     * - cron: fixed start time (on-the-hour basis)
     * - fixedDelay: N ms after the previous run ends (runs do not overlap)
     * - fixedRate:  N ms after the previous run starts (can overlap for long tasks, which is risky)
     */
    @Scheduled(cron = "${harness.scheduler.asset-sync-cron}", zone = "Asia/Seoul")
    @SchedulerLock(name = "AssetSyncScheduler.sync",
                   lockAtLeastFor = "PT30S",   // prevent re-running too quickly
                   lockAtMostFor  = "PT9M")    // auto-release the lock on failure
    public void sync() {
        log.info("Starting asset sync schedule");
        try {
            assetSyncService.syncFromSap();
        } catch (Exception e) {
            log.error("Asset sync failed", e);   // catch so a thrown exception does not make the scheduler skip the next run
        }
    }

    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT10S")
    @SchedulerLock(name = "AssetSyncScheduler.healthcheck")
    public void healthcheck() {
        assetSyncService.pingDownstream();
    }
}
```

### 2-6. @Async Usage Pattern + Self-Invocation Pitfall
> **Calling a method within the same class does not make `@Async` work.** Because Spring AOP is proxy-based, `this.foo()` does not go through the proxy. You must split it into a separate bean or inject the bean into itself.

```java
// ❌ Anti-pattern: self-call within the same class → runs synchronously
@Service
public class ReportService {
    public void run() {
        sendNotification();  // ❌ @Async ineffective
    }

    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}

// ✅ Recommended 1: split the async method into a separate bean
@Service
@RequiredArgsConstructor
public class ReportService {
    private final NotificationAsyncService asyncService;

    public void run() {
        asyncService.sendNotification();  // different bean → goes through proxy → runs async
    }
}

@Service
public class NotificationAsyncService {
    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}
```

Return types:
```java
@Service
public class AssetAsyncService {

    // void: fire-and-forget
    @Async("assetTaskExecutor")
    public void notify(String tagId) { ... }

    // CompletableFuture: can await/compose the result
    @Async("assetTaskExecutor")
    public CompletableFuture<AssetResponse> fetchAsync(String tagId) {
        return CompletableFuture.completedFuture(assetDao.findByTagId(tagId));
    }
}

// Usage
CompletableFuture<AssetResponse> f1 = asyncService.fetchAsync("TAG-001");
CompletableFuture<AssetResponse> f2 = asyncService.fetchAsync("TAG-002");
CompletableFuture.allOf(f1, f2).join();
```

### 2-7. Separating Async from Transactions
> Since `@Async` runs in a new thread, **the caller's `@Transactional` does not propagate.** To do DB work inside an async method, annotate that method itself with `@Transactional`. Also, if the async task starts **before** the transaction commits, it may read data that is not yet visible — which is risky.

```java
@Service
@RequiredArgsConstructor
public class AssetService {

    private final NotificationAsyncService asyncService;
    private final AssetDao assetDao;

    @Transactional
    public void createAsset(AssetCreateRequest req) {
        assetDao.insert(req);
        // ❌ Calling here means the async thread cannot see the not-yet-committed data
        // asyncService.sendNotification(req.getTagId());

        // ✅ Guarantee the call happens after the transaction commits
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
    @Transactional   // transaction on the async method itself
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

> When receiving SIGTERM on Kubernetes etc., it waits until in-progress async/scheduled tasks finish. The combination of `setWaitForTasksToCompleteOnShutdown(true)` + `setAwaitTerminationSeconds(30)` is essential.

## 3. Common Mistakes
- **Processing a long task synchronously within the HTTP response**: the user waits 30 seconds. Use `@Async` + immediate response + status polling or a webhook.
- **Calling `@Async` via a self-call within the same class**: ineffective. Split into a separate bean.
- **Using the `SimpleAsyncTaskExecutor` default as-is**: unbounded thread creation → OOM.
- **Using only `@Scheduled` across multiple instances**: every instance runs simultaneously. ShedLock is essential.
- **Running a long task with `fixedRate`**: the next run starts before the previous one finishes, so they overlap. Use `fixedDelay` or `cron` + ShedLock.
- **Propagating exceptions from a scheduled method**: the next run can be blocked. Catch and log.
- **Calling async inside a transaction**: the async thread cannot see pre-commit data. Use the `afterCommit` callback.
- **Using shared mutable state (static variables)**: race conditions in an async environment. Use immutable objects or concurrent data structures.
- **Unbounded pool size (`Integer.MAX_VALUE`)**: with an unbounded queue, tasks pile up → OOM. Use an appropriate `queueCapacity` + `CallerRunsPolicy`.

```java
// Anti-pattern
@Async   // ❌ no Executor specified → default SimpleAsyncTaskExecutor
public void process() { ... }

// Recommended
@Async("assetTaskExecutor")   // ✅ explicit pool specified
public void process() { ... }
```

## 4. Checklist
- [ ] Did you guard multi-instance `@Scheduled` with ShedLock (`@SchedulerLock`)?
- [ ] Did you explicitly assign a dedicated pool-based Executor to `@Async` (not using SimpleAsyncTaskExecutor)?
- [ ] Did you separate Executors by purpose?
- [ ] Does `@Async` go through a separate bean rather than self-invocation?
- [ ] Did you annotate the async method with `@Transactional` and call it after commit (`afterCommit`)?
- [ ] Did you use `fixedDelay`/`cron` instead of `fixedRate` for long tasks?
- [ ] Did you configure Graceful Shutdown (`waitForTasksToCompleteOnShutdown` + `awaitTermination`)?
