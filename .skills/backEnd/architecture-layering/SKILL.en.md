---
name: Application Architecture — Layering & Separation of Concerns (MVC/Clean)
description: A stack-neutral architecture guide that separates the controller, service, and repository layers and defines where business logic lives and the direction of dependencies. Read it when deciding where to place code for a new feature, or when reviewing to keep logic from leaking into controllers/UI. Keywords: MVC, MVVM, layered-architecture, clean-architecture, hexagonal, controller, service, repository, separation-of-concerns, dependency-inversion, DTO.
rules:
  - "Separate the layers — Controller (request/response), Service (business logic), Repository (data access). One file does not take on two responsibilities."
  - "Keep business logic only in the Service layer — controllers do only input validation, invocation, and response transformation; the UI/view handles presentation only."
  - "Dependencies point only inward (toward the domain) — Controller→Service→Repository. Reverse references (a Repository calling a Service) are forbidden."
  - "Pass data across layer boundaries via DTOs, and do not expose DB entities directly up to the controller/view."
  - "Abstract external dependencies (DB, external APIs, files) behind interfaces so domain logic is not bound to implementations (dependency inversion)."
  - "On the frontend, use an MVVM/component structure — separate the view (template), state (store/composable), and API calls (service), and do not put business logic in components."
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

# 🏛️ Application Architecture — Layering & Separation of Concerns

> Pin down the Controller·Service·Repository boundaries as rules so business logic gathers in one place (Service). Read it when deciding where a new feature's code lives or when reviewing structure.

The most common structural mistake AI agents make is **cramming business logic into controllers or UI components**. It looks fast at first, but testing, reuse, and change quickly become hard. Once you pin down layer boundaries as rules, the AI also generates code within that frame.

## 1. Core Principles

- Separate the layers — Controller (request/response), Service (business logic), Repository (data access). One file does not take on two responsibilities.
- Keep business logic only in the Service layer — controllers do only input validation, invocation, and response transformation; the UI/view handles presentation only.
- Dependencies point only inward (toward the domain) — Controller→Service→Repository. Reverse references (a Repository calling a Service) are forbidden.
- Pass data across layer boundaries via DTOs, and do not expose DB entities directly up to the controller/view.
- Abstract external dependencies (DB, external APIs, files) behind interfaces so domain logic is not bound to implementations (dependency inversion).
- On the frontend, use an MVVM/component structure — separate the view (template), state (store/composable), and API calls (service), and do not put business logic in components.

## 2. Rules

### 2-1. Standard Layers (Backend)

```
요청 → Controller → Service → Repository → DB
        (검증/변환)  (로직)    (데이터접근)
```

| Layer | Responsibility | Must not contain |
|---|---|---|
| Controller | Request parsing, input validation, response transformation | Business rules, SQL |
| Service | Business logic, transactions, policy | HTTP/request objects, direct SQL |
| Repository | Data access (queries) | Business decisions |

- **Dependency direction**: Controller→Service→Repository (one direction). No reverse references.
- **DTO boundaries**: Use DTOs between layers. Do not let DB entities flow straight up to the controller/view (over-exposure, coupling).
- **Dependency inversion**: Put external dependencies (DB, external APIs) behind interfaces → domain logic is not bound to implementations (Clean/Hexagonal).

### 2-2. Frontend (MVVM / Components)

```
View(템플릿) ── 상태(store/composable) ── API(service 모듈)
```

- Components handle **presentation** only. Data processing and policy go into composables/stores/services.
- Do not scatter API calls across components; gather them in the service layer.
- Global state goes in the store, screen-local state in the component — do not mix the boundaries.

## 3. Common Mistakes

What AI often produces — filter these out during review.

- ❌ A "fat controller" with if/calculations/SQL all tangled inside a controller method
- ❌ Business rules or complex data processing inside a Vue component `<script setup>`
- ❌ Returning a DB entity directly as the API response (field over-exposure)
- ❌ A Service depending on web-layer objects such as HttpServletRequest
- ❌ A reverse reference where the Repository calls the Service

> **Application tip**: Pinning a single line — "business logic only in Service, keep controllers thin" — into AGENTS.md / your rules file makes the agent honor this boundary on every generation. (Effective when used together with the 'agent rules file' skill.)

## 4. Checklist

- [ ] Is business logic only in the Service layer (not mixed into controllers/UI)?
- [ ] Is the dependency direction one-way, Controller→Service→Repository (no reverse references)?
- [ ] Do you pass DTOs between layers and avoid exposing DB entities directly to the outside?
- [ ] Have you abstracted external dependencies (DB, external APIs) behind interfaces?
- [ ] Do frontend components handle presentation only, with API calls gathered into the service?
