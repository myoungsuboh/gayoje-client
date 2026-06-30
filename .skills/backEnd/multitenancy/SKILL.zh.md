---
name: 多租户设计 (Multitenancy)
description: 租户隔离策略（DB/Schema/行）、租户识别、跨租户数据泄露防护、共用资源命名空间化的标准。在 SaaS 中以一个实例为多个客户提供服务或确定隔离级别时阅读。关键词: multitenancy, tenant-isolation, row-level-security, RLS, saas, data-isolation, tenant_id。
rules:
  - "先确定隔离级别 — DB-per-tenant（强隔离·高成本）/ Schema-per-tenant / 基于行（tenant_id，低成本·泄露风险）。"
  - "若采用基于行，则对每条查询强制 tenant_id 过滤 — 用 ORM 全局过滤器或 DB Row-Level Security 从根源杜绝遗漏。"
  - "租户识别从认证令牌（JWT claim）·子域名中导出 — 不信任客户端发送的 tenant 参数。"
  - "跨租户数据泄露是致命的 — 将「尝试访问其他租户数据 → 拦截」列为必备测试用例。"
  - "在共用资源（连接池·缓存键·文件路径）中混入 tenant_id 作为命名空间，防止冲突·泄露。"
tags:
  - "multitenancy"
  - "tenant-isolation"
  - "row-level-security"
  - "RLS"
  - "saas"
  - "data-isolation"
  - "tenant_id"
---

# 🏢 多租户设计

> 一个实例为多个客户（租户）提供服务的 SaaS 的核心。在确定隔离、识别、防泄露三大支柱时阅读。

## 1. 核心原则
- 先确定隔离级别 — DB-per-tenant（强隔离·高成本）/ Schema-per-tenant / 基于行（tenant_id，低成本·泄露风险）。
- 若采用基于行，则对每条查询强制 tenant_id 过滤 — 用 ORM 全局过滤器或 DB Row-Level Security 从根源杜绝遗漏。
- 租户识别从认证令牌（JWT claim）·子域名中导出 — 不信任客户端发送的 tenant 参数。
- 跨租户数据泄露是致命的 — 将“尝试访问其他租户数据 → 拦截”列为必备测试用例。
- 在共用资源（连接池·缓存键·文件路径）中混入 tenant_id 作为命名空间，防止冲突·泄露。

## 2. 规则

### 2-1. 隔离策略对比
| 策略 | 隔离强度 | 成本·扩展 | 特点 |
|---|---|---|---|
| DB per tenant | 最强 | 租户多时运维成本激增 | 备份·恢复·合规应对容易 |
| Schema per tenant | 中等 | 中等 | 在一个 DB 内分离 Schema |
| 基于行（共享表） | 最弱 | 最便宜·最易扩展 | tenant_id 缺失即泄露 — 必须 RLS·全局过滤器 |

### 2-2. 租户识别 — 不信任客户端输入
```text
// ❌ 禁止 — 原样信任客户端发送的 tenant 参数
tenantId = request.query.tenantId

// ✅ 推荐 — 从认证令牌（JWT claim）·子域名中导出
tenantId = jwt.claims.tenant_id   // 或 subdomain → tenant 映射
```

### 2-3. 基于行的查询 — 强制 tenant_id
```text
// ❌ 禁止 — 查询中遗漏 tenant_id 过滤即泄露
SELECT * FROM orders WHERE id = :id

// ✅ 推荐 — 用 ORM 全局过滤器或 DB Row-Level Security 从根源杜绝遗漏
SELECT * FROM orders WHERE id = :id AND tenant_id = :tenantId
```

### 2-4. 共用资源命名空间化
```text
// ❌ 禁止 — 缓存键·文件路径无租户区分，导致冲突·泄露
cache.get("user:" + userId)

// ✅ 推荐 — 将 tenant_id 作为命名空间混入
cache.get(tenantId + ":user:" + userId)
```

### 2-5. 安全机制流程
- 在认证时确定租户 → 固定到请求上下文 → 在数据访问层强制应用。
- 将跨租户访问测试纳入回归套件（防止安全回归）。

## 3. 常见错误
- 基于行却在部分查询中遗漏 tenant_id 过滤 → 跨租户泄露。
- 信任客户端发送的 tenant 参数 → 通过篡改访问其他租户。
- 缓存键·文件路径未应用租户命名空间 → 数据冲突·泄露。
- 缺少跨租户访问测试 → 无法捕获安全回归。

## 4. 检查清单
- [ ] 是否先确定了隔离级别（DB/Schema/行）
- [ ] 若基于行，是否对每条查询强制 tenant_id 过滤（全局过滤器·RLS）
- [ ] 是否从认证令牌·子域名导出租户（不信任客户端输入）
- [ ] 是否对共用资源应用了 tenant_id 命名空间
- [ ] 是否将“尝试访问其他租户 → 拦截”测试纳入回归套件
