---
name: 환경 설정 & 구성 관리
description: 개발·스테이징·프로덕션 환경별 설정을 분리하고 12-Factor App 원칙으로 설정을 외부화하는 표준. 환경 변수·.env 파일·Config 객체·Feature Flag 를 정하거나 설정 누락 검증을 다룰 때 읽는다. 키워드: process.env, os.environ, dotenv, .env, config, feature_flag, 12-factor.
rules:
  - "코드와 설정을 분리한다 — 환경에 따라 달라지는 모든 값은 환경 변수로 외부화한다 (12-Factor App)."
  - "환경별 설정 파일(.env.development·.env.staging·.env.production)을 분리하고, .env.production은 코드 저장소에 포함하지 않는다."
  - "시작 시 필수 환경 변수가 모두 존재하는지 검증하고, 누락 시 명확한 오류 메시지와 함께 즉시 종료한다."
  - "설정값은 단일 Config 객체로 중앙화해 직접 process.env / os.environ 접근을 코드 전반에 분산시키지 않는다."
  - "Feature Flag는 코드 배포 없이 기능을 켜고 끌 수 있도록 환경 변수 또는 원격 설정 서비스로 관리한다."
tags:
  - "process.env"
  - "os.environ"
  - "dotenv"
  - ".env"
  - "config"
  - "feature_flag"
  - "12-factor"
---

# ⚙️ 환경 설정 & 구성 관리

> 코드와 설정을 분리해 환경별로 안전하게 운영한다. 새 설정값을 추가하거나 환경 분리·검증·Feature Flag 를 정할 때 읽는다.

## 1. 핵심 원칙
- 코드와 설정을 분리한다 — 환경에 따라 달라지는 모든 값은 환경 변수로 외부화한다 (12-Factor App).
- 환경별 설정 파일(.env.development·.env.staging·.env.production)을 분리하고, .env.production은 코드 저장소에 포함하지 않는다.
- 시작 시 필수 환경 변수가 모두 존재하는지 검증하고, 누락 시 명확한 오류 메시지와 함께 즉시 종료한다.
- 설정값은 단일 Config 객체로 중앙화해 직접 process.env / os.environ 접근을 코드 전반에 분산시키지 않는다.
- Feature Flag는 코드 배포 없이 기능을 켜고 끌 수 있도록 환경 변수 또는 원격 설정 서비스로 관리한다.

## 2. 규칙

### 2-1. 설정 중앙화 (Python)
```python
# config.py — 단일 진입점
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # 필수 — 없으면 ValidationError로 즉시 종료
    database_url: str
    jwt_secret: str
    redis_url: str

    # 선택 — 기본값 존재
    debug: bool = False
    log_level: str = "INFO"
    max_connections: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache
def get_settings() -> Settings:
    return Settings()

# 사용 — os.environ 직접 접근 금지
settings = get_settings()
db = create_engine(settings.database_url)
```

### 2-2. 설정 중앙화 + 시작 검증 (Node.js)
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
  console.error("환경 변수 오류:", parsed.error.flatten());
  process.exit(1);
}
export const config = parsed.data;
```

### 2-3. 환경 파일 전략
```
.env.example      ← 레포에 커밋 (더미값, 문서 역할)
.env              ← 로컬 개발용 (.gitignore)
.env.test         ← 테스트 격리 환경
.env.production   ← 절대 레포에 넣지 않음
```

### 2-4. Feature Flag 패턴
```python
class FeatureFlags(BaseSettings):
    ENABLE_NEW_CHECKOUT: bool = False
    ENABLE_AI_SUGGESTIONS: bool = True
    MAINTENANCE_MODE: bool = False

flags = FeatureFlags()

# 사용
if flags.ENABLE_NEW_CHECKOUT:
    return new_checkout_flow()
else:
    return legacy_checkout_flow()
```

### 2-5. 환경별 설정값 비교
| 환경 | DATABASE_URL | LOG_LEVEL | DEBUG | CORS |
|------|-------------|-----------|-------|------|
| dev | localhost | DEBUG | True | * |
| staging | staging-db | INFO | False | staging.com |
| prod | prod-db | WARNING | False | app.com |

## 3. 흔한 실수
- ❌ 시크릿/`.env`를 git에 커밋 → 유출. `.env.example`만 커밋하고 실값은 `.gitignore`.
- ❌ 시작 시 필수 변수 검증 누락 → 런타임 한참 뒤 터진다. 부팅 시 즉시 검증·종료.
- ❌ `process.env`/`os.environ`을 코드 전반에 산재 → 단일 Config 객체로 중앙화.
- ❌ 누락 변수에 위험한 기본값 폴백(예: 빈 secret) → 명시적 실패가 더 안전하다.
- ❌ 환경 분기를 코드에 하드코딩(`if env=='prod'`) → 설정을 외부화한다.
- ❌ Feature Flag를 코드 상수로 둠 → 배포 없이 토글 불가. 환경변수/원격 설정으로.

## 4. 체크리스트
- [ ] 환경에 따라 달라지는 값을 모두 환경 변수로 외부화했는가
- [ ] .env.production 등 민감 설정을 레포에서 제외했는가 (.env.example만 커밋)
- [ ] 시작 시 필수 환경 변수를 검증하고, 누락 시 즉시 종료하는가
- [ ] 설정을 단일 Config 객체로 중앙화했는가 (process.env 직접 접근 금지)
- [ ] Feature Flag 를 배포 없이 토글할 수 있는가
