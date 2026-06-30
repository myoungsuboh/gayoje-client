---
name: 스케줄링 및 비동기 처리 표준 (@Scheduled + @Async + ShedLock)
description: Spring Boot 주기 작업 스케줄링과 비동기 실행 표준 — 다중 인스턴스에서 ShedLock으로 중복 실행 방지, 전용 ThreadPoolTaskExecutor 등록, @Async 자기호출 함정, 비동기-트랜잭션 분리, Graceful Shutdown. 스케줄러나 비동기 메서드를 만들거나 중복 실행·풀 격리·트랜잭션 문제를 다룰 때 읽는다. 키워드: @Scheduled, @Async, TaskExecutor, ThreadPoolTaskExecutor, ShedLock, cron, fixedRate, fixedDelay.
rules:
  - "다중 인스턴스 환경의 @Scheduled 작업은 ShedLock으로 중복 실행을 막는다."
  - "@Async 작업은 전용 ThreadPoolTaskExecutor 빈을 등록해 격리한다 — 용도별로 분리한다."
  - "@Async 자기호출은 프록시를 우회하므로 별도 빈으로 분리해 호출한다."
  - "비동기 메서드는 호출자의 트랜잭션과 분리해 새 트랜잭션으로 실행한다."
  - "스케줄 주기와 스레드풀 크기는 application.yml로 환경별 설정한다."
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

# ⏰ 스케줄링 및 비동기 처리 표준 (@Scheduled + @Async + ShedLock)

> 주기 작업과 비동기 실행을 격리·관측 가능하게 표준화하고 다중 인스턴스 중복 실행을 막는다. 스케줄러나 비동기 메서드를 만들거나 중복 실행·풀·트랜잭션 문제를 다룰 때 읽는다.

## 1. 핵심 원칙
- 다중 인스턴스 환경의 `@Scheduled` 작업은 ShedLock으로 중복 실행을 막는다.
- `@Async` 작업은 전용 `ThreadPoolTaskExecutor` 빈을 등록해 격리한다 — 용도별로 분리한다.
- `@Async` 자기호출은 프록시를 우회하므로 별도 빈으로 분리해 호출한다.
- 비동기 메서드는 호출자의 트랜잭션과 분리해 새 트랜잭션으로 실행한다.
- 스케줄 주기와 스레드풀 크기는 `application.yml`로 환경별 설정한다.

## 2. 규칙

### 2-1. 의존성
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter'

    // 분산 환경 중복 실행 방지
    implementation 'net.javacrumbs.shedlock:shedlock-spring:5.13.0'
    implementation 'net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.13.0'
    // Redis로 락 관리할 경우 대체:
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
    asset-sync-cron: "0 */10 * * * *"   # 10분마다
    report-daily-cron: "0 0 2 * * *"    # 매일 02:00
```

> Spring Boot가 위 설정으로 `taskExecutor`/`taskScheduler` 빈을 만들어 주지만, 비동기 작업의 격리/관측을 위해서는 **명시적 빈 등록**(2-4)을 권장한다.

### 2-3. 스케줄링 활성화 + ShedLock
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
                .usingDbTime()   // DB 서버 시간 기준 → 인스턴스 간 시계 차 무관
                .build()
        );
    }
}
```

ShedLock용 테이블(Postgres):
```sql
CREATE TABLE shedlock (
    name       VARCHAR(64)  PRIMARY KEY,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);
```

### 2-4. 전용 ThreadPoolTaskExecutor 빈
> 기본 `SimpleAsyncTaskExecutor`는 **풀이 없다**. 매 호출마다 스레드를 새로 만들어 OOM 위험. 반드시 풀 기반 Executor로 교체.

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

        // 풀+큐 포화 시 정책: 호출 스레드가 직접 실행 (백프레셔 효과)
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());

        // Graceful shutdown
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);

        // MDC 컨텍스트 전파 (traceId/userId 유지)
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
                .error("비동기 메서드 예외 method={} params={}", method.getName(), params, ex);
    }
}
```

> 용도별로 Executor를 나눠라. 도메인마다 별도 `@Bean`(예: `notificationTaskExecutor`, `reportTaskExecutor`)을 만들고 `@Async("도메인Executor")`로 지정하면 한쪽 작업 폭주가 다른 쪽을 막지 않는다.

### 2-5. @Scheduled 사용 패턴
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
     * 10분마다 SAP PM 자산 동기화.
     * - cron: 시작 시각 고정 (정시 기준)
     * - fixedDelay: 직전 실행 종료 후 N ms (작업이 겹치지 않음)
     * - fixedRate:  직전 실행 시작 후 N ms (긴 작업 시 겹칠 수 있어 위험)
     */
    @Scheduled(cron = "${harness.scheduler.asset-sync-cron}", zone = "Asia/Seoul")
    @SchedulerLock(name = "AssetSyncScheduler.sync",
                   lockAtLeastFor = "PT30S",   // 너무 빠른 재실행 방지
                   lockAtMostFor  = "PT9M")    // 실패 시 락 자동 해제
    public void sync() {
        log.info("자산 동기화 스케줄 시작");
        try {
            assetSyncService.syncFromSap();
        } catch (Exception e) {
            log.error("자산 동기화 실패", e);   // 예외를 던지면 스케줄러가 다음 실행을 건너뛰지 않도록 catch
        }
    }

    @Scheduled(fixedDelayString = "PT30S", initialDelayString = "PT10S")
    @SchedulerLock(name = "AssetSyncScheduler.healthcheck")
    public void healthcheck() {
        assetSyncService.pingDownstream();
    }
}
```

