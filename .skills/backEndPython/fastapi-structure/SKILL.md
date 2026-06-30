---
name: FastAPI Project Structure & Routers
description: Project structure for FastAPI applications — router separation, Dependency Injection (Depends), response models, lifespan events, and middleware configuration. Read when starting a FastAPI project or adding a new domain router. Keywords: FastAPI, APIRouter, Depends, Response, lifespan, middleware, CORS, HTTPException.
rules:
  - "Separate APIRouters by domain and keep main.py as a thin entry point that only holds the app instance and router includes."
  - "Inject common dependencies (DB session, current user) with Depends() — do not create them directly inside route functions."
  - "Declare response_model on each route to enable automatic serialization and documentation, and to prevent internal fields (e.g. password) from leaking."
  - "Manage DB connections and external client initialization in the lifespan context manager."
  - "Use HTTPException with sufficient detail in the detail field — do not expose empty 500 errors to clients."
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

# 🚀 FastAPI Project Structure & Routers

> Use FastAPI's router separation, Dependency Injection, and response models to build maintainable APIs.

## 1. Core Principles

- Feature-based APIRouter separation — main.py is a thin entry point.
- Inject DB sessions and authentication consistently with Depends().
- Declare response_model to make response schemas explicit and prevent sensitive field exposure.

## 2. Rules

### 2-1. Project Structure

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

### 2-2. main.py — Router Include + Lifespan

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

### 2-4. Shared Depends

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

## 3. Common Mistakes

- Use `lifespan` instead of `app = FastAPI(on_startup=[...])` — on_startup/on_shutdown are deprecated.
- Returning an ORM model directly without a response_model may expose password and internal fields.
- Importing a dependency and using it as a single instance shares it across all requests — always define dependencies as functions.

## 4. Checklist

- [ ] Are APIRouters separated by domain and registered with include_router in main.py?
- [ ] Is the DB session injected with Depends()?
- [ ] Is response_model declared to exclude sensitive fields from responses?
- [ ] Is the DB connection managed by the lifespan context manager?
