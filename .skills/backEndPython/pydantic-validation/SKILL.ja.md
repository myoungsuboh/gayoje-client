---
name: Pydantic モデルと入力バリデーション
description: Pydantic v2 によるスキーマ定義、カスタムバリデータ、設定管理（BaseSettings）、ネストしたモデルのシリアライズ。FastAPI のスキーマを定義するとき、または環境変数ベースの設定を構成するときに読む。キーワード: BaseModel, Field, model_validator, field_validator, BaseSettings, model_dump, ConfigDict.
rules:
  - "リクエストスキーマ（Create/Update の DTO）とレスポンススキーマを別々に定義する — 入力と出力で同じモデルを使い回さない。"
  - "Field() でバリデーション制約（min_length, ge, le, pattern）と例を宣言し、自動生成される OpenAPI ドキュメントに反映させる。"
  - "環境変数ベースの設定は BaseSettings で管理する — .env ファイルを手動でパースしない。"
  - "フィールド間のバリデーションには model_validator(mode='after') を、単一フィールドのバリデーションには field_validator を使う。"
  - "ORM オブジェクトを Pydantic モデルに変換するときは model_config = ConfigDict(from_attributes=True) を設定する。"
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

# ✅ Pydantic モデルと入力バリデーション

> Pydantic v2 で型安全なスキーマと環境変数設定を構築する。リクエストとレスポンスのスキーマを分離すること、Field による宣言を使うことが鍵となるプラクティスである。

## 1. 基本原則

- リクエストスキーマ（Create/Update）とレスポンススキーマ（Response）を分離する — ORM のフィールドが変わっても API の契約は安定したままになる。
- Field() で制約と例を宣言し、自動的にドキュメント化する。
- BaseSettings で環境変数を型安全に管理する。

## 2. ルール

### 2-1. リクエスト / レスポンススキーマを分離する

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

### 2-2. Field の制約宣言

```python
class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, examples=["Laptop"])
    price: int = Field(ge=0, le=10_000_000, description="Price in the smallest currency unit")
    category: str = Field(pattern=r'^[a-z-]+$')
    tags: list[str] = Field(default_factory=list, max_length=10)
```

### 2-3. カスタムバリデータ

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

### 2-4. 環境変数のための BaseSettings

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

## 3. よくある間違い

- `model.dict()` は Pydantic v2 では非推奨 — `model.model_dump()` を使う。
- `from_attributes=True` を設定せずに ORM オブジェクトを直接 Pydantic モデルへ代入すると ValidationError が発生する。
- `Optional[str]` の代わりに `str | None` を使う（Pydantic v2 の推奨）。

## 4. チェックリスト

- [ ] リクエストとレスポンスのスキーマを別々に定義しているか？
- [ ] バリデーション制約を Field() で宣言しているか？
- [ ] 環境変数を BaseSettings で管理しているか？
- [ ] ORM オブジェクト変換のために ConfigDict(from_attributes=True) を設定しているか？
- [ ] model.dict() ではなく model.model_dump() を使っているか？
