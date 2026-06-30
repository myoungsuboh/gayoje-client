---
name: Feature Flag (Feature Flag)
description: A stack-agnostic universal standard for feature flags that decouple code deployment from feature release — separating deploy/release, managing flag lifecycle and cleanup, concentrating branching at entry points, testing both on/off paths, and managing state remotely or via environment. Read when handling new features as gradual rollouts, A/B tests, or kill switches, and when deciding flag lifecycle, cleanup, and remote management. Keywords: feature flag, feature toggle, rollout, experiment, kill switch, release toggle.
rules:
  - "Separate deploy from release: deploy new features wrapped in a flag. Merging code is not the same as exposing the feature — the flag decides when and to whom it turns on."
  - "Define a lifecycle for every flag: decide whether it is temporary (release), experimental, or permanent (operational), and remove a temporary flag that has served its purpose immediately rather than leaving it as a dead branch. Decide the removal condition/ticket when you create it."
  - "Manage state outside the code: do not bake flag on/off values into build artifacts; read them from an external source such as environment variables or a remote configuration service so they can be changed without redeploying."
  - "Concentrate branching at entry points: branch only once at an entry point such as a route or container, and do not repeat the same branch deep inside screens/modules — the more it is scattered, the harder it is to remove."
  - "Test both the on and off paths: verify both the enabled path and the disabled (rollback) path. If you never look at the disabled path, the kill switch will be broken exactly when you need it."
  - "Document the name and purpose: leave a trace of which flag exists and why, who owns it, and when it will be removed."
tags:
  - "feature flag"
  - "feature toggle"
  - "rollout"
  - "experiment"
  - "kill switch"
  - "release toggle"
  - "배포 릴리스 분리"
  - "플래그 수명"
  - "feature-flag"
  - "feature-toggle"
  - "growthbook"
  - "launchdarkly"
  - "flagsmith"
---

# 🚩 Feature Flag (Feature Flag)

> Separate code merge (deploy) from feature exposure (release). Read when you need to roll out a new feature gradually, run A/B tests, or have a kill switch, and when deciding flag lifecycle, cleanup, and management. This is a universal standard not tied to any specific language/framework.

## 1. Core Principles
- **Separate deploy from release**: deploy new features wrapped in a flag. Merging code is not the same as exposing the feature — the flag decides when and to whom it turns on.
- **Define a lifecycle for every flag**: decide whether it is temporary (release), experimental, or permanent (operational), and remove a temporary flag that has served its purpose immediately rather than leaving it as a dead branch. Decide the removal condition/ticket when you create it.
- **Manage state outside the code**: do not bake flag on/off values into build artifacts; read them from an external source such as environment variables or a remote configuration service so they can be changed without redeploying.
- **Concentrate branching at entry points**: branch only once at an entry point such as a route or container, and do not repeat the same branch deep inside screens/modules — the more it is scattered, the harder it is to remove.
- **Test both the on and off paths**: verify both the enabled path and the disabled (rollback) path. If you never look at the disabled path, the kill switch will be broken exactly when you need it.
- **Document the name and purpose**: leave a trace of which flag exists and why, who owns it, and when it will be removed.

## 2. Rules

### 2-1. Wrap new features in a flag to separate deploy/release
- Put incomplete features or features needing gradual rollout behind a flag and merge them. Separate the merge and exposure timing to release and roll back safely.

```text
// ❌ Forbidden — merge = immediate full exposure (rollback requires reverting and redeploying)
merge(newCheckout)  → exposed to all users immediately

// ✅ Recommended — merge behind a flag, control exposure timing with the flag
merge(newCheckout behind flag "new-checkout")  // off by default
flag "new-checkout" on → gradual rollout / off → immediate rollback
```

### 2-2. Decide flag type and lifecycle
- Classify the type (lifecycle) when you create it, and attach a removal condition/ticket to temporary flags.

| Type | Lifecycle | Example |
|---|---|---|
| Release toggle | Short-term (removed after launch) | New payment flow |
| Experiment toggle | Mid-term (removed after A/B ends) | Button copy experiment |
| Operational toggle | Permanent | Kill switch |

