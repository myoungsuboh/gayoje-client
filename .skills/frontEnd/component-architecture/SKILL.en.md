---
name: Component Architecture (Component Architecture)
description: A universal standard for UI component design covering single responsibility, one-way data flow (props in / events out), presentational-container separation, and lifting state up; independent of any specific framework. Read this when building a new component or breaking up a bloated one, when organizing data/event flow between components, or when deciding where to put state.
rules:
  - "Single-responsibility component: one component does only one thing. If one component does 'showing + fetching + processing + routing', split it. When its description contains 'and' several times, that's a signal to separate."
  - "Props in / events out (one-way data flow): data flows down only as props (input) from parent → child, and a child's request for change flows up only as events (output) to the parent. A child does not modify the parent's data directly."
  - "Presentational / Container separation: split 'how it looks' (presentational, takes only props and renders) and 'how it behaves' (container, data fetching, state, side effects) into different components."
  - "Small, reusable units: make presentational components that are not tied to a domain reusable anywhere. When the same markup/behavior repeats twice, extract it into a component."
  - "State at the lowest place it's needed, lifted up when shared: keep state close to the component that uses it. When two or more need to share the same state, lift it up to the nearest common parent (lifting state up) to make it the single source of truth."
  - "Make the public API (interface) explicit: declare the inputs (props) a component receives and the events it emits with clear types/names, so a consumer can use it without knowing the internal implementation."
  - "Prefer standard/shared components: use the standard components of the design system / UI library first, and customize minimally only when domain specialization is needed. (→ see design-system)"
tags:
  - "defineComponent"
  - "defineProps"
  - "defineEmits"
  - "slot"
  - "provide"
  - "inject"
  - "<script setup>"
---

# 🧩 Component Architecture (Component Architecture)

> Divide the UI into small components with clear responsibilities, send data down as props and changes up as events (one-way), and separate presentation from logic to build a structure that is easy to reuse, test, and replace. Read this when building a new component or breaking up a bloated one, or when deciding the data/event flow and state location between components. It is a universal standard not tied to any specific language/framework.

## 1. Core Principles
- **Single-responsibility component**: one component does only one thing. If one component does "showing + fetching + processing + routing", split it. When its description contains "and" several times, that's a signal to separate.
- **Props in / events out (one-way data flow)**: data flows down only as props (input) from parent → child, and a child's request for change flows up only as events (output) to the parent. A child does not modify the parent's data directly.
- **Presentational / Container separation**: split "how it looks" (presentational, takes only props and renders) and "how it behaves" (container, data fetching, state, side effects) into different components.
- **Small, reusable units**: make presentational components that are not tied to a domain reusable anywhere. When the same markup/behavior repeats twice, extract it into a component.
- **State at the lowest place it's needed, lifted up when shared**: keep state close to the component that uses it. When two or more need to share the same state, **lift it up (lifting state up)** to the nearest common parent to make it the single source of truth.
- **Make the public API (interface) explicit**: declare the inputs (props) a component receives and the events it emits with clear types/names, so a consumer can use it without knowing the internal implementation.
- **Prefer standard/shared components**: use the standard components of the design system / UI library first, and customize minimally only when domain specialization is needed. (→ see `design-system`)

## 2. Rules

### 2-1. One component = one responsibility
- Split a bloated component (data fetching + state + complex markup + branching) into responsibility units.
- If you cannot write "what this component does" in one sentence, it is doing too much.

```text
// ❌ Forbidden — one component does fetching, state, presentation, and events
UserDashboard:
  fetch users from API
  hold filter/sort/pagination state
  render table markup, rows, cells
  handle row click, edit, delete

// ✅ Recommended — separated by responsibility
UserDashboardContainer:   // data fetching + holds state
  fetch users; hold filter state
  render <UserTable users=... onRowSelect=...>
UserTable (presentational): // takes only props and renders, changes via events
  render rows from props.users
  emit "rowSelect" on click
```

### 2-2. Data goes down as props, changes go up as events (one-way)
- A child does not directly modify the data given by the parent. If it needs to change, it tells the parent "please change it" via an event.
- The parent is the owner of the state (source of truth), and the child only receives, displays, and conveys intent.

```text
// ❌ Forbidden — a child directly mutates the received data
Child(props.item):
  props.item.done = true        // secretly changes the parent's state (two-way, implicit mutation)

// ✅ Recommended — the child only conveys intent via an event, the parent makes the change
Child(props.item):
  onClick → emit "toggle", props.item.id
Parent:
  <Child item=... onToggle=(id) => updateItem(id) >
```

### 2-3. Separate presentational and container
- Presentational component: takes only props and renders, no side effects or data fetching → easy to reuse and test.
- Container component: handles data fetching, state, side effects, and passes them to the presentational component as props.

