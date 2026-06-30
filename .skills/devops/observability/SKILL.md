---
name: 관측성 — 운영 대시보드·SLO·메트릭 인프라
description: 프로덕션 시스템을 관찰·진단하기 위한 운영 측면 표준 — SLO 메트릭 수집과 임계치 알람, 메트릭/트레이스 수집 인프라, 외부 의존성 계측. 대시보드·알람·SLO·요청 추적 인프라를 구성할 때 읽는다. 키워드: metrics, SLO, alert, prometheus, opentelemetry, sentry, dashboard, tracing.
rules:
  - "SLO(서비스 수준 목표) 기준 메트릭 — 응답 시간 p99·에러율·가용성 — 을 수집하고, 임계치 초과 시 알람을 발송한다."
  - "외부 의존성(DB·캐시·외부 API) 호출 시간과 에러율을 별도로 계측해 병목 지점을 식별한다."
  - "메트릭·트레이스 수집 인프라(Prometheus/OTel Collector 등)를 표준화하고, 수집 대상·보존 기간·샘플링을 운영 기준으로 정한다."
  - "애플리케이션 로그 자체의 작성 규칙(구조화·correlationId·마스킹·레벨)은 logging-observability를 따른다 — 운영은 그렇게 남은 로그를 수집·검색·알람하는 파이프라인에 집중한다."
tags:
  - "metrics"
  - "SLO"
  - "alert"
  - "prometheus"
  - "opentelemetry"
  - "sentry"
  - "dashboard"
  - "tracing"
  - "logger"
  - "logging"
  - "trace"
  - "correlation_id"
  - "structured_log"
---

# 🔭 관측성 — 운영 대시보드·SLO·메트릭 인프라

> 로그·메트릭·트레이스로 프로덕션 시스템을 관찰하고 장애를 빠르게 진단한다. 이 문서는 **운영 측면**(SLO 알람·메트릭 수집 인프라·외부 의존성 계측·수집 도구 선택)을 다룬다.
>
> **권위 경계**: 구조화 로깅(JSON)·correlationId/traceId 전파·민감정보 마스킹·로그 레벨 정책 등 **애플리케이션 로깅 공통 개념은 `logging-observability`가 권위**다. 여기서는 반복하지 않고 참조한다. W3C 추적 전파의 표준 규칙도 `logging-observability`, 서비스 간 추적 연동 상세는 `distributed-tracing` 참고.

## 1. 핵심 원칙
- SLO(서비스 수준 목표) 기준 메트릭 — 응답 시간 p99·에러율·가용성 — 을 수집하고, 임계치 초과 시 알람을 발송한다.
- 외부 의존성(DB·캐시·외부 API) 호출 시간과 에러율을 별도로 계측해 병목 지점을 식별한다.
- 메트릭·트레이스 수집 인프라(Prometheus/OTel Collector 등)를 표준화하고, 수집 대상·보존 기간·샘플링을 운영 기준으로 정한다.
- 애플리케이션 로그 자체의 작성 규칙(구조화·correlationId·마스킹·레벨)은 `logging-observability`를 따른다 — 운영은 그렇게 남은 로그를 **수집·검색·알람**하는 파이프라인에 집중한다.

## 2. 규칙

### 2-1. 관측성 3 기둥 (수집 도구 선택)
| 기둥 | 용도 | 도구 예시 |
|------|------|-----------|
| Logs | 이벤트 기록, 디버깅 | ELK, Loki, CloudWatch |
| Metrics | 집계 수치, 트렌드, 알람 | Prometheus, Datadog, CloudWatch |
| Traces | 분산 요청 흐름 추적 | Jaeger, Zipkin, OpenTelemetry |

> 로그의 **형식·내용**(구조화 JSON, correlation_id, 마스킹)은 `logging-observability` 권위. 운영은 위 도구로 **수집·보존·알람**하는 책임을 진다.

### 2-2. 메트릭 수집 + SLO 알람 (Prometheus)
SLO 없는 메트릭 수집은 장애를 사후에야 인지하게 한다. 수집과 동시에 임계치 알람을 건다.
```python
from prometheus_client import Counter, Histogram, generate_latest

REQUEST_COUNT = Counter("http_requests_total", "Total HTTP requests", ["method", "path", "status"])
REQUEST_DURATION = Histogram("http_request_duration_seconds", "Request duration", ["path"])

# SLO 알람 규칙 (Prometheus AlertManager)
# - p99 응답 시간 > 500ms
# - 5xx 에러율 > 1%
# - 가용성 < 99.9%
```

### 2-3. 외부 의존성 계측 (OpenTelemetry)
외부 의존성 호출 시간·에러율을 별도 계측해 병목을 식별한다. 추적 전파 표준(W3C traceparent)은 `logging-observability` 참조.
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider

tracer = trace.get_tracer("my-service")

with tracer.start_as_current_span("process_order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.amount", amount)
    # 외부 DB 호출 — 자동 계측되어 호출 시간·에러가 트레이스에 기록된다
    result = await db.execute(query)
```

## 3. 흔한 실수
- SLO·임계치 없는 메트릭 수집 → 장애를 사후에야 인지. 수집과 동시에 알람 규칙을 정의.
- 외부 의존성을 계측하지 않음 → 병목이 애플리케이션인지 DB/외부 API인지 구분 불가.
- 메트릭/트레이스 보존·샘플링 기준 부재 → 비용 폭증 또는 가시성 부족.
- 애플리케이션 로깅 규칙(구조화·correlation_id·마스킹·레벨)을 여기서 임의로 재정의 → `logging-observability`를 단일 출처로 따른다.

## 4. 체크리스트
- [ ] SLO 메트릭(p99·에러율·가용성)을 수집하고 임계치 알람을 설정했는가
- [ ] 외부 의존성(DB·캐시·외부 API) 호출 시간·에러율을 별도 계측하는가
- [ ] 메트릭/트레이스 수집 인프라의 수집 대상·보존 기간·샘플링이 운영 기준으로 정의됐는가
- [ ] 애플리케이션 로그 작성 규칙은 `logging-observability`를 따르고, 운영은 그 로그의 수집·검색·알람을 보장하는가