### 2-3. Read state from outside the code (environment/remote)
- Do not hardcode flag values in source; read them from environment variables (simple) or a remote configuration service (gradual rollout, targeting, real-time changes).
- Concentrate flag lookups in one place (a config module/wrapper) so consumers do not need to know the source.

```text
// ❌ Forbidden — value baked into code, cannot change without redeploy
const newCheckout = true

// ✅ Recommended — read from an external source, gathered in one place
flags.newCheckout = readFlag("new-checkout")   // env or remote config
```

### 2-4. Concentrate branching at entry points (no scattering)
- Do not repeat the same flag branch across screens/modules; branch only once at an entry point such as a route or container to select the implementation.

```text
// ❌ Forbidden — the same flag branch repeated everywhere (hard to remove)
if (flags.newCheckout) showA() else showB()   // scattered across many screens

// ✅ Recommended — branch only once at the entry point to pick the implementation
Checkout = flags.newCheckout ? NewCheckout : LegacyCheckout
```

### 2-5. Test both the on/off paths
- Do not look at the enabled path only; lock down the disabled (legacy/rollback) path with tests too. Guarantee that both paths work even when you toggle the flag.

```text
// ✅ Recommended — verify both paths
test("flag on  → new flow exposed")
test("flag off → legacy flow exposed")  // rollback safety net
```

### 2-6. Clean up completed flags
- For temporary flags whose launch has solidified or whose experiment has ended, remove the branch and the dead code (the side that is no longer used) together.
- Do not defer removal to "later"; handle it according to the removal condition/ticket decided in 2-2.

```text
// After launch is confirmed
remove flag "new-checkout"
delete LegacyCheckout (the branch no longer reached)
```

## 3. Common Mistakes
- **Leaving completed flags in place** → dead branches pile up in the code, increasing complexity and making it confusing which branch is live.
- **Scattering flags across screens/modules** → when you later remove it, you must find and delete every branch, so omissions are frequent. Gather them at the entry point.
- **Not testing the off (rollback) path** → at the very moment a rollback/kill switch is needed, the disabled path is broken.
- **Hardcoding values in code** → you cannot turn it off without redeploying, making immediate response impossible. Read from an external source.
- **Not documenting name, purpose, owner** → nobody knows what the flag is or whether it is safe to remove.
- **Not classifying lifecycle** → a flag that should be temporary settles in like a permanent one. Decide the type and removal condition when you create it.

## 4. Checklist
- [ ] Did you wrap the new feature in a flag to **separate deploy/release**?
- [ ] Did you decide the flag **type (lifecycle)** and create a removal condition/ticket for temporary flags?
- [ ] Do you read the flag value from **outside the code (environment/remote)** and gather the lookup in one place?
- [ ] Did you **concentrate flag branching at the entry point** (not scattered across screens/modules)?
- [ ] Did you test **both the on/off paths** (including the rollback safety net)?
- [ ] Did you **remove temporary flags and dead branches** that have served their purpose?
- [ ] Did you document the flag's **name, purpose, owner**?

## Appendix: Stack-specific Examples

> The following are reference implementation examples. Add examples for the stack your team uses (e.g., React, Svelte, Angular, server-side SDKs) following the same pattern. The principles/rules in 1~4 above are the standard; the appendix is merely an application case. For client input validation, refer to `validation-bean` (the input validation standard).

### Vue 3 + Vite

Read environment-based flags with Vite's `import.meta.env`, manage remotely with GrowthBook, and wrap consumption in a composable.

#### Environment variable based (simple)

```js
// config/flags.js
export const flags = {
  newCheckout: import.meta.env.VITE_FLAG_NEW_CHECKOUT === 'true',
}
```

#### Remote management (GrowthBook example)

```js
import { GrowthBook } from '@growthbook/growthbook'
const gb = new GrowthBook({ apiHost: '...', clientKey: '...' })
await gb.loadFeatures()
const enabled = gb.isOn('new-checkout')
```

#### Entry point concentration (no scattering)

```js
// ❌ Forbidden — flag branch repeated all over components (hard to remove)
if (flags.newCheckout) showA(); else showB()

// ✅ Recommended — branch only once at the route/container
const Checkout = flags.newCheckout ? NewCheckout : LegacyCheckout
```

#### composable

```js
export function useFlag(key) {
  const enabled = ref(getFlag(key))   // cache or remote
  return { enabled }
}
```
