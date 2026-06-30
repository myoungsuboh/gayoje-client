---
name: FastAPI 项目结构 & 路由器
description: FastAPI 应用的项目结构 — 路由器拆分、依赖注入（Depends）、响应模型、lifespan 事件以及中间件配置。在启动 FastAPI 项目或新增领域路由器时阅读。关键词: FastAPI, APIRouter, Depends, Response, lifespan, middleware, CORS, HTTPException.
rules:
  - "按领域拆分 APIRouter，并让 main.py 保持为只持有 app 实例和路由器 include 的薄入口。"
  - "用 Depends() 注入通用依赖（DB 会话、当前用户）— 不要在路由函数内部直接创建它们。"
  - "在每个路由上声明 response_model，以启用自动序列化与文档化，并防止内部字段（如 password）泄露。"
  - "在 lifespan 上下文管理器中管理 DB 连接和外部客户端的初始化。"
  - "使用 HTTPException 时在 detail 字段中提供充分信息 — 不要向客户端暴露空的 500 错误。"
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

# 🚀 FastAPI 项目结构 & 路由器

> 利用 FastAPI 的路由器拆分、依赖注入与响应模型构建可维护的 API。

## 1. 核心原则

- 基于功能的 APIRouter 拆分 — main.py 是薄入口。
- 用 Depends() 一致地注入 DB 会话与认证。
- 声明 response_model 以明确响应模式并防止敏感字段暴露。

## 2. 规则

### 2-1. 项目结构

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

### 2-2. main.py — 路由器 include + Lifespan

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

### 2-4. 共享 Depends

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

## 3. 常见错误

- 使用 `lifespan` 而非 `app = FastAPI(on_startup=[...])` — on_startup/on_shutdown 已弃用。
- 不带 response_model 直接返回 ORM 模型可能暴露 password 和内部字段。
- 导入依赖并将其作为单个实例使用会在所有请求间共享它 — 始终把依赖定义为函数。

## 4. 检查清单

- [ ] APIRouter 是否按领域拆分并在 main.py 中用 include_router 注册？
- [ ] DB 会话是否用 Depends() 注入？
- [ ] 是否声明了 response_model 以从响应中排除敏感字段？
- [ ] DB 连接是否由 lifespan 上下文管理器管理？