### 2-6. @Async 사용 패턴 + 자기호출 함정
> **같은 클래스 내부 메서드를 호출하면 `@Async`가 동작하지 않는다.** Spring AOP는 프록시 기반이라 `this.foo()`는 프록시를 거치지 않기 때문. 별도 빈으로 분리하거나 자기 자신을 빈으로 주입해야 한다.

```java
// ❌ 안티패턴: 같은 클래스의 self-call → 동기 실행됨
@Service
public class ReportService {
    public void run() {
        sendNotification();  // ❌ @Async 무효
    }

    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}

// ✅ 권장 1: 비동기 메서드를 별도 빈으로 분리
@Service
@RequiredArgsConstructor
public class ReportService {
    private final NotificationAsyncService asyncService;

    public void run() {
        asyncService.sendNotification();  // 다른 빈 → 프록시 경유 → 비동기 동작
    }
}

@Service
public class NotificationAsyncService {
    @Async("assetTaskExecutor")
    public void sendNotification() { ... }
}
```

반환 타입:
```java
@Service
public class AssetAsyncService {

    // void: fire-and-forget
    @Async("assetTaskExecutor")
    public void notify(String tagId) { ... }

    // CompletableFuture: 결과 await/조합 가능
    @Async("assetTaskExecutor")
    public CompletableFuture<AssetResponse> fetchAsync(String tagId) {
        return CompletableFuture.completedFuture(assetDao.findByTagId(tagId));
    }
}

// 사용
CompletableFuture<AssetResponse> f1 = asyncService.fetchAsync("TAG-001");
CompletableFuture<AssetResponse> f2 = asyncService.fetchAsync("TAG-002");
CompletableFuture.allOf(f1, f2).join();
```

### 2-7. 비동기와 트랜잭션 분리
> `@Async`는 새 스레드에서 실행되므로 **호출 측의 `@Transactional`이 전파되지 않는다.** 비동기 메서드 안에서 DB 작업을 하려면 그 메서드 자체에 `@Transactional`을 붙여라. 또한 트랜잭션 커밋 **전에** 비동기 작업이 시작되면 아직 안 보이는 데이터를 읽을 수 있어 위험.

```java
@Service
@RequiredArgsConstructor
public class AssetService {

    private final NotificationAsyncService asyncService;
    private final AssetDao assetDao;

    @Transactional
    public void createAsset(AssetCreateRequest req) {
        assetDao.insert(req);
        // ❌ 여기서 호출하면 비동기 스레드가 아직 커밋 안 된 데이터를 못 봄
        // asyncService.sendNotification(req.getTagId());

        // ✅ 트랜잭션 커밋 후 호출 보장
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
    @Transactional   // 비동기 메서드 자체에 트랜잭션
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

> Kubernetes 등에서 SIGTERM 받으면 진행 중인 비동기/스케줄 작업이 끝날 때까지 기다린다. `setWaitForTasksToCompleteOnShutdown(true)` + `setAwaitTerminationSeconds(30)` 조합 필수.

## 3. 흔한 실수
- **HTTP 응답 안에서 긴 작업 동기 처리**: 사용자가 30초 대기. `@Async` + 즉시 응답 + 상태 폴링 또는 웹훅.
- **같은 클래스 self-call로 `@Async` 호출**: 무효. 별도 빈으로 분리.
- **`SimpleAsyncTaskExecutor` 기본값 그대로 사용**: 스레드 무한 생성 → OOM.
- **다중 인스턴스에서 `@Scheduled`만 사용**: 모든 인스턴스가 동시 실행됨. ShedLock 필수.
- **`fixedRate`로 긴 작업 실행**: 이전 작업이 안 끝났는데 다음 작업이 시작되어 겹친다. `fixedDelay` 또는 `cron` + ShedLock 사용.
- **스케줄 메서드에서 예외 propagate**: 다음 실행이 막힐 수 있음. catch 후 로깅.
- **트랜잭션 안에서 비동기 호출**: 비동기 스레드는 커밋 전 데이터를 못 봄. `afterCommit` 콜백 사용.
- **공유 가변 상태(static 변수) 사용**: 비동기 환경에서 race condition. 불변 객체 또는 동시성 자료구조.
- **풀 사이즈 무한대(`Integer.MAX_VALUE`)**: 큐가 무한이면 작업이 쌓여 OOM. 적정 `queueCapacity` + `CallerRunsPolicy`.

```java
// 안티패턴
@Async   // ❌ Executor 미지정 → 기본 SimpleAsyncTaskExecutor
public void process() { ... }

// 권장
@Async("assetTaskExecutor")   // ✅ 명시적 풀 지정
public void process() { ... }
```

## 4. 체크리스트
- [ ] 다중 인스턴스 `@Scheduled`에 ShedLock(`@SchedulerLock`)을 걸었는가
- [ ] `@Async`에 전용 풀 기반 Executor를 명시 지정했는가 (SimpleAsyncTaskExecutor 미사용)
- [ ] Executor를 용도별로 분리했는가
- [ ] `@Async` 자기호출이 아니라 별도 빈을 경유하는가
- [ ] 비동기 메서드에 `@Transactional`을 붙이고, 커밋 후(`afterCommit`) 호출하는가
- [ ] 긴 작업에 `fixedRate` 대신 `fixedDelay`/`cron`을 썼는가
- [ ] Graceful Shutdown(`waitForTasksToCompleteOnShutdown` + `awaitTermination`)을 설정했는가
