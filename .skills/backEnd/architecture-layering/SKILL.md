---
name: 애플리케이션 아키텍처 — 레이어링 & 관심사 분리 (MVC/Clean)
description: 컨트롤러·서비스·리포지토리 레이어를 분리하고 비즈니스 로직의 위치와 의존성 방향을 규정하는 스택 중립 아키텍처 가이드. 새 기능의 코드 배치를 정하거나, 컨트롤러·UI에 로직이 섞이지 않게 검토할 때 읽는다. 키워드: MVC, MVVM, layered-architecture, clean-architecture, hexagonal, controller, service, repository, separation-of-concerns, dependency-inversion, DTO.
rules:
  - "레이어를 분리한다 — Controller(요청/응답)·Service(비즈니스 로직)·Repository(데이터 접근). 한 파일이 두 책임을 겸하지 않는다."
  - "비즈니스 로직은 Service 레이어에만 둔다 — 컨트롤러는 입력 검증·호출·응답 변환만, UI/뷰는 표현만 담당한다."
  - "의존성은 안쪽(도메인)으로만 향한다 — Controller→Service→Repository. 역방향 참조(Repository가 Service 호출)를 금지한다."
  - "레이어 간 경계는 DTO로 주고받고, DB 엔티티를 컨트롤러/뷰까지 그대로 노출하지 않는다."
  - "외부 의존성(DB·외부 API·파일)은 인터페이스 뒤로 추상화해 도메인 로직이 구현에 묶이지 않게 한다 (의존성 역전)."
  - "프론트엔드는 MVVM/컴포넌트 구조로 — 뷰(템플릿)·상태(store/composable)·API 호출(service)을 분리하고 컴포넌트에 비즈니스 로직을 두지 않는다."
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

# 🏛️ 애플리케이션 아키텍처 — 레이어링 & 관심사 분리

> Controller·Service·Repository 경계를 규칙으로 못 박아 비즈니스 로직이 한곳(Service)에 모이게 한다. 새 기능의 코드 위치를 정하거나 구조를 검토할 때 읽는다.

AI 에이전트가 가장 흔히 저지르는 구조 실수는 **컨트롤러나 UI 컴포넌트에 비즈니스 로직을 욱여넣는 것**이다. 처음엔 빨라 보여도 테스트·재사용·변경이 급격히 어려워진다. 레이어 경계를 규칙으로 못 박으면 AI도 그 틀 안에서 코드를 생성한다.

## 1. 핵심 원칙

- 레이어를 분리한다 — Controller(요청/응답)·Service(비즈니스 로직)·Repository(데이터 접근). 한 파일이 두 책임을 겸하지 않는다.
- 비즈니스 로직은 Service 레이어에만 둔다 — 컨트롤러는 입력 검증·호출·응답 변환만, UI/뷰는 표현만 담당한다.
- 의존성은 안쪽(도메인)으로만 향한다 — Controller→Service→Repository. 역방향 참조(Repository가 Service 호출)를 금지한다.
- 레이어 간 경계는 DTO로 주고받고, DB 엔티티를 컨트롤러/뷰까지 그대로 노출하지 않는다.
- 외부 의존성(DB·외부 API·파일)은 인터페이스 뒤로 추상화해 도메인 로직이 구현에 묶이지 않게 한다 (의존성 역전).
- 프론트엔드는 MVVM/컴포넌트 구조로 — 뷰(템플릿)·상태(store/composable)·API 호출(service)을 분리하고 컴포넌트에 비즈니스 로직을 두지 않는다.

## 2. 규칙

### 2-1. 표준 레이어 (백엔드)

```
요청 → Controller → Service → Repository → DB
        (검증/변환)  (로직)    (데이터접근)
```

| 레이어 | 책임 | 두면 안 되는 것 |
|---|---|---|
| Controller | 요청 파싱·입력 검증·응답 변환 | 비즈니스 규칙, SQL |
| Service | 비즈니스 로직·트랜잭션·정책 | HTTP/요청 객체, 직접 SQL |
| Repository | 데이터 접근(쿼리) | 비즈니스 판단 |

- **의존성 방향**: Controller→Service→Repository (한 방향). 역참조 금지.
- **DTO 경계**: 레이어 간엔 DTO로. DB 엔티티를 컨트롤러/뷰까지 그대로 흘리지 않는다(과노출·결합).
- **의존성 역전**: 외부 의존(DB·외부 API)은 인터페이스 뒤로 → 도메인 로직이 구현에 안 묶임 (Clean/Hexagonal).

### 2-2. 프론트엔드 (MVVM / 컴포넌트)

```
View(템플릿) ── 상태(store/composable) ── API(service 모듈)
```

- 컴포넌트는 **표현**만. 데이터 가공·정책은 composable/store/service로.
- API 호출을 컴포넌트에 흩지 않고 service 레이어로 모은다.
- 전역 상태는 store, 화면 로컬 상태는 컴포넌트 — 경계를 섞지 않는다.

## 3. 흔한 실수

AI가 자주 만드는 것 — 검토 시 거른다.

- ❌ 컨트롤러 메서드 안에 if/계산/SQL이 뒤섞인 "fat controller"
- ❌ Vue 컴포넌트 `<script setup>`에 비즈니스 규칙·복잡한 데이터 가공
- ❌ DB 엔티티를 API 응답으로 그대로 반환 (필드 과노출)
- ❌ Service가 HttpServletRequest 등 웹 계층 객체에 의존
- ❌ Repository가 Service를 호출하는 역방향 참조

> **적용 팁**: AGENTS.md / 규칙 파일에 "비즈니스 로직은 Service 에만, 컨트롤러는 얇게" 한 줄을 박아두면 에이전트가 매 생성마다 이 경계를 지킨다. ('에이전트 규칙 파일' 스킬과 함께 쓰면 효과적)

## 4. 체크리스트

- [ ] 비즈니스 로직이 Service 레이어에만 있는가 (컨트롤러·UI에 섞이지 않았는가)
- [ ] 의존성 방향이 Controller→Service→Repository 한 방향인가 (역참조 없음)
- [ ] 레이어 간에 DTO로 주고받고, DB 엔티티를 외부로 그대로 노출하지 않는가
- [ ] 외부 의존(DB·외부 API)을 인터페이스 뒤로 추상화했는가
- [ ] 프론트엔드 컴포넌트가 표현만 담당하고, API 호출을 service로 모았는가
