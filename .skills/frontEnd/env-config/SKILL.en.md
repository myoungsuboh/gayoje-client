---
name: Environment Variables (Env Config)
description: A universal standard for environment variables covering .env precedence, per-environment separation, separating secrets from public config, controlling client exposure scope, and templates/validation; independent of build tool/framework. Read this when adding or organizing environment variables, separating per-environment config, or preventing secret exposure.
rules:
  - "Separate config from code: externalize values that differ per environment (API addresses, feature flags, keys) into environment variables instead of hardcoding them in code. Make the same build/image reusable just by changing the environment."
  - "Separate per environment: keep a separate config file/source per environment such as dev, staging, prod, and explicitly select which environment at build/run time. Manually swapping one file right before build is forbidden."
  - "Make precedence clear: when multiple .env files overlap, define a rule for what overrides what. Generally the more specific/local takes precedence (e.g. *.local > per-env > common)."
  - "Separate secrets from public config: do not mix secrets (API key, DB credentials, token signing key, etc.) with config that can be public (public API address, app version) through the same channel. Manage secrets via a separate channel/secret manager."
  - "Control the client exposure scope: assume that variables bundled into the frontend can be extracted by anyone. Limit values that go to the client to only explicitly marked (prefix, allowlist, etc.) public values, and use the rest only at build/server time."
  - "Calls that need secrets go on the server: if the design requires the client to hold a secret directly, the design is wrong. Proxy external calls that need secrets through the backend/BFF."
  - "Do not commit local overrides: do not push files mixing personal local values (*.local, etc.) and secrets to VCS. Instead, commit a template (.env.example) that tells what needs to be filled in."
  - "Validate presence/format: make a missing required variable or a format error surface quickly at boot time, not deep inside runtime (type definitions, schema validation, startup checks)."
tags:
  - "import.meta.env"
  - "VITE_"
  - "process.env"
  - ".env"
  - "envConfig"
---

# ⚙️ Environment Variables (Env Config)

> Separate config that differs per environment (dev/staging/prod) from code, strictly separate secrets from public config, and control the exposure scope of values that go to the client. Read this when defining, loading, branching, and securing environment variables. It is a universal standard not tied to any specific build tool/framework.

## 1. Core Principles
- **Separate config from code**: externalize values that differ per environment (API addresses, feature flags, keys) into environment variables instead of hardcoding them in code. Make the same build/image reusable just by changing the environment.
- **Separate per environment**: keep a separate config file/source per environment such as dev, staging, prod, and explicitly select which environment at build/run time. Manually swapping one file right before build is forbidden.
- **Make precedence clear**: when multiple `.env` files overlap, define a rule for what overrides what. Generally the more specific/local takes precedence (e.g. `*.local` > per-env > common).
- **Separate secrets from public config**: do not mix secrets (API key, DB credentials, token signing key, etc.) with config that can be public (public API address, app version) through the same channel. Manage secrets via a separate channel/secret manager.
- **Control the client exposure scope**: assume that variables bundled into the frontend **can be extracted by anyone**. Limit values that go to the client to only explicitly marked (prefix, allowlist, etc.) public values, and use the rest only at build/server time.
- **Calls that need secrets go on the server**: if the design requires the client to hold a secret directly, the design is wrong. Proxy external calls that need secrets through the backend/BFF.
- **Do not commit local overrides**: do not push files mixing personal local values (`*.local`, etc.) and secrets to VCS. Instead, commit a template (`.env.example`) that tells what needs to be filled in.
- **Validate presence/format**: make a missing required variable or a format error surface quickly at boot time, not deep inside runtime (type definitions, schema validation, startup checks).

## 2. Rules

### 2-1. Separate config from code and split per environment
- Externalize values that differ per environment into environment variables instead of embedding them in source.
- Keep a separate source per environment (dev/staging/prod) and explicitly select the environment at build/run time.

```text
// ❌ Forbidden — hardcoding env values in code / manually swapping one file right before build
const API = "https://prod-api.example.com"   // code change every time the env changes
keeping only one .env and hand-swapping values right before deploy

// ✅ Recommended — per-environment config + explicit environment selection
.env.development / .env.staging / .env.production
build --env=staging   // select which environment at build/run time
```

### 2-2. Define file precedence
- Have the team agree on and document the precedence when multiple config files overlap.
- General principle: **a more specific and more local value overrides a more general value.**

