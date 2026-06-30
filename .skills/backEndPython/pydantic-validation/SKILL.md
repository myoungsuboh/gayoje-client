---
name: Pydantic Models & Input Validation
description: Schema definition with Pydantic v2, custom validators, settings management (BaseSettings), and nested model serialization. Read when defining FastAPI schemas or configuring environment-variable-based settings. Keywords: BaseModel, Field, model_validator, field_validator, BaseSettings, model_dump, ConfigDict.
rules:
  - "Define request schemas (Create/Update DTOs) and response schemas separately — never reuse the same model for both input and output."
  - "Declare validation constraints (min_length, ge, le, pattern) and examples with Field() to reflect them in the auto-generated OpenAPI docs."
  - "Manage environment-variable-based settings with BaseSettings — do not parse .env files manually."
  - "Use model_validator(mode='after') for cross-field validation and field_validator for single-field validation."
  - "Set model_config = ConfigDict(from_attributes=True) when converting ORM objects to Pydantic models."
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

# ✅ Pydantic Models & Input Validation

> Build type-safe schemas and environment variable settings with Pydantic v2. Separating request and response schemas and using Field declarations are the key practices.

## 1. Core Principles

- Separate request schemas (Create/Update) from response schemas (Response) — the API contract stays stable even when ORM fields change.
- Declare constraints and examples with Field() for automatic documentation.
- Manage environment variables in a type-safe way with BaseSettings.

## 2. Rules

### 2-1. Separate Request / Response Schemas

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

### 2-2. Field Constraint Declarations

```python
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, examples=["Laptop"])
    price: int = Field(ge=0, le=10_000_000, description="Price in the smallest currency unit")
    category: str = Field(pattern=r'^[a-z-]+$')
    tags: list[str] = Field(default_factory=list, max_length=10)
```

### 2-3. Custom Validators

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

### 2-4. BaseSettings for Environment Variables

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

## 3. Common Mistakes

- `model.dict()` is deprecated in Pydantic v2 — use `model.model_dump()`.
- Assigning an ORM object directly to a Pydantic model without `from_attributes=True` raises a ValidationError.
- Use `str | None` instead of `Optional[str]` (Pydantic v2 recommendation).

## 4. Checklist

- [ ] Are request and response schemas defined separately?
- [ ] Are validation constraints declared with Field()?
- [ ] Are environment variables managed with BaseSettings?
- [ ] Is ConfigDict(from_attributes=True) set for ORM object conversion?
- [ ] Is model.model_dump() used instead of model.dict()?
