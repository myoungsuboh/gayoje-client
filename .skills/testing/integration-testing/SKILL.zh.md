---
name: 集成测试 — DB·API·组件协同
description: 验证包含真实 DB·外部服务·API 的组件间协作的通用集成测试标准 — 测试专用依赖、测试间隔离(初始化·清理)、契约(模式·状态·头)验证、外部服务沙箱化、CI 可复现性。在测试 API 契约·DB 协同·外部服务协同,或在 CI 中拉起依赖服务进行验证时阅读。与具体语言/框架/工具无关。
rules:
  - "不碰生产: 只使用测试专用的 DB·队列·缓存·桶,绝不连接真实生产数据。"
  - "测试间隔离: 每个测试从已知状态开始,结束后清除痕迹(回滚/清理) — 无论执行顺序如何都必须得到相同结果。"
  - "看契约而非实现: 发送真实请求,验证外部可观察的契约(模式·状态/错误码·头·载荷)。"
  - "外部副作用用替身: 支付·邮件·短信等用沙箱/假服务器替代,不引发真实计费·发送·外部变更。"
  - "确定且可复现: 不依赖时间·随机·时序·顺序(异步要等完成后再断言),用代码拉起依赖服务,使本地与 CI 一致。"
tags:
  - "testcontainers"
  - "docker-compose"
  - "pytest-asyncio"
  - "supertest"
  - "TestClient"
  - "integration"
  - "database"
  - "httpx"
---

# 🔗 集成测试 — DB·API·组件协同

> 如果说单元测试隔离验证单个单元,那么集成测试验证包含真实 DB·外部服务·API 的 **组件间协作**。在测试 API 契约或 DB 协同、并在 CI 中可复现地拉起依赖服务时阅读。这是一个不依赖具体语言/框架/测试工具的通用标准。输入值校验本身遵循 `输入值校验标准`。

## 1. 核心原则
- **不碰生产**: 只使用测试专用的 DB·队列·缓存·桶,绝不连接真实生产数据。
- **测试间隔离**: 每个测试从已知状态开始,结束后清除痕迹(回滚/清理) — 无论执行顺序如何都必须得到相同结果。
- **看契约而非实现**: 发送真实请求,验证外部可观察的契约(模式·状态/错误码·头·载荷)。
- **外部副作用用替身**: 支付·邮件·短信等用沙箱/假服务器替代,不引发真实计费·发送·外部变更。
- **确定且可复现**: 不依赖时间·随机·时序·顺序(异步要等完成后再断言),用代码拉起依赖服务,使本地与 CI 一致。

## 2. 规则

### 2-1. 使用测试专用而非生产的依赖
- 让 DB/队列/缓存/存储在测试环境中指向隔离的实例(内存或容器)。
- 连接信息通过按环境的配置注入,不要让生产连接信息泄漏到测试路径。

```text
// ❌ 禁止 — 用生产 DB 做集成测试
connect(PROD_DATABASE_URL); runTests()      // 数据污染·事故

// ✅ 推荐 — 测试专用隔离实例
connect(TEST_DATABASE_URL); runTests()      // 内存或容器
```

### 2-2. 测试间隔离 — 保证起始状态,结束后清理
- 在每个测试(或一组用例)前把模式/数据置为已知状态,之后回滚或清空。
- 隔离策略(每测试事务回滚 / 表 truncate / 每次重建)择其一,但一致地应用。
- 不要在测试间共享公用可变状态 — 会产生顺序依赖。

```text
// ❌ 禁止 — 不清理导致数据堆积 → 结果随顺序而变
test A: insert X
test B: count == 1   // A 先跑就坏

// ✅ 推荐 — 每个测试都被隔离
beforeEach: reset to known state
afterEach:  rollback / cleanup
```

### 2-3. API 集成用真实请求验证契约
- 不要直接调用处理函数,要发送走过真实 HTTP 路径(含路由·序列化·校验·中间件)的请求。
- 断言状态/错误码、响应模式、关键头。写入后再读一次确认是否真的生效。

```text
// ❌ 禁止 — 直接调用内部函数(跳过序列化·路由·校验)
result = controller.create(obj); assert result.ok

// ✅ 推荐 — 真实请求 → 状态·模式·往返验证
res = POST /users {name, email}
assert res.status == 201
id = res.body.id
got = GET /users/{id}
assert got.status == 200 and got.body.name == name
```

### 2-4. 组件(UI 等)集成用替身挡住外部调用,并在异步完成后断言
- UI/视图集成测试真实渲染/挂载组件,但用假响应拦截向外发出的网络调用。
- 在异步数据加载结束后(显式等待),验证反映到屏幕上的结果。

```text
// ✅ 推荐 — 拦截外部调用 + 等异步完成后断言
mockNetwork(GET /user/u1 → {name: "..."})
render(Profile, {userId: "u1"})
awaitAsyncSettled()              // 等待异步处理完成
assert screen.contains("...")
```

