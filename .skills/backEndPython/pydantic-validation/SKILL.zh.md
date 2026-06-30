---
name: Pydantic 模型与输入校验
description: 使用 Pydantic v2 进行模式定义、自定义校验器、设置管理（BaseSettings）以及嵌套模型序列化。在定义 FastAPI 模式或配置基于环境变量的设置时阅读。关键词: BaseModel, Field, model_validator, field_validator, BaseSettings, model_dump, ConfigDict.
rules:
  - "分别定义请求模式（Create/Update DTO）和响应模式 —— 切勿在输入和输出中复用同一个模型。"
  - "用 Field() 声明校验约束（min_length, ge, le, pattern）和示例，使其反映在自动生成的 OpenAPI 文档中。"
  - "用 BaseSettings 管理基于环境变量的设置 —— 不要手动解析 .env 文件。"
  - "跨字段校验使用 model_validator(mode='after')，单字段校验使用 field_validator。"
  - "将 ORM 对象转换为 Pydantic 模型时设置 model_config = ConfigDict(from_attributes=True)。"
tags:
  - "BaseModel"
  - "Field"
  - "model_validator"
  - "field_validator"
  - "BaseSettings"
  - "model_dump"
  - "ConfigDict"
  - "Pydantic"
---

# ✅ Pydantic 模型与输入校验

> 用 Pydantic v2 构建类型安全的模式和环境变量设置。分离请求模式与响应模式、使用 Field 声明是关键实践。

## 1. 核心原则

- 将请求模式（Create/Update）与响应模式（Response）分离 —— 即使 ORM 字段发生变化，API 契约仍保持稳定。
- 用 Field() 声明约束和示例以自动生成文档。
- 用 BaseSettings 以类型安全的方式管理环境变量。

## 2. 规则

### 2-1. 分离请求 / 响应模式

```python
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# Request schema (input)
class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, examples=["SecurePass123!"])

# Update schema (all fields Optional)
class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)

# Response schema (output) — password excluded
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # Allow ORM object conversion

    id: str
    email: EmailStr
    name: str
    created_at: datetime
```

### 2-2. Field 约束声明

```python
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, examples=["Laptop"])
    price: int = Field(ge=0, le=10_000_000, description="Price in the smallest currency unit")
    category: str = Field(pattern=r'^[a-z-]+$')
    tags: list[str] = Field(default_factory=list, max_length=10)
```

### 2-3. 自定义校验器

```python
from pydantic import model_validator, field_validator

class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode='after')
    def validate_date_order(self) -> 'DateRange':
        if self.end_date < self.start_date:
            raise ValueError('end_date must be >= start_date')
        return self

class UserCreate(BaseModel):
    email: EmailStr

    @field_validator('email')
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()
```

### 2-4. 用于环境变量的 BaseSettings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # v2 idiom: model_config = SettingsConfigDict(...) instead of the v1 inner `class Config`
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    SECRET_KEY: str
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    DEBUG: bool = False

settings = Settings()  # Raises ValidationError on startup if env vars are missing
```

## 3. 常见错误

- `model.dict()` 在 Pydantic v2 中已弃用 —— 应使用 `model.model_dump()`。
- 未设置 `from_attributes=True` 就将 ORM 对象直接赋值给 Pydantic 模型会引发 ValidationError。
- 使用 `str | None` 而非 `Optional[str]`（Pydantic v2 推荐）。

## 4. 检查清单

- [ ] 是否分别定义了请求模式和响应模式？
- [ ] 是否用 Field() 声明了校验约束？
- [ ] 是否用 BaseSettings 管理环境变量？
- [ ] 是否为 ORM 对象转换设置了 ConfigDict(from_attributes=True)？
- [ ] 是否使用 model.model_dump() 而非 model.dict()？
