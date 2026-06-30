---
name: State Management (State Management)
description: A general-purpose standard for client-side state management covering local/global boundaries, single source of truth, computing derived state, mutating through actions, and minimizing the persistence scope, independent of any specific framework/library. Read it when newly designing global state, deciding where to put a value (component-local/global), persisting state, or subscribing to state from a component.
rules:
  - "Local vs global boundary: keep values used only by one component (or its children) local. Promote to global only values shared by multiple screens/components that must survive after navigation. Do not promote to global 'just in case'."
  - "Single source of truth: the same data is owned in only one place. Do not duplicate the same value across multiple stores/components and update each separately — copies will inevitably diverge."
  - "Compute derived state, do not store it: values that can be computed from other state (sums, filter results, flags) should be derived from the source rather than stored separately. Storing a derived value creates a responsibility to keep it in sync with the source, and that soon breaks."
  - "Mutate only through actions: state is changed only through defined mutation channels (actions/reducers/methods). Components do not directly modify the global state object. Mutation points must be gathered in one place to be traceable and testable."
  - "Read by subscribing, preserving reactivity: components subscribe to and read only the state they need. When taking state out, do not break reactivity (the connection that updates on change) — copying a value once and freezing it means later changes are not reflected on screen."
  - "Minimize the persistence scope (exclude sensitive info): persist only values that must survive a refresh (theme, non-volatile user settings, etc.). Do not carelessly leave sensitive info such as tokens/passwords, or cache-like data that can be re-fetched from the server, in permanent storage."
  - "Modularize state: do not keep global state as one lump; split it by domain (user, cart, settings, etc.). Each module should have a clear responsibility and a consistent name."
tags:
  - "pinia"
  - "defineStore"
  - "useStore"
  - "storeToRefs"
  - "ref("
  - "reactive("
---

# 🗂️ State Management (State Management)

> Clearly define the boundary of which values go local vs global, gather the source of the same data into one place (single source of truth), do not store derived values but compute them, mutate only through defined actions, and persist only within the necessary scope (excluding sensitive info). Read it when designing global state or deciding where to put state, how to subscribe to it, and how to persist it. This is a general-purpose standard not tied to any specific framework/library.

## 1. Purpose

When client-side state is duplicated all over the place, the same value is updated separately in two places, and components directly stir up the global store, debugging becomes impossible. This standard makes the state flow predictable by setting common criteria for "what to put where, who changes it and how, and what to keep." It applies regardless of library choice (whether a global store, context, or signals).

## 2. Core Principles

- **Local vs global boundary**: keep values used only by one component (or its children) local. Promote to global only values shared by multiple screens/components that must survive after navigation. Do not promote to global "just in case".
- **Single source of truth**: the same data is owned in only one place. Do not duplicate the same value across multiple stores/components and update each separately — copies will inevitably diverge.
- **Compute derived state, do not store it**: values that can be computed from other state (sums, filter results, flags) should be derived from the source rather than stored separately. Storing a derived value creates a responsibility to keep it in sync with the source, and that soon breaks.
- **Mutate only through actions**: state is changed only through defined mutation channels (actions/reducers/methods). Components do not directly modify the global state object. Mutation points must be gathered in one place to be traceable and testable.
- **Read by subscribing, preserving reactivity**: components subscribe to and read only the state they need. When taking state out, do not break reactivity (the connection that updates on change) — copying a value once and freezing it means later changes are not reflected on screen.
- **Minimize the persistence scope (exclude sensitive info)**: persist only values that must survive a refresh (theme, non-volatile user settings, etc.). Do not carelessly leave sensitive info such as tokens/passwords, or cache-like data that can be re-fetched from the server, in permanent storage.
- **Modularize state**: do not keep global state as one lump; split it by domain (user, cart, settings, etc.). Each module should have a clear responsibility and a consistent name.

## 3. Rules

### 3-1. First decide whether to put it local or global

- Keep input values, open/closed state, and temporary flags used only within one component local.
- Promote to global only values shared by multiple screens that must persist after route navigation.

```text
// ❌ Forbidden — putting a toggle used by only one component into the global store
globalStore.isDropdownOpen = true   // pollutes global state unrelated to other screens

// ✅ Recommended — local values local, only shared values global
local:  isDropdownOpen          // only within this component
global: currentUser, cart       // shared by multiple screens
```

### 3-2. The same data as a single source

- Do not hold the same value in two stores/two components separately and update each on its own.
- If another place needs it, have it subscribe to the source or hold only the identifier and look it up from the source.

```text
// ❌ Forbidden — the same user kept by two places separately → soon inconsistent
authStore.user   = {...}
profileStore.user = {...}        // a copy, diverges when an update is missed

// ✅ Recommended — one place owns it, the rest reference/subscribe
authStore.user = {...}           // single source
profileView → reads authStore.user
```

### 3-3. Compute derived state, do not store it

- Values derived from other state should be expressed as derivations (computations), not stored fields.
- If you do store them, manual synchronization is needed on every change of the source, and that synchronization gets missed.

