---
name: 분산 추적 (OpenTelemetry)
description: 마이크로서비스에서 한 요청을 trace/span 으로 따라가는 분산 추적 표준. OTel 계측·컨텍스트 전파·샘플링·로그/메트릭 상관·Jaeger/Tempo 연동을 정할 때, 요청이 어느 서비스에서 느렸나/실패했나 진단할 때 읽는다. 키워드: opentelemetry, otel, distributed-tracing, jaeger, tempo, observability, traceparent, sampling.
rules:
  - "OpenTelemetry(OTel) 표준 SDK 로 계측한다 — 벤더 종속 에이전트보다 이식성·표준성을 우선한다."
  - "trace-id 를 서비스 경계(HTTP 헤더·메시지 큐 속성)로 전파한다 — 한 곳이라도 끊기면 추적이 단절된다."
  - "span 에 의미있는 속성(http.method·db.statement·error·tenant)을 단다 — 이름만으론 원인 진단이 안 된다."
  - "프로덕션은 확률·tail-based 샘플링으로 비용을 조절한다 — 100% 추적 저장은 비싸고 느리다."
  - "로그·메트릭·추적을 trace-id 로 상관(correlation)시켜 한 요청을 입구부터 끝까지 따라간다."
tags:
  - "opentelemetry"
  - "otel"
  - "distributed-tracing"
  - "jaeger"
  - "tempo"
  - "observability"
  - "traceparent"
  - "sampling"
---

# 🔍 분산 추적 (OpenTelemetry)

> 마이크로서비스에서 "한 요청이 어느 서비스에서 느렸나/실패했나"를 따라가는 관측성의 한 축(추적). 서비스 경계를 넘는 요청을 계측하거나 샘플링·상관 정책을 정할 때 읽는다.

## 1. 핵심 원칙
- OpenTelemetry(OTel) 표준 SDK 로 계측한다 — 벤더 종속 에이전트보다 이식성·표준성을 우선한다.
- trace-id 를 서비스 경계(HTTP 헤더·메시지 큐 속성)로 전파한다 — 한 곳이라도 끊기면 추적이 단절된다.
- span 에 의미있는 속성(http.method·db.statement·error·tenant)을 단다 — 이름만으론 원인 진단이 안 된다.
- 프로덕션은 확률·tail-based 샘플링으로 비용을 조절한다 — 100% 추적 저장은 비싸고 느리다.
- 로그·메트릭·추적을 trace-id 로 상관(correlation)시켜 한 요청을 입구부터 끝까지 따라간다.

## 2. 규칙

### 2-1. trace / span 구조
- **trace**: 요청 하나가 trace, 각 작업 구간이 span. 부모-자식으로 호출 트리를 이룬다.
- 자동 계측(프레임워크)으로 넓게 깔고, 핵심 비즈니스 구간만 수동 계측으로 보강한다.

### 2-2. 컨텍스트 전파
- W3C `traceparent` 헤더로 서비스 간 컨텍스트를 넘긴다.
- 큐·배치 등 비동기 경로에도 trace-id 를 전파해 추적이 끊기지 않게 한다.

### 2-3. span 속성
```text
// ❌ 금지 — 이름만 있는 span (원인 진단 불가)
span: "queryUser"

// ✅ 권장 — 의미있는 속성을 부착
span: "queryUser"
  http.method = GET
  db.statement = SELECT ...
  tenant = acme
  error = true
```

### 2-4. 샘플링
- **head**(요청 시작 시) vs **tail**(완료 후 에러/지연 기준).
- 에러·느린 요청은 항상 남기는 정책이 비용 대비 진단 가치가 높다.

### 2-5. 신호 상관 (log·metric·trace)
- 세 신호를 trace-id 로 묶으면 알림 → 추적 → 로그로 즉시 파고든다.

## 3. 흔한 실수
- ❌ 비동기·큐 경로에서 trace 컨텍스트 전파 누락 → 추적이 끊긴다. `traceparent`를 메시지 속성에도 싣는다.
- ❌ span에 이름만 있고 속성 없음 → 원인 진단 불가. `http.method`·`db.statement`·`error` 등 부착.
- ❌ 프로덕션 100% 샘플링 → 비용·성능 부담. 확률/tail 샘플링(에러·지연은 보존).
- ❌ span/속성에 PII·시크릿 기록 → 개인정보 유출. 마스킹한다.
- ❌ 로그·메트릭을 trace-id로 상관 안 함 → 신호가 따로 놀아 진단이 느리다.
- ❌ 벤더 종속 에이전트에 강결합 → 이식성 저하. OTel 표준 SDK로.

## 4. 체크리스트
- [ ] OTel 표준 SDK 로 계측했는가
- [ ] trace-id 가 모든 서비스 경계(HTTP·큐)에서 전파되는가
- [ ] span 에 진단에 쓰는 속성(method·statement·error 등)을 달았는가
- [ ] 프로덕션 샘플링 정책(에러·지연은 보존)을 정했는가
- [ ] 로그·메트릭이 trace-id 로 상관되는가
