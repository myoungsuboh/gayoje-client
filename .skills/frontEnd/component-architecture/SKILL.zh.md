---
name: 组件架构 (Component Architecture)
description: 涵盖单一职责·单向数据流(props 输入/事件输出)·展示与容器分离·状态上提的 UI 组件设计通用标准,与特定框架无关。在构建新组件或拆分臃肿组件时、整理组件间数据·事件流时、决定状态放在何处时阅读。
rules:
  - "单一职责组件: 一个组件只做一件事。若一个组件把「展示 + 获取 + 加工 + 路由」全做了就拆分。说明里多次出现「并且」就是分离的信号。"
  - "props 输入 / 事件输出 (单向数据流): 数据只作为 props(输入)从父 → 子向下流,子的变更请求只作为 事件(输出)向父向上传。子不直接修改父的数据。"
  - "展示(Presentational) / 容器(Container) 分离: 把「长什么样」(展示,只接收 props 并渲染)与「怎么运作」(容器,数据获取·状态·副作用)分到不同组件。"
  - "小而可复用的单元: 让不绑定领域的展示组件可在任何地方复用。相同标记·行为重复两次时就抽取成组件。"
  - "状态放在所需的最低处,共享时上提: 把状态放在使用它的组件附近。两个及以上需要共享同一状态时上提到最近的公共父级(lifting state up)作为单一来源(single source of truth)。"
  - "显式声明公开 API(接口): 组件接收的输入(props)和发出的事件要明确声明类型·名称,使使用方无需了解内部实现即可使用。"
  - "优先标准·共用组件: 先使用设计系统/UI 库的标准组件,仅在需要领域特化时做最小限度的定制。(→ 参见 design-system)"
tags:
  - "defineComponent"
  - "defineProps"
  - "defineEmits"
  - "slot"
  - "provide"
  - "inject"
  - "<script setup>"
---

# 🧩 组件架构 (Component Architecture)

> 把 UI 分成小而职责明确的组件,数据用 props 向下传、变更用事件向上传(单向),分离展示与逻辑,构建易于复用·测试·替换的结构。在构建新组件或拆分臃肿组件时、决定组件间数据·事件流和状态位置时阅读。这是不依赖特定语言/框架的通用标准。

## 1. 核心原则
- **单一职责组件**: 一个组件只做一件事。若一个组件把「展示 + 获取 + 加工 + 路由」全做了就拆分。说明里多次出现「并且」就是分离的信号。
- **props 输入 / 事件输出 (单向数据流)**: 数据只作为 props(输入)从父 → 子向下流,子的变更请求只作为 事件(输出)向父向上传。子不直接修改父的数据。
- **展示(Presentational) / 容器(Container) 分离**: 把「长什么样」(展示,只接收 props 并渲染)与「怎么运作」(容器,数据获取·状态·副作用)分到不同组件。
- **小而可复用的单元**: 让不绑定领域的展示组件可在任何地方复用。相同标记·行为重复两次时就抽取成组件。
- **状态放在所需的最低处,共享时上提**: 把状态放在使用它的组件附近。两个及以上需要共享同一状态时**上提(lifting state up)**到最近的公共父级作为单一来源(single source of truth)。
- **显式声明公开 API(接口)**: 组件接收的输入(props)和发出的事件要明确声明类型·名称,使使用方无需了解内部实现即可使用。
- **优先标准·共用组件**: 先使用设计系统/UI 库的标准组件,仅在需要领域特化时做最小限度的定制。(→ 参见 `design-system`)

## 2. 规则

### 2-1. 一个组件 = 一个职责
- 把臃肿的组件(数据获取 + 状态 + 复杂标记 + 分支)按职责单位拆分。
- 若无法用一句话写出「这个组件做什么」,说明它做得太多。

```text
// ❌ 禁止 — 一个组件把获取·状态·展示·事件全做了
UserDashboard:
  fetch users from API
  hold filter/sort/pagination state
  render table markup, rows, cells
  handle row click, edit, delete

// ✅ 推荐 — 按职责分离
UserDashboardContainer:   // 数据获取 + 持有状态
  fetch users; hold filter state
  render <UserTable users=... onRowSelect=...>
UserTable (presentational): // 只接收 props 并渲染,变更走事件
  render rows from props.users
  emit "rowSelect" on click
```

### 2-2. 数据用 props 向下传,变更用事件向上传 (单向)
- 子不直接修改父给的数据。需要改时用事件告诉父「请帮忙改」。
- 父是状态的拥有者(source of truth),子只是接收·展示并传达意图。

```text
// ❌ 禁止 — 子直接变形接收到的数据
Child(props.item):
  props.item.done = true        // 偷偷改了父的状态 (双向·隐式变形)

// ✅ 推荐 — 子只用事件传达意图,变更由父来做
Child(props.item):
  onClick → emit "toggle", props.item.id
Parent:
  <Child item=... onToggle=(id) => updateItem(id) >
```

### 2-3. 分离展示(Presentational)与容器(Container)
- 展示组件: 只接收 props 并渲染,无副作用·数据获取 → 易复用·测试。
- 容器组件: 负责数据获取·状态·副作用,并以 props 传给展示组件。

