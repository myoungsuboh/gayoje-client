---
name: 环境设置 & 配置管理
description: 按开发・预发布・生产环境分离设置，并依据 12-Factor App 原则将配置外部化的标准。在确定环境变量・.env 文件・Config 对象・Feature Flag，或处理配置缺失校验时阅读。关键词: process.env, os.environ, dotenv, .env, config, feature_flag, 12-factor.
rules:
  - "将代码与配置分离 — 所有随环境变化的值都外部化为环境变量 (12-Factor App)。"
  - "分离各环境的配置文件(.env.development・.env.staging・.env.production)，且不将 .env.production 纳入代码仓库。"
  - "启动时校验所有必需的环境变量是否齐全，缺失时附带清晰的错误信息并立即退出。"
  - "将配置值集中到单一的 Config 对象，避免在代码各处分散直接访问 process.env / os.environ。"
  - "通过环境变量或远程配置服务管理 Feature Flag，使功能无需代码部署即可开关。"
tags:
  - "process.env"
  - "os.environ"
  - "dotenv"
  - ".env"
  - "config"
  - "feature_flag"
  - "12-factor"
---

# ⚙️ 环境设置 & 配置管理

> 将代码与配置分离，按环境安全运营。在添加新配置值，或确定环境分离・校验・Feature Flag 时阅读。

## 1. 核心原则
- 将代码与配置分离 — 所有随环境变化的值都外部化为环境变量 (12-Factor App)。
- 分离各环境的配置文件(.env.development・.env.staging・.env.production)，且不将 .env.production 纳入代码仓库。
- 启动时校验所有必需的环境变量是否齐全，缺失时附带清晰的错误信息并立即退出。
- 将配置值集中到单一的 Config 对象，避免在代码各处分散直接访问 process.env / os.environ。
- 通过环境变量或远程配置服务管理 Feature Flag，使功能无需代码部署即可开关。

## 2. 规则

### 2-1. 配置集中化 (Python)
```python
# config.py — 单一入口
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 必需 — 缺失则以 ValidationError 立即退出
    database_url: str
    jwt_secret: str
    redis_url: str

    # 可选 — 存在默认值
    debug: bool = False
    log_level: str = "INFO"
    max_connections: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache
def get_settings() -> Settings:
    return Settings()

# 使用 — 禁止直接访问 os.environ
settings = get_settings()
db = create_engine(settings.database_url)
```

### 2-2. 配置集中化 + 启动校验 (Node.js)
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
  console.error("环境变量错误:", parsed.error.flatten());
  process.exit(1);
}
export const config = parsed.data;
```

### 2-3. 环境文件策略
```
.env.example      ← 提交到仓库 (占位值，充当文档)
.env              ← 本地开发用 (.gitignore)
.env.test         ← 测试隔离环境
.env.production   ← 绝不放入仓库
```

### 2-4. Feature Flag 模式
```python
class FeatureFlags(BaseSettings):
    ENABLE_NEW_CHECKOUT: bool = False
    ENABLE_AI_SUGGESTIONS: bool = True
    MAINTENANCE_MODE: bool = False

flags = FeatureFlags()

# 使用
if flags.ENABLE_NEW_CHECKOUT:
    return new_checkout_flow()
else:
    return legacy_checkout_flow()
```

### 2-5. 各环境配置值对比
| 环境 | DATABASE_URL | LOG_LEVEL | DEBUG | CORS |
|------|-------------|-----------|-------|------|
| dev | localhost | DEBUG | True | * |
| staging | staging-db | INFO | False | staging.com |
| prod | prod-db | WARNING | False | app.com |

## 3. 常见错误
- ❌ 将密钥/`.env` 提交到 git → 泄露。只提交 `.env.example`，真实值放入 `.gitignore`。
- ❌ 启动时遗漏必需变量校验 → 运行很久后才崩溃。启动时即刻校验并退出。
- ❌ 将 `process.env`/`os.environ` 散布在代码各处 → 集中到单一的 Config 对象。
- ❌ 为缺失变量回退到危险的默认值(例如空 secret) → 显式失败更安全。
- ❌ 在代码中硬编码环境分支(`if env=='prod'`) → 将配置外部化。
- ❌ 将 Feature Flag 作为代码常量 → 无法在不部署的情况下切换。用环境变量/远程配置。

## 4. 检查清单
- [ ] 是否已将所有随环境变化的值都外部化为环境变量
- [ ] 是否已将 .env.production 等敏感配置排除在仓库之外 (只提交 .env.example)
- [ ] 启动时是否校验必需的环境变量，并在缺失时立即退出
- [ ] 是否已将配置集中到单一的 Config 对象 (禁止直接访问 process.env)
- [ ] 是否可以在不部署的情况下切换 Feature Flag
