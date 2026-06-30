---
name: Multitenancy Design (Multitenancy)
description: Standards for tenant isolation strategies (DB/schema/row), tenant identification, cross-tenant data leak prevention, and shared resource namespacing. Read this when serving multiple customers from a single instance in SaaS or deciding the isolation level. Keywords: multitenancy, tenant-isolation, row-level-security, RLS, saas, data-isolation, tenant_id.
rules:
  - "Decide the isolation level first — DB-per-tenant (strong isolation, high cost) / schema-per-tenant / row-based (tenant_id, low cost, leak risk)."
  - "If row-based, enforce a tenant_id filter on every query — block omissions at the source with an ORM global filter or DB Row-Level Security."
  - "Derive tenant identification from the authentication token (JWT claim) or subdomain — do not trust a tenant parameter sent by the client."
  - "Cross-tenant data leaks are fatal — make 'attempt to access another tenant's data → blocked' a mandatory test case."
  - "Mix tenant_id as a namespace into shared resources (connection pools, cache keys, file paths) to prevent collisions and leaks."
tags:
  - "multitenancy"
  - "tenant-isolation"
  - "row-level-security"
  - "RLS"
  - "saas"
  - "data-isolation"
  - "tenant_id"
---

# 🏢 Multitenancy Design

> The core of SaaS where a single instance serves multiple customers (tenants). Read this when defining the three pillars: isolation, identification, and leak prevention.

## 1. Core Principles
- Decide the isolation level first — DB-per-tenant (strong isolation, high cost) / schema-per-tenant / row-based (tenant_id, low cost, leak risk).
- If row-based, enforce a tenant_id filter on every query — block omissions at the source with an ORM global filter or DB Row-Level Security.
- Derive tenant identification from the authentication token (JWT claim) or subdomain — do not trust a tenant parameter sent by the client.
- Cross-tenant data leaks are fatal — make "attempt to access another tenant's data → blocked" a mandatory test case.
- Mix tenant_id as a namespace into shared resources (connection pools, cache keys, file paths) to prevent collisions and leaks.

## 2. Rules

### 2-1. Isolation Strategy Comparison
| Strategy | Isolation Strength | Cost·Scaling | Characteristics |
|---|---|---|---|
| DB per tenant | Strongest | Operating cost soars with many tenants | Easy backup·recovery·regulatory compliance |
| Schema per tenant | Medium | Medium | Schema separation within a single DB |
| Row-based (shared table) | Weakest | Cheapest·easiest to scale | Immediate leak if tenant_id is missing — RLS·global filter required |

### 2-2. Tenant Identification — Distrust Client Input
```text
// ❌ Forbidden — trusting the tenant parameter sent by the client as-is
tenantId = request.query.tenantId

// ✅ Recommended — derive from the authentication token (JWT claim)·subdomain
tenantId = jwt.claims.tenant_id   // or subdomain → tenant mapping
```

### 2-3. Row-Based Query — Enforce tenant_id
```text
// ❌ Forbidden — an immediate leak if the tenant_id filter is missing from the query
SELECT * FROM orders WHERE id = :id

// ✅ Recommended — block omissions at the source with an ORM global filter or DB Row-Level Security
SELECT * FROM orders WHERE id = :id AND tenant_id = :tenantId
```

### 2-4. Shared Resource Namespacing
```text
// ❌ Forbidden — no tenant distinction in the cache key·file path causes collisions·leaks
cache.get("user:" + userId)

// ✅ Recommended — mix tenant_id in as a namespace
cache.get(tenantId + ":user:" + userId)
```

### 2-5. Safeguard Flow
- Determine the tenant at authentication → fix it in the request context → enforce it at the data access layer.
- Include cross-tenant access tests in the regression suite (prevent security regressions).

## 3. Common Mistakes
- Row-based but tenant_id filter missing from some queries → cross-tenant leak.
- Trusting the tenant parameter sent by the client → access to other tenants via tampering.
- Tenant namespace not applied to cache keys·file paths → data collisions·leaks.
- Absence of cross-tenant access tests → security regressions go uncaught.

## 4. Checklist
- [ ] Was the isolation level (DB/schema/row) decided first?
- [ ] If row-based, is a tenant_id filter enforced on every query (global filter·RLS)?
- [ ] Was the tenant derived from the authentication token·subdomain (distrust client input)?
- [ ] Was a tenant_id namespace applied to shared resources?
- [ ] Was an "attempt to access another tenant → blocked" test added to the regression suite?
