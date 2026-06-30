---
name: 環境設定 & 構成管理
description: 開発・ステージング・本番の環境別設定を分離し、12-Factor App の原則で設定を外部化する標準。環境変数・.env ファイル・Config オブジェクト・Feature Flag を定める、または設定の欠落検証を扱うときに読む。キーワード: process.env, os.environ, dotenv, .env, config, feature_flag, 12-factor.
rules:
  - "コードと設定を分離する — 環境によって変わるすべての値は環境変数として外部化する (12-Factor App)。"
  - "環境別の設定ファイル(.env.development・.env.staging・.env.production)を分離し、.env.production はコードリポジトリに含めない。"
  - "起動時に必須の環境変数がすべて存在するか検証し、欠落していれば明確なエラーメッセージとともに直ちに終了する。"
  - "設定値は単一の Config オブジェクトに集約し、直接の process.env / os.environ アクセスをコード全体に分散させない。"
  - "Feature Flag はコードのデプロイなしで機能をオン・オフできるよう、環境変数またはリモート設定サービスで管理する。"
tags:
  - "process.env"
  - "os.environ"
  - "dotenv"
  - ".env"
  - "config"
  - "feature_flag"
  - "12-factor"
---

# ⚙️ 環境設定 & 構成管理

> コードと設定を分離し、環境ごとに安全に運用する。新しい設定値を追加する、または環境分離・検証・Feature Flag を定めるときに読む。

## 1. 核心原則
- コードと設定を分離する — 環境によって変わるすべての値は環境変数として外部化する (12-Factor App)。
- 環境別の設定ファイル(.env.development・.env.staging・.env.production)を分離し、.env.production はコードリポジトリに含めない。
- 起動時に必須の環境変数がすべて存在するか検証し、欠落していれば明確なエラーメッセージとともに直ちに終了する。
- 設定値は単一の Config オブジェクトに集約し、直接の process.env / os.environ アクセスをコード全体に分散させない。
- Feature Flag はコードのデプロイなしで機能をオン・オフできるよう、環境変数またはリモート設定サービスで管理する。

## 2. ルール

### 2-1. 設定の集約 (Python)
```python
# config.py — 単一のエントリポイント
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 必須 — なければ ValidationError で直ちに終了
    database_url: str
    jwt_secret: str
    redis_url: str

    # 任意 — デフォルト値あり
    debug: bool = False
    log_level: str = "INFO"
    max_connections: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache
def get_settings() -> Settings:
    return Settings()

# 使用 — os.environ への直接アクセス禁止
settings = get_settings()
db = create_engine(settings.database_url)
```

### 2-2. 設定の集約 + 起動時検証 (Node.js)
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
  console.error("環境変数エラー:", parsed.error.flatten());
  process.exit(1);
}
export const config = parsed.data;
```

### 2-3. 環境ファイル戦略
```
.env.example      ← レポにコミット (ダミー値、ドキュメントの役割)
.env              ← ローカル開発用 (.gitignore)
.env.test         ← テスト隔離環境
.env.production   ← 絶対にレポに入れない
```

### 2-4. Feature Flag パターン
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

### 2-5. 環境別の設定値比較
| 環境 | DATABASE_URL | LOG_LEVEL | DEBUG | CORS |
|------|-------------|-----------|-------|------|
| dev | localhost | DEBUG | True | * |
| staging | staging-db | INFO | False | staging.com |
| prod | prod-db | WARNING | False | app.com |

## 3. よくある間違い
- ❌ シークレット/`.env` を git にコミット → 漏洩。`.env.example` のみコミットし、実値は `.gitignore`。
- ❌ 起動時の必須変数検証を省略 → ランタイムのずっと後に破綻する。起動時に即検証・終了。
- ❌ `process.env`/`os.environ` をコード全体に散在 → 単一の Config オブジェクトに集約。
- ❌ 欠落変数に危険なデフォルトでフォールバック(例: 空の secret) → 明示的に失敗する方が安全。
- ❌ 環境分岐をコードにハードコード(`if env=='prod'`) → 設定を外部化する。
- ❌ Feature Flag をコード定数として置く → デプロイなしでトグル不可。環境変数/リモート設定で。

## 4. チェックリスト
- [ ] 環境によって変わる値をすべて環境変数として外部化したか
- [ ] .env.production などの機密設定をレポから除外したか (.env.example のみコミット)
- [ ] 起動時に必須の環境変数を検証し、欠落時に直ちに終了するか
- [ ] 設定を単一の Config オブジェクトに集約したか (process.env への直接アクセス禁止)
- [ ] Feature Flag をデプロイなしでトグルできるか
