---
name: FastAPI プロジェクト構成 & ルーター
description: FastAPI アプリケーションのプロジェクト構成 — ルーターの分離、依存性注入（Depends）、レスポンスモデル、lifespan イベント、ミドルウェア設定。FastAPI プロジェクトを始めるとき、または新しいドメインルーターを追加するときに読む。キーワード: FastAPI, APIRouter, Depends, Response, lifespan, middleware, CORS, HTTPException.
rules:
  - "APIRouter はドメインごとに分離し、main.py は app インスタンスとルーターの include のみを持つ薄いエントリーポイントに保つ。"
  - "共通の依存（DB セッション、現在のユーザー）は Depends() で注入する — ルート関数内で直接生成しない。"
  - "各ルートに response_model を宣言して自動シリアライズとドキュメント化を有効にし、内部フィールド（例: password）の漏洩を防ぐ。"
  - "DB 接続や外部クライアントの初期化は lifespan コンテキストマネージャで管理する。"
  - "HTTPException は detail フィールドに十分な情報を入れて使う — 空の 500 エラーをクライアントへ晒さない。"
tags:
  - "FastAPI"
  - "APIRouter"
  - "Depends"
  - "Response"
  - "lifespan"
  - "middleware"
  - "CORS"
  - "HTTPException"
---

# 🚀 FastAPI プロジェクト構成 & ルーター

> FastAPI のルーター分離、依存性注入、レスポンスモデルを用いて保守性の高い API を構築する。

## 1. 中核原則

- 機能ベースの APIRouter 分離 — main.py は薄いエントリーポイント。
- DB セッションと認証を Depends() で一貫して注入する。
- response_model を宣言してレスポンススキーマを明示し、機密フィールドの露出を防ぐ。

## 2. ルール

### 2-1. プロジェクト構成

```
app/
  main.py           # FastAPI instance, router registration, lifespan
  api/
    users.py        # APIRouter — users domain
    auth.py         # APIRouter — authentication
  models/
    user.py         # SQLAlchemy ORM models
  schemas/
    user.py         # Pydantic request/response schemas
  dependencies.py   # Shared Depends (DB session, current user)
  database.py       # DB engine, session factory
```

### 2-2. main.py — ルーターの include + Lifespan

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import users, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await database.connect()
    yield
    # Shutdown
    await database.disconnect()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
```

### 2-3. APIRouter + Depends + response_model

```python
# api/users.py
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.user import UserResponse, UserCreate
from app.dependencies import get_db, get_current_user

router = APIRouter()

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),          # Inject DB session
    current_user = Depends(get_current_user),     # Inject auth
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {user_id} not found")
    return user  # response_model automatically excludes sensitive fields like password
```

### 2-4. 共通の Depends

```python
# dependencies.py
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
```

## 3. よくある間違い

- `app = FastAPI(on_startup=[...])` ではなく `lifespan` を使う — on_startup/on_shutdown は非推奨。
- response_model なしで ORM モデルを直接返すと password や内部フィールドが露出しうる。
- 依存をインポートして単一インスタンスとして使うと全リクエストで共有される — 依存は常に関数として定義する。

## 4. チェックリスト

- [ ] APIRouter はドメインごとに分離され、main.py で include_router 登録されているか？
- [ ] DB セッションは Depends() で注入されているか？
- [ ] response_model を宣言してレスポンスから機密フィールドを除外しているか？
- [ ] DB 接続は lifespan コンテキストマネージャで管理されているか？