```text
// ❌ 禁止 — 展示内嵌入了数据获取 (无法复用·测试)
PriceTag:
  price = fetch("/api/price")   // 展示组件依赖网络
  render price

// ✅ 推荐 — 获取归容器,展示只接收值
PriceTagContainer:
  price = usePrice()            // 获取/状态
  render <PriceTag value=price>
PriceTag(value):                // 纯展示,任何地方都可复用
  render value
```

### 2-4. 重复的标记·行为抽取成组件 (复用)
- 同一 UI 片段在两处以上重复时抽出为共用组件,在一处管理。
- 设计成不绑定领域(把名称·props 一般化)会拓宽复用范围。

```text
// ❌ 禁止 — 把相同的徽章标记每个画面复制粘贴
(相同的 status-badge 标记散落在多个画面)

// ✅ 推荐 — 抽取成共用组件,用 props 变形
StatusBadge(status, label):  // 在一处定义并复用
  render colored badge by status
```

### 2-5. 状态放低,共享时上提 (Lifting State Up)
- 只被一个组件使用的状态放在其内部。两个兄弟需要共享同一值时上提到公共父级,在一处管理并用 props/事件连接。
- 不要把同一含义的状态复制到多处(同步 bug 之源)。设单一来源。
- 应用全局中相距很远的组件共享的状态分离到全局状态管理。(→ 参见 `state-management`)

```text
// ❌ 禁止 — 兄弟各自持有状态,各行其是 (同步破裂)
FilterInput:  holds its own "query"
ResultList:   holds its own "query"   // 两者错开

// ✅ 推荐 — 上提到公共父级,单一来源
SearchPage:
  query state here
  <FilterInput value=query onChange=setQuery>
  <ResultList query=query>
```

### 2-6. 显式声明公开接口(props/事件)
- 明确声明组件接收的 props 和发出的事件的名称·类型。不留隐式·无文档的接口。
- 输入用名词形(`items`, `disabled`),输出事件用动词形/事件名(`submit`, `select`),保持一致。

```text
// ❌ 禁止 — 接收/发出什么不明确
Component(...anything):  // 整个接收任意对象,内部去猜

// ✅ 推荐 — 声明输入/输出契约
Component:
  props:  items: Item[], disabled: boolean
  events: select(id), submit(payload)
```

## 3. 常见错误
- **万能组件(God component)**: 获取·状态·展示·路由由一个组件全做 → 按职责拆分。
- **子直接变形父数据**: 单向流被破坏,产生无法追踪的 bug → 变更用事件向上传。
- **展示组件内嵌数据获取**: 复用·测试被堵 → 把获取分离到容器。
- **标记复制粘贴**: 同一 UI 复制到多处 → 抽取成共用组件。
- **重复持有状态**: 同一值被多个组件各自持有而错开 → 上提到公共父级作为单一来源。
- **滥用 prop drilling**: 在深层树中手动一路向下传 props → 真正全局的值放入全局状态 (→ `state-management`)。
- **隐式接口**: 不声明就整个传递 props/事件 → 明示输入·输出契约。
- **无条件定制**: 已有标准组件却自己造 → 优先设计系统/标准 (→ `design-system`)。

## 4. 检查清单
- [ ] 能否用一句话说明这个组件的职责 (否则拆分)
- [ ] 数据是否用 props 向下流、变更是否用事件向上传 (子是否不直接改父数据)
- [ ] 是否分离了展示组件与数据获取/状态(容器)
- [ ] 是否把重复的标记·行为抽取成共用组件
- [ ] 是否把状态放在所需的最低处,并把共享状态上提到公共父级 (单一来源)
- [ ] 是否避免把同一含义的状态在多处重复持有
- [ ] 是否把 props/事件等公开接口连同名称·类型显式声明
- [ ] 是否优先标准/设计系统组件并将定制最小化

## 附录: 各技术栈示例

> 以下是参考用的实现示例。按团队所用的技术栈(例如 React, Svelte, Angular 等)以相同模式添加示例。上面 1~4 的原则·规则是标准,附录只是其应用案例。

### Vue 3 + Vuetify

> 正文 1~4 的原则·规则是标准。在 Vue 3 + Vuetify 中以下面的映射应用 — 不去编造新代码,只指出哪个 API 实现了哪个原则。(Vue SFC 结构参见 `vue-sfc-structure`,Vuetify 组件运用参见 `ui-vuetify`,标准组件优先参见 `design-system`)

- **声明公开接口(正文 2-6)** → 用 `defineProps`/`defineEmits` 明示 props 输入·emits 输出。
- **标准组件优先(正文核心原则)** → 先用 Vuetify 标准(`VCard`/`VBtn`/`VDataTable` 等)并将定制最小化。
- **编写惯例(技术栈专用)** → 所有组件都是 `.vue` + `<script setup>`,文件名·标签用 `PascalCase`。图标通过 `VIcon` 的 `icon` 属性一致地应用 Iconify。