```text
// Precedence (high → low) example
per-env-local(.env.[env].local) > per-env(.env.[env]) > common-local(.env.local) > common(.env)
```

| Category | Scope | VCS commit |
|---|---|---|
| Common | Default for all environments | O (when no secret) |
| Common-local | All environments, personal local override | **X** |
| Per-env | A specific environment (dev/staging/prod) | O (when no secret) |
| Per-env-local | A specific environment + personal local | **X** |

### 2-3. Separate secrets from public config
- Do not mix config that can be public with secrets through the same channel.
- Prefer injecting secrets via a secret manager/deploy pipeline over keeping them in plaintext in environment variable files.

```text
// ❌ Forbidden — mixing public config and secrets in one file in plaintext
PUBLIC_API_URL=https://api.example.com
DB_PASSWORD=super-secret        // same file, same channel

// ✅ Recommended — only public config in the env file, secrets via a separate channel
PUBLIC_API_URL=https://api.example.com
# secrets like DB_PASSWORD are separated via secret manager/CI injection
```

> For the storage, rotation, and access control of the secrets themselves, also refer to the `secrets-management` skill.

### 2-4. Control the client exposure scope
- Assume values included in the frontend bundle **are public** (extractable from the bundle).
- Explicitly distinguish variables to be exported to the client (prefix, allowlist, etc.), and block other variables from being accessible on the client.

```text
// ❌ Forbidden — putting a secret in a client-exposed variable (embedded as-is in the bundle)
CLIENT_OPENAI_API_KEY=sk-xxx     // anyone can extract it from the dist bundle

// ✅ Recommended — only public values on the client, secrets server-only
CLIENT_API_URL=https://api.example.com   // public OK
OPENAI_API_KEY=sk-xxx                     // only in the server environment, does not go to the client
```

### 2-5. Proxy calls that need secrets through the backend/BFF
- Do not build a structure where the client directly holds a secret and calls an external API.
- Calls that need secrets are performed by the server (backend/BFF) instead, and the client calls only its own server.

```text
// ❌ Forbidden — the browser calls an external API directly with a secret
browser ──(API key)──▶ external payment/AI API

// ✅ Recommended — the server holds the secret and proxies
browser ──▶ our server (BFF) ──(secret)──▶ external API
```

### 2-6. Do not commit local overrides/secrets; commit a template
- Exclude files mixing personal local values (`*.local`, etc.) and secrets via `.gitignore`.
- Commit a template with empty values (`.env.example`) so a newcomer knows what to fill in.

```text
// .gitignore (concept)
*.local            // exclude personal local overrides
.env               // if secrets are mixed in, exclude the common file too and commit only the example

// .env.example (commit template — keys only, values empty)
PUBLIC_API_URL=
PUBLIC_APP_VERSION=
```

### 2-7. Validate required variable presence/format at boot time
- So that a missing required variable or format error does not blow up deep inside runtime, make it fail fast at startup.
- Have type definitions/schema validation so that which variable is needed in what format is visible in one place.

```text
// ❌ Forbidden — discovering a missing variable as undefined much later at runtime
fetch(config.apiUrl + "/x")   // apiUrl not set → calls "undefined/x"

// ✅ Recommended — validate required variables at boot, fail immediately if missing
assert env.PUBLIC_API_URL is set and is URL   // fail-fast at the startup stage
```

## 3. Common Mistakes
- **Putting a secret in a client-exposed variable** → extracted from the bundle and leaked. Keep secrets server-only; exposed variables should be public values only.
- **Committing local/secret files** → secret leak/environment contamination. Ignore `*.local` and files mixing secrets.
- **Not maintaining `.env.example`** → a newcomer does not know what to fill in. Commit a template containing keys only.
- **Manually swapping one file with no environment distinction** → human error every deploy. Separate per environment and select the environment explicitly.
- **Branch failure due to a typo in the environment name** (`producton`) → the intended environment config does not take effect. Bundle it into a constant/type.
- **Accessing a variable without knowing the exposure rule (prefix, allowlist)** → wasting time debugging `undefined` on the client. Check the exposure rule first.
- **Confusing per-build-tool access methods** → reading via a method other than the access channel the build tool defined, always getting `undefined`. Check the stack's rule.
- **Skipping required-variable validation** → a missing one blows up deep inside runtime. Validate at boot time.