```text
// ❌ Forbidden — store the total separately → must update it directly every time items change
state: { items, totalCount }     // totalCount may diverge from items

// ✅ Recommended — derive the total from items
state:   { items }
derived: totalCount = items.length
```

### 3-4. Mutate only through defined actions

- Global state is changed only through defined channels such as actions/reducers/methods.
- Components do not change it by directly assigning fields of the global state object.

```text
// ❌ Forbidden — a component directly modifies global state
component:  store.cart.items.push(item)   // mutation points scattered everywhere

// ✅ Recommended — change through one action place
store.addToCart(item)                     // traceable, testable, loggable
```

### 3-5. Preserve reactivity when reading

- Components subscribe to only the state they need (over-subscription causes unnecessary updates).
- When taking state out, do not break the reactive connection — copying and freezing the value at that moment means later changes are not reflected.

```text
// ❌ Forbidden — copy the value at a moment → later changes don't reach the screen
const u = store.user          // a frozen snapshot

// ✅ Recommended — subscribe while keeping the reactive connection
const u = subscribe(store, s => s.user)   // updated when user changes
```

### 3-6. Persist only what is necessary, exclude sensitive info

- Explicitly specify as persistence targets only values that must persist after a refresh.
- Do not leave sensitive info such as tokens/passwords, or cache-like data that can be re-fetched from the server, in permanent storage.

```text
// ❌ Forbidden — persist the entire store as a whole (including sensitive info)
persist: entire authStore        // even accessToken ends up on disk

// ✅ Recommended — persist only non-sensitive items that need to persist
persist: [theme, locale]         // exclude tokens (memory/secure storage)
```

### 3-7. Modularize state by domain

- Do not keep global state as one giant object; split it by domain.
- Set a consistent naming rule per module so that where things are is predictable.

```text
// ❌ Forbidden — everything in one lump
globalStore = { user, cart, theme, modalOpen, searchText, ... }

// ✅ Recommended — split by domain + consistent names
userStore / cartStore / settingsStore
```

## 4. Common Mistakes

- **Promoting everything to global** → even values used by only one component go global, coupling soars and tracing becomes hard. Only values that need to be shared/persisted go global.
- **Duplicating the same value in multiple places** → violates single source of truth, and updating each separately causes inconsistency. One place owns it, the rest reference it.
- **Putting derived values as stored fields** → synchronization with the source is missed and they diverge. Express derivations as computations.
- **Components directly modifying global state** → mutation points scatter and debugging becomes impossible. Change only through actions.
- **Breaking reactivity and copying values** → freezing the moment's value without subscribing means later changes are not reflected on screen.
- **Persisting the entire store** → leaves even sensitive info (tokens, etc.) and cache-like data on disk. Persist only non-sensitive items that must persist.
- **A giant single store** → putting all state in one lump tangles responsibilities. Split by domain.
- **Carrying server data as global state** → manually duplicating/synchronizing data that can be fetched from the server into global state. Leave server state to the data-fetching/caching layer (`server-state`) where possible, and limit global state to true client state.

## 5. Checklist

- [ ] Did you decide whether this value is **local or global** by the criterion (shared, persists after route navigation)?
- [ ] Is the same data owned in one place as a **single source** (no copying then updating each separately)?
- [ ] Are values computable from other state kept as **derivations (computed)** (no duplication as stored fields)?
- [ ] Are state mutations done only through **defined actions/channels** (no direct modification by components)?
- [ ] Do components subscribe to only the state they need and read it without breaking **reactivity**?
- [ ] Does persistence target **only persistence-necessary, non-sensitive items** (excluding sensitive info such as tokens)?
- [ ] Is global state **modularized by domain** and following consistent names?
- [ ] Did you avoid manually duplicating data fetched from the server into global state?

## Appendix: Per-Stack Examples

> The following are reference implementation examples. Add examples matching the stack your team uses (e.g., React/Redux Toolkit·Zustand, Vue/Pinia, Angular/NgRx, Svelte stores, etc.) following the same pattern. The purpose/principles/rules in 1–5 above are the standard; the appendix is merely an application case. (Server-state caching is a separate topic; refer to `server-state`.)

### Vue 3 (Pinia)

> The principles/rules in sections 2–3 of the body are the standard. In Pinia, apply them with the following mapping — rather than inventing new code, just point out which API implements which principle.

- **Domain modularization (body 3-7)** → split stores with `defineStore` and follow `use[Name]Store` naming (files in `src/store`, etc.).
- **Minimize persistence scope (body 3-6)** → with `pinia-plugin-persistedstate`, persist only non-sensitive values that need to persist (exclude tokens).
- **Preserve reactivity (body 3-5)** → when destructuring store values, use `storeToRefs` so the reactive connection is not broken.

```javascript
import { useUserStore } from '@/utils/user-store'
import { storeToRefs } from 'pinia'

const userStore = useUserStore()
const { user, sessionId } = storeToRefs(userStore)   // preserve reactivity
```