```text
// ❌ Forbidden — data fetching is embedded inside presentation (cannot reuse/test)
PriceTag:
  price = fetch("/api/price")   // a presentational component depends on the network
  render price

// ✅ Recommended — fetching is the container's, presentation only receives the value
PriceTagContainer:
  price = usePrice()            // fetching/state
  render <PriceTag value=price>
PriceTag(value):                // pure presentation, reusable anywhere
  render value
```

### 2-4. Extract repeated markup/behavior into a component (reuse)
- When the same UI fragment repeats in two or more places, pull it out into a shared component managed in one place.
- Designing it not tied to a domain (generalizing the name/props) widens the reuse range.

```text
// ❌ Forbidden — copy-pasting the same badge markup per screen
(the same status-badge markup is scattered across several screens)

// ✅ Recommended — extract into a shared component, vary via props
StatusBadge(status, label):  // defined in one place and reused
  render colored badge by status
```

### 2-5. Keep state low, lift it up when shared (Lifting State Up)
- Keep state used by only one component inside it. When two siblings need to share the same value, lift it up to a common parent, manage it in one place, and connect via props/events.
- Do not duplicate state with the same meaning in multiple places (a source of sync bugs). Keep a single source.
- State shared by far-apart components across the whole app is separated into global state management. (→ see `state-management`)

```text
// ❌ Forbidden — siblings each hold state and act independently (sync breaks)
FilterInput:  holds its own "query"
ResultList:   holds its own "query"   // the two diverge

// ✅ Recommended — lift up to a common parent for a single source
SearchPage:
  query state here
  <FilterInput value=query onChange=setQuery>
  <ResultList query=query>
```

### 2-6. Declare the public interface (props/events) explicitly
- Clearly declare the names/types of the props a component receives and the events it emits. Do not leave an implicit, undocumented interface.
- Name inputs as nouns (`items`, `disabled`) and output events as verbs/event names (`submit`, `select`), consistently.

```text
// ❌ Forbidden — unclear what it receives/emits
Component(...anything):  // takes an arbitrary object wholesale and guesses internally

// ✅ Recommended — declare the input/output contract
Component:
  props:  items: Item[], disabled: boolean
  events: select(id), submit(payload)
```

## 3. Common Mistakes
- **God component**: one component does fetching, state, presentation, routing → split by responsibility.
- **A child directly mutates parent data**: one-way flow breaks, causing untraceable bugs → push changes up as events.
- **Data fetching embedded in a presentational component**: blocks reuse/test → separate fetching into a container.
- **Markup copy-paste**: the same UI duplicated in several places → extract into a shared component.
- **Duplicate state holding**: the same value held separately by multiple components, so it diverges → lift up to a common parent for a single source.
- **Prop drilling overuse**: passing props by hand down a deep tree → put truly global values into global state (→ `state-management`).
- **Implicit interface**: passing props/events wholesale without declaration → make the input/output contract explicit.
- **Always customizing**: building it yourself when a standard component exists → prefer the design system/standard (→ `design-system`).

## 4. Checklist
- [ ] Can you explain this component's responsibility in one sentence (otherwise split)?
- [ ] Does data flow down as props and changes flow up as events (the child does not directly modify parent data)?
- [ ] Did you separate the presentational component from data fetching/state (container)?
- [ ] Did you extract repeated markup/behavior into a shared component?
- [ ] Did you keep state at the lowest place it's needed, and lift shared state up to a common parent (single source)?
- [ ] Do you avoid duplicating state with the same meaning in multiple places?
- [ ] Did you declare the public interface such as props/events explicitly with names/types?
- [ ] Did you prefer standard/design-system components and minimize customization?

## Appendix: Per-Stack Examples

> Below are reference implementation examples. Add examples matching the stack your team uses (e.g. React, Svelte, Angular, etc.) following the same pattern. The principles/rules of 1–4 above are the standard; the appendix is merely an application of them.

### Vue 3 + Vuetify

> The principles/rules of 1–4 in the main text are the standard. In Vue 3 + Vuetify, apply them with the following mapping — rather than inventing new code, just point out which API implements which principle. (For Vue SFC structure see `vue-sfc-structure`, for using Vuetify components see `ui-vuetify`, for preferring standard components see `design-system`)

- **Declaring the public interface (main text 2-6)** → make props inputs and emits outputs explicit with `defineProps`/`defineEmits`.
- **Preferring standard components (main text core principles)** → use Vuetify standards (`VCard`/`VBtn`/`VDataTable`, etc.) first and minimize customization.
- **Authoring conventions (stack-specific)** → every component is `.vue` + `<script setup>`, with file names/tags in `PascalCase`. Icons apply Iconify consistently via the `icon` attribute of `VIcon`.
