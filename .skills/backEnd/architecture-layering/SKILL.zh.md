---
name: 应用架构 — 分层 & 关注点分离 (MVC/Clean)
description: 一份与技术栈无关的架构指南，分离控制器、服务、仓储各层，并规定业务逻辑的位置与依赖方向。在为新功能确定代码归属，或审查以避免逻辑混入控制器/UI 时阅读。关键词: MVC, MVVM, layered-architecture, clean-architecture, hexagonal, controller, service, repository, separation-of-concerns, dependency-inversion, DTO.
rules:
  - "分离各层 — Controller(请求/响应)·Service(业务逻辑)·Repository(数据访问)。一个文件不兼任两种职责。"
  - "业务逻辑只放在 Service 层 — 控制器只做输入校验、调用与响应转换，UI/视图只负责呈现。"
  - "依赖只向内(朝向领域)— Controller→Service→Repository。禁止反向引用(Repository 调用 Service)。"
  - "层间边界通过 DTO 传递，不把 DB 实体原样暴露到控制器/视图。"
  - "把外部依赖(DB·外部 API·文件)抽象到接口之后，使领域逻辑不被实现绑定(依赖倒置)。"
  - "前端采用 MVVM/组件结构 — 分离视图(模板)、状态(store/composable)、API 调用(service)，不在组件中放业务逻辑。"
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

# 🏛️ 应用架构 — 分层 & 关注点分离

> 把 Controller·Service·Repository 的边界作为规则钉死，让业务逻辑汇聚到一处(Service)。在为新功能确定代码位置或审查结构时阅读。

AI 智能体最常犯的结构性错误是**把业务逻辑硬塞进控制器或 UI 组件**。起初看似快捷，但测试、复用与变更会急剧变难。一旦把层边界作为规则钉死，AI 也会在这一框架内生成代码。

## 1. 核心原则

- 分离各层 — Controller(请求/响应)·Service(业务逻辑)·Repository(数据访问)。一个文件不兼任两种职责。
- 业务逻辑只放在 Service 层 — 控制器只做输入校验、调用与响应转换，UI/视图只负责呈现。
- 依赖只向内(朝向领域)— Controller→Service→Repository。禁止反向引用(Repository 调用 Service)。
- 层间边界通过 DTO 传递，不把 DB 实体原样暴露到控制器/视图。
- 把外部依赖(DB·外部 API·文件)抽象到接口之后，使领域逻辑不被实现绑定(依赖倒置)。
- 前端采用 MVVM/组件结构 — 分离视图(模板)、状态(store/composable)、API 调用(service)，不在组件中放业务逻辑。

## 2. 规则

### 2-1. 标准分层 (后端)

```
요청 → Controller → Service → Repository → DB
        (검증/변환)  (로직)    (데이터접근)
```

| 层 | 职责 | 不应包含 |
|---|---|---|
| Controller | 请求解析·输入校验·响应转换 | 业务规则、SQL |
| Service | 业务逻辑·事务·策略 | HTTP/请求对象、直接 SQL |
| Repository | 数据访问(查询) | 业务判断 |

- **依赖方向**: Controller→Service→Repository(单向)。禁止反向引用。
- **DTO 边界**: 层间用 DTO。不让 DB 实体直接流到控制器/视图(过度暴露·耦合)。
- **依赖倒置**: 把外部依赖(DB·外部 API)放到接口之后 → 领域逻辑不被实现绑定(Clean/Hexagonal)。

### 2-2. 前端 (MVVM / 组件)

```
View(템플릿) ── 상태(store/composable) ── API(service 모듈)
```

- 组件只负责**呈现**。数据加工·策略放到 composable/store/service。
- 不把 API 调用散落在组件里，而是汇聚到 service 层。
- 全局状态放 store，界面局部状态放组件 — 不混淆边界。

## 3. 常见错误

AI 经常产出的 — 审查时剔除。

- ❌ 控制器方法里 if/计算/SQL 混杂一团的 "fat controller"
- ❌ Vue 组件 `<script setup>` 中出现业务规则·复杂数据加工
- ❌ 把 DB 实体直接作为 API 响应返回(字段过度暴露)
- ❌ Service 依赖 HttpServletRequest 等 Web 层对象
- ❌ Repository 调用 Service 的反向引用

> **应用提示**: 在 AGENTS.md / 规则文件中钉上一行「业务逻辑只在 Service，控制器要薄」，智能体每次生成都会遵守这一边界。(与『智能体规则文件』技能配合使用效果更佳)

## 4. 检查清单

- [ ] 业务逻辑是否只在 Service 层(未混入控制器·UI)
- [ ] 依赖方向是否为 Controller→Service→Repository 单向(无反向引用)
- [ ] 层间是否用 DTO 传递,未把 DB 实体原样对外暴露
- [ ] 是否把外部依赖(DB·外部 API)抽象到接口之后
- [ ] 前端组件是否只负责呈现,并把 API 调用汇聚到 service
