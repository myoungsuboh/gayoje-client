---
name: 项目架构 (Project Architecture)
description: 定义项目的目录结构以及核心库使用指南。在判断将新文件/模块放在何处、是否保持一致结构时阅读。关键词: 目录结构, @core, @layouts, api 模块, utils。
rules:
  - "@core 通过继承/扩展而非修改来使用。"
  - "布局、API、插件、工具各自只在指定目录中管理。"
  - "所有 API 调用函数都以 Api 后缀 export。"
  - "组件区分为可复用单元(src/components)和页面单元(src/views)。"
tags:
  - "src/components"
  - "src/pages"
  - "src/composables"
  - "src/store"
  - "src/utils"
---

# 🏗️ 项目架构

> 提供保持本项目一致结构的指引。在添加新文件·模块或决定目录位置时阅读。

## 1. 核心原则
- `@core` 通过继承/扩展而非修改来使用。
- 布局、API、插件、工具各自只在指定目录中管理。
- 所有 API 调用函数都以 `Api` 后缀 export。
- 组件区分为可复用单元(`src/components`)和页面单元(`src/views`)。

## 2. 规则

### 2-1. 主要目录结构
- **`@core`**: 放置模板布局和核心工具。原则上通过继承/扩展而非修改来使用。
- **`src/@layouts`**: 布局组件(Header、Sidebar、Footer 等)的专用空间。
- **`src/api`**: 按模块管理所有外部 API 调用函数。
- **`src/plugins`**: 放置 Vite、Vue、Iconify 等各类插件配置。
- **`src/utils`**: 管理与业务逻辑无关的纯工具函数(Date 格式化等)。

### 2-2. 模块管理原则
- 所有 API 调用按各个文件加上 `Api` 后缀进行 export。
- 组件分为 `src/components` 和 `src/views`,区分可复用性与页面单元。

## 3. 常见错误
- ❌ 直接修改 `@core` → 模板更新时冲突。应通过继承/扩展使用。
- ❌ 将 API 调用内联到组件中 → 分离到 `src/api` 模块并以 `Api` 后缀 export。
- ❌ 将可复用组件与页面放在同一文件夹 → 区分 `components`(可复用)/`views`(页面)。
- ❌ 将业务逻辑混入 `utils` → 只放纯工具,将领域逻辑分离。
- ❌ 模块间循环依赖 → 保持单向依赖。

## 4. 检查清单
- [ ] 是否未直接修改 `@core` 而通过继承/扩展使用?
- [ ] 是否将布局组件放在 `src/@layouts`?
- [ ] 是否将 API 调用函数放在 `src/api` 并以 `Api` 后缀 export?
- [ ] 是否将插件配置放在 `src/plugins`?
- [ ] 是否将纯工具函数放在 `src/utils`?
- [ ] 是否将组件区分为可复用(`src/components`)·页面(`src/views`)?