### 2-5. 外部服务用沙箱/替身 — 禁止真实副作用
- 支付·邮件·短信·第三方 API 用测试模式/沙箱密钥或本地假服务器替代。
- 不要引发真实计费·发送·外部状态变更。响应延迟·失败等边界状况也用替身重现。

```text
// ❌ 禁止 — 测试调用真实支付/发送
charge(realCard)        // 费用·副作用·不稳定

// ✅ 推荐 — 用沙箱/假服务器只验证契约
charge(sandboxCard) → assert request shape & handled response
```

### 2-6. 用代码拉起依赖服务并在 CI 中复现
- 用声明式方式(容器定义等)拉起 DB·缓存等依赖服务,确认 **就绪(healthcheck)** 后再开始测试。
- 本地与 CI 共享同一份定义,消除"在我电脑上能跑"。

```text
// ✅ 推荐 — 启动依赖服务 → 确认就绪 → 测试
services: [db, cache]  with healthcheck
wait until healthy
then run integration tests
```

## 3. 常见错误

违反规则(§2)时出现的症状 — 看到就回到对应规则。

- **数据污染·事故** → 连接生产资源做测试(2-1)。
- **随顺序而坏(flaky)** → 缺少 setup/teardown(2-2)、不等异步完成(2-4)、依赖时间·随机·顺序(确定性)之一。
- **抓不到契约缺陷** → 直接调用内部函数还称作"API 测试",跳过序列化·路由·校验·中间件(2-3)。
- **费用·副作用** → 真实调用外部服务(2-5)。
- **"在我电脑上能跑"** → 没用代码声明依赖服务,在 CI 里坏掉(2-6)。

## 4. 检查清单
- [ ] 是否使用测试专用 DB/依赖(内存·容器)且不碰生产资源
- [ ] 每个测试是否从已知状态开始、结束后回滚/清理,彼此隔离
- [ ] API 集成测试是否用真实请求验证状态·模式·头等 **契约**
- [ ] 写入后是否再读一次确认真实生效(往返)
- [ ] UI/组件集成中是否用替身挡住外部调用并在异步完成后断言
- [ ] 是否用测试模式/沙箱/假服务器处理外部服务(无真实副作用)
- [ ] 是否去除时间·随机·顺序依赖使其确定
- [ ] 是否用代码拉起依赖服务并在确认就绪后运行,从而在 CI 中可复现

## 附录: 各栈示例

> 以下是参考用的实现示例。按团队所用的栈(如 JVM/Spring+Testcontainers、Node/Jest+supertest、Go/testify 等)以相同模式补充示例。上面 1~4 的原则·规则才是标准,附录只是其应用案例。

### Python (pytest + httpx + SQLAlchemy + Testcontainers)

用真实请求做契约·往返验证 + 每个测试的 DB 初始化(2-3, 2-2):

```python
import pytest
from httpx import AsyncClient
from sqlalchemy import create_engine
from app.main import app

# 测试专用 DB (内存 SQLite 或 Docker PostgreSQL)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(autouse=True)
async def reset_db():
    """每个测试前初始化表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_create_and_get_user():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # 创建
        create_res = await client.post("/users", json={
            "name": "洪吉童", "email": "hong@example.com"
        })
        assert create_res.status_code == 201
        user_id = create_res.json()["id"]

        # 查询 — 从真实 DB 读取
        get_res = await client.get(f"/users/{user_id}")
        assert get_res.status_code == 200
        assert get_res.json()["name"] == "洪吉童"
```

如果内存不够,用容器(Testcontainers)拉起真实 PostgreSQL,测试后回滚:

```python
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg.get_connection_url()

@pytest.fixture
async def db_session(postgres):
    engine = create_async_engine(postgres)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
        await session.rollback()  # 测试后回滚
```

### Vue (Vue Test Utils + Pinia + MSW)

外部调用替身 + 异步完成后断言(2-4):

```javascript
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import UserProfile from "@/components/UserProfile.vue";

// 模拟真实 API (MSW 或 vi.mock)
vi.mock("@/utils/axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { id: "u1", name: "洪吉童", email: "hong@example.com" }
    })
  }
}));

test("加载并显示用户资料", async () => {
  const wrapper = mount(UserProfile, {
    props: { userId: "u1" },
    global: { plugins: [createPinia()] }
  });

  await flushPromises();  // 异步处理完成

  expect(wrapper.text()).toContain("洪吉童");
  expect(wrapper.text()).toContain("hong@example.com");
});
```

### CI 依赖服务 (Docker Compose)

用 healthcheck 拉起依赖服务后运行,在 CI 中复现(2-6):

```yaml
# docker-compose.test.yml
services:
  test:
    build: .
    command: pytest tests/integration/ -v
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://postgres:test@postgres:5432/testdb

  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: test }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 2s
      retries: 10
```
