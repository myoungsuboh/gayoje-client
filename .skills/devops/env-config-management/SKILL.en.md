---
name: Environment Configuration & Config Management
description: A standard for separating settings per environment (development/staging/production) and externalizing configuration following the 12-Factor App principles. Read this when defining environment variables, .env files, Config objects, or Feature Flags, or when handling missing-config validation. Keywords: process.env, os.environ, dotenv, .env, config, feature_flag, 12-factor.
rules:
  - "Separate code from configuration — externalize every value that varies by environment into environment variables (12-Factor App)."
  - "Separate per-environment config files (.env.development / .env.staging / .env.production), and do not include .env.production in the code repository."
  - "Validate at startup that all required environment variables exist, and exit immediately with a clear error message if any are missing."
  - "Centralize configuration into a single Config object instead of scattering direct process.env / os.environ access throughout the code."
  - "Manage Feature Flags via environment variables or a remote config service so features can be toggled on and off without a code deployment."
tags:
  - "process.env"
  - "os.environ"
  - "dotenv"
  - ".env"
  - "config"
  - "feature_flag"
  - "12-factor"
---

# ⚙️ Environment Configuration & Config Management

> Separate code from configuration to operate safely per environment. Read this when adding a new config value or defining environment separation, validation, or Feature Flags.

## 1. Core Principles
- Separate code from configuration — externalize every value that varies by environment into environment variables (12-Factor App).
- Separate per-environment config files (.env.development / .env.staging / .env.production), and do not include .env.production in the code repository.
- Validate at startup that all required environment variables exist, and exit immediately with a clear error message if any are missing.
- Centralize configuration into a single Config object instead of scattering direct process.env / os.environ access throughout the code.
- Manage Feature Flags via environment variables or a remote config service so features can be toggled on and off without a code deployment.

## 2. Rules

### 2-1. Centralizing Configuration (Python)
```python
# config.py — single entry point
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Required — exits immediately with ValidationError if absent
    database_url: str
    jwt_secret: str
    redis_url: str

    # Optional — has defaults
    debug: bool = False
    log_level: str = "INFO"
    max_connections: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache
def get_settings() -> Settings:
    return Settings()

# Usage — no direct os.environ access
settings = get_settings()
db = create_engine(settings.database_url)
```

### 2-2. Centralizing Configuration + Startup Validation (Node.js)
```typescript
// config.ts (Node.js)
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "staging", "production"]),
  PORT: z.coerce.number().default(3000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Environment variable error:", parsed.error.flatten());
  process.exit(1);
}
export const config = parsed.data;
```

### 2-3. Environment File Strategy
```
.env.example      ← committed to the repo (dummy values, serves as documentation)
.env              ← for local development (.gitignore)
.env.test         ← isolated test environment
.env.production   ← never put in the repo
```

### 2-4. Feature Flag Pattern
```python
class FeatureFlags(BaseSettings):
    ENABLE_NEW_CHECKOUT: bool = False
    ENABLE_AI_SUGGESTIONS: bool = True
    MAINTENANCE_MODE: bool = False

flags = FeatureFlags()

# Usage
if flags.ENABLE_NEW_CHECKOUT:
    return new_checkout_flow()
else:
    return legacy_checkout_flow()
```

### 2-5. Comparing Config Values per Environment
| Environment | DATABASE_URL | LOG_LEVEL | DEBUG | CORS |
|------|-------------|-----------|-------|------|
| dev | localhost | DEBUG | True | * |
| staging | staging-db | INFO | False | staging.com |
| prod | prod-db | WARNING | False | app.com |

## 3. Common Mistakes
- ❌ Committing secrets/`.env` to git → leak. Commit only `.env.example` and keep real values in `.gitignore`.
- ❌ Skipping required-variable validation at startup → it blows up much later at runtime. Validate and exit immediately at boot.
- ❌ Scattering `process.env`/`os.environ` throughout the code → centralize into a single Config object.
- ❌ Falling back to a dangerous default for a missing variable (e.g., an empty secret) → failing explicitly is safer.
- ❌ Hardcoding environment branching in code (`if env=='prod'`) → externalize the configuration.
- ❌ Keeping Feature Flags as code constants → can't toggle without a deployment. Use environment variables / remote config.

## 4. Checklist
- [ ] Have you externalized all values that vary by environment into environment variables?
- [ ] Have you excluded sensitive config such as .env.production from the repo (committing only .env.example)?
- [ ] Do you validate required environment variables at startup and exit immediately if any are missing?
- [ ] Have you centralized configuration into a single Config object (no direct process.env access)?
- [ ] Can you toggle Feature Flags without a deployment?
