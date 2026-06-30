---
name: 调度与异步处理标准 (@Scheduled + @Async + ShedLock)
description: Spring Boot 周期任务调度与异步执行的标准 — 在多实例下用 ShedLock 防止重复执行、注册专用 ThreadPoolTaskExecutor、@Async 自调用陷阱、异步与事务分离、Graceful Shutdown。在创建调度器或异步方法，或处理重复执行、池隔离、事务问题时阅读。关键词: @Scheduled, @Async, TaskExecutor, ThreadPoolTaskExecutor, ShedLock, cron, fixedRate, fixedDelay.
rules:
  - "多实例环境的 @Scheduled 任务用 ShedLock 防止重复执行。"
  - "@Async 任务通过注册专用 ThreadPoolTaskExecutor bean 进行隔离 — 按用途分离。"
  - "@Async 自调用会绕过代理，因此分离为独立 bean 再调用。"
  - "异步方法与调用方的事务分离，在新事务中执行。"
  - "调度周期与线程池大小通过 application.yml 按环境配置。"
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

# ⏰ 调度与异步处理标准 (@Scheduled + @Async + ShedLock)

> 将周期任务与异步执行标准化为隔离、可观测，并防止多实例重复执行。在创建调度器或异步方法，或处理重复执行、池、事务问题时阅读。

## 1. 核心原则
- 多实例环境的 `@Scheduled` 任务用 ShedLock 防止重复执行。
- `@Async` 任务通过注册专用 `ThreadPoolTaskExecutor` bean 进行隔离 — 按用途分离。
- `@Async` 自调用会绕过代理，因此分离为独立 bean 再调用。
- 异步方法与调用方的事务分离，在新事务中执行。
- 调度周期与线程池大小通过 `application.yml` 按环境配置。

## 2. 规则

### 2-1. 依赖
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'

    // 防止分布式环境中的重复执行
    implementation 'net.javacrumbs.shedlock:shedlock-spring:5.13.0'
    implementation 'net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.13.0'
    // 用 Redis 管理锁时的替代方案:
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
    asset-sync-cron: "0 */10 * * * *"   # 每10分钟
    report-daily-cron: "0 0 2 * * *"    # 每天 02:00
```

> Spring Boot 会根据上述配置创建 `taskExecutor`/`taskScheduler` bean，但为了异步任务的隔离/可观测性，推荐进行**显式 bean 注册**(2-4)。

### 2-3. 启用调度 + ShedLock
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
                .usingDbTime()   // 以 DB 服务器时间为准 → 不受实例间时钟差影响
                .build()
        );
    }
}
```

ShedLock 用表(Postgres):
```sql
CREATE TABLE shedlock (
    name       VARCHAR(64)  PRIMARY KEY,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);
```

### 2-4. 专用 ThreadPoolTaskExecutor bean
> 默认的 `SimpleAsyncTaskExecutor` **没有池**。每次调用都新建线程，有 OOM 风险。务必替换为基于池的 Executor。

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

        // 池+队列饱和时的策略: 调用线程直接执行（背压效果）
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());

        // Graceful shutdown
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);

        // MDC 上下文传播（保持 traceId/userId）
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
                .error("异步方法异常 method={} params={}", method.getName(), params, ex);
    }
}
```

> 按用途拆分 Executor。为每个域创建独立的 `@Bean`（如 `notificationTaskExecutor`、`reportTaskExecutor`），并用 `@Async("域Executor")` 指定，这样一端任务暴增不会阻塞另一端。

### 2-5. @Scheduled 使用模式
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
     * 每10分钟同步 SAP PM 资产。
     * - cron: 起始时刻固定（以整点为基准）
     * - fixedDelay: 上次执行结束后 N ms（任务不重叠）
     * - fixedRate:  上次执行开始后 N ms（长任务时可能重叠，有风险）
     */
    @Scheduled(cron = "${harness.scheduler.asset-sync-cron}", zone = "Asia/Seoul")
    @SchedulerLock(name = "AssetSyncScheduler.sync",
                   lockAtLeastFor = "PT30S",   // 防止过快重复执行
                   lockAtMostFor  = "PT9M")    // 失败时自动释放锁
    public void sync() {
        log.info("资产同步调度开始");
        try {
            assetSyncService.syncFromSap();
        } catch (Exception e) {
            log.error("资产同步失败", e);   // catch 以免抛出异常导致调度器跳过下次执行
        }
    }

    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT10S")
    @SchedulerLock(name = "AssetSyncScheduler.healthcheck")
    public void healthcheck() {
        assetSyncService.pingDownstream();
    }
}
```