## 4. Checklist
- [ ] Did you separate values that differ per environment from code and externalize them into environment variables?
- [ ] Do you separate config per environment (dev/staging/prod) and **select the environment explicitly** (no manual swapping)?
- [ ] Have you defined the **precedence** of overlapping config files?
- [ ] Did you separate secrets from public config into **different channels** (secrets via secret manager/injection)?
- [ ] Did you limit variables going into the client bundle to **public values only** (exposure scope control)?
- [ ] Did you proxy calls that need secrets through the backend/BFF (so the client does not hold a secret directly)?
- [ ] Did you put local override/secret files into `.gitignore` and commit a **`.env.example` template**?
- [ ] Do you validate the presence/format of required variables **at boot time** (type definitions/schema)?

## Appendix: Per-Stack Examples

> Below are reference implementation examples. Add examples matching the stack your team uses (e.g. Next.js, Webpack/CRA, Node server, Vite, etc.) following the same pattern. The principles/rules of 1–4 above are the standard; the appendix is merely an application of them.

### Vite (Vue)

> This carries **only the stack-specific concrete values (file names, prefixes, commands, APIs)** for implementing the principles/rules of 1–4 in the main text with Vite. For the "why" of precedence, secret separation, exposure control, etc., see the main text.

#### File precedence (the Vite concrete values of main text 2-2)

A later file **overrides** an earlier one. Precedence (high → low): `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

| File | Load timing | git commit |
|---|---|---|
| `.env` | All modes | O |
| `.env.local` | All modes (local override) | **X** |
| `.env.[mode]` | The given mode (`development`/`production`/`staging`) | O |
| `.env.[mode].local` | The given mode + local | **X** |

#### `VITE_` prefix = client exposure channel (the Vite concrete values of main text 2-4)

Variables exposed to the client (`import.meta.env`) must start with `VITE_`, and other variables are used only at build time.

```dotenv
# .env
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0

# Not exposed (accessible only in a Vite plugin)
SENTRY_AUTH_TOKEN=xxx
```

#### Mode switching

```bash
vite                              # development mode (loads .env.development)
vite --mode staging               # staging mode (loads .env.staging)
vite build                        # production mode (loads .env.production)
vite build --mode staging         # staging build
```

`package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build:staging": "vite build --mode staging",
    "build": "vite build"
  }
}
```

#### Per-environment API URL matrix

| File | VITE_API_URL | VITE_SENTRY_DSN |
|---|---|---|
| `.env.development` | http://localhost:8080/api | (empty) |
| `.env.staging` | https://staging-api.example.com | staging DSN |
| `.env.production` | https://api.example.com | prod DSN |

#### Usage (`import.meta.env`)

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000
})
export default api
```

Built-in variables: `import.meta.env.MODE` (current mode), `.DEV`/`.PROD` (boolean), `.BASE_URL` (app base URL). Branch on mode with `import.meta.env.DEV`/`.PROD`.

#### Type definitions (main text 2-7 — the Vite way of boot validation)

```typescript
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### Secret separation (main text 2-4·2-5 — `VITE_` is embedded as-is in the build output)

```dotenv
# BAD - extractable from the client bundle
VITE_OPENAI_API_KEY=sk-xxx

# GOOD - only in the server .env, proxy secret calls from the BFF
OPENAI_API_KEY=sk-xxx
```

For details, see the `security-frontend` skill.

#### `.gitignore` (the Vite concrete values of main text 2-6)

```gitignore
.env.local
.env.*.local
```
Commit `.env`/`.env.[mode]` only when there is no secret; if secrets are mixed in, ignore those too and commit only `.env.example`.

```dotenv
# .env.example (commit template — keys only, values empty)
VITE_API_URL=
VITE_APP_VERSION=
VITE_SENTRY_DSN=
```

#### Vite-specific common mistakes

- Exposing a secret key to the client as `VITE_API_SECRET=xxx`.
- Committing `.env.local` to git.
- Using `process.env.VITE_API_URL` (Vite works only with `import.meta.env`).
- Branching on `import.meta.env.MODE` while typo-ing the mode name (`producton`).
- Wasting time debugging `undefined` after accessing a variable without the `VITE_` prefix via `import.meta.env`.