### 2-6. @Async 使用模式 + 自调用陷阱
> **调用同一类内部的方法时 `@Async` 不会生效。** 因为 Spring AOP 基于代理，`this.foo()` 不会经过代理。必须分离为独立 bean，或将自身作为 bean 注入。

```java
// ❌ 反模式: 同一类的 self-call → 同步执行
@Service
public class ReportService {
    public void run() {
        sendNotification();  // ❌ @Async 无效
    }

    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}

// ✅ 推荐 1: 将异步方法分离为独立 bean
@Service
@RequiredArgsConstructor
public class ReportService {
    private final NotificationAsyncService asyncService;

    public void run() {
        asyncService.sendNotification();  // 另一个 bean → 经过代理 → 异步运行
    }
}

@Service
public class NotificationAsyncService {
    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}
```

返回类型:
```java
@Service
public class AssetAsyncService {

    // void: fire-and-forget
    @Async("assetTaskExecutor")
    public void notify(String tagId) { ... }

    // CompletableFuture: 可对结果 await/组合
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

### 2-7. 异步与事务分离
> 由于 `@Async` 在新线程中执行，**调用方的 `@Transactional` 不会传播。** 要在异步方法内进行 DB 操作，需在该方法本身上加 `@Transactional`。此外，如果异步任务在事务提交**之前**启动，可能读取到尚不可见的数据，存在风险。

```java
@Service
@RequiredArgsConstructor
public class AssetService {

    private final NotificationAsyncService asyncService;
    private final AssetDao assetDao;

    @Transactional
    public void createAsset(AssetCreateRequest req) {
        assetDao.insert(req);
        // ❌ 在此处调用，异步线程看不到尚未提交的数据
        // asyncService.sendNotification(req.getTagId());

        // ✅ 保证在事务提交后调用
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
    @Transactional   // 在异步方法本身加事务
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

> 在 Kubernetes 等环境收到 SIGTERM 时，会等待进行中的异步/调度任务结束。`setWaitForTasksToCompleteOnShutdown(true)` + `setAwaitTerminationSeconds(30)` 的组合必不可少。

## 3. 常见错误
- **在 HTTP 响应中同步处理长任务**: 用户要等 30 秒。改用 `@Async` + 立即响应 + 状态轮询或 webhook。
- **以同一类的 self-call 调用 `@Async`**: 无效。分离为独立 bean。
- **直接沿用 `SimpleAsyncTaskExecutor` 默认值**: 线程无限创建 → OOM。
- **多实例下仅使用 `@Scheduled`**: 所有实例同时执行。ShedLock 必不可少。
- **用 `fixedRate` 执行长任务**: 上一个任务未结束下一个就开始，导致重叠。使用 `fixedDelay` 或 `cron` + ShedLock。
- **在调度方法中向上 propagate 异常**: 可能阻塞下次执行。catch 后记录日志。
- **在事务内调用异步**: 异步线程看不到提交前的数据。使用 `afterCommit` 回调。
- **使用共享可变状态（static 变量）**: 异步环境下的 race condition。使用不可变对象或并发数据结构。
- **池大小无限（`Integer.MAX_VALUE`）**: 队列无限会导致任务堆积 → OOM。使用适当的 `queueCapacity` + `CallerRunsPolicy`。

```java
// 反模式
@Async   // ❌ 未指定 Executor → 默认 SimpleAsyncTaskExecutor
public void process() { ... }

// 推荐
@Async("assetTaskExecutor")   // ✅ 显式指定池
public void process() { ... }
```

## 4. 检查清单
- [ ] 多实例的 `@Scheduled` 是否加了 ShedLock(`@SchedulerLock`)
- [ ] `@Async` 是否显式指定了专用的基于池的 Executor（未使用 SimpleAsyncTaskExecutor）
- [ ] 是否按用途分离了 Executor
- [ ] `@Async` 是否经过独立 bean 而非自调用
- [ ] 是否在异步方法上加了 `@Transactional`，并在提交后(`afterCommit`)调用
- [ ] 对长任务是否用了 `fixedDelay`/`cron` 而非 `fixedRate`
- [ ] 是否配置了 Graceful Shutdown(`waitForTasksToCompleteOnShutdown` + `awaitTermination`)
