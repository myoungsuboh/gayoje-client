---
name: 测试数据 & Fixture 管理
description: 测试数据·夹具·种子的通用标准 — 在测试内部生成、默认值 + 仅覆盖所需值、伪造数据、夹具范围与测试间隔离、幂等种子。在生成或共享测试数据，或编写、维护 DB 种子脚本时阅读。与技术栈无关。
rules:
  - "数据由测试拥有: 不是预先填充的共享全局变量，而是每个测试（或其设置）创建自己的数据，以免随执行顺序而动摇。"
  - "默认值 + 覆盖: 生成器为所有字段填入合理默认值，测试只覆盖有意义的值 — 切断重复与对无关字段的耦合。"
  - "伪造·确定性数据: 用生成的伪造值代替敏感的真实数据（安全·合规），随机则固定种子使其可复现同时保持多样性。"
  - "隔离与复用的平衡: 创建成本高的资源在宽范围创建一次并复用，测试创建的数据在窄范围隔离以清理/回滚。"
  - "把笨重或重复的东西移到外面: 大容量输入作为文件 + 路径常量放置，DB 种子幂等地（存在则忽略/更新）编写。"
tags:
  - "factory"
  - "fixture"
  - "faker"
  - "seed"
  - "mock_data"
  - "pytest.fixture"
  - "beforeEach"
  - "factory_boy"
---

# 🏭 测试数据 & Fixture 管理

> 用带有合理默认值的工厂在测试内部创建测试数据，使用伪造数据，成本高的资源按范围划分以复用同时让测试彼此隔离，种子幂等地编写。在生成或共享测试数据，或编写、维护 DB 种子脚本时阅读。这是不依赖特定语言/框架/库的通用标准。

## 1. 核心原则
- **数据由测试拥有**: 不是预先填充的共享全局变量，而是每个测试（或其设置）创建自己的数据，以免随执行顺序而动摇。
- **默认值 + 覆盖**: 生成器为所有字段填入合理默认值，测试只覆盖有意义的值 — 切断重复与对无关字段的耦合。
- **伪造·确定性数据**: 用生成的伪造值代替敏感的真实数据（安全·合规），随机则固定种子使其可复现同时保持多样性。
- **隔离与复用的平衡**: 创建成本高的资源在宽范围创建一次并复用，测试创建的数据在窄范围隔离以清理/回滚。
- **把笨重或重复的东西移到外面**: 大容量输入作为文件 + 路径常量放置，DB 种子幂等地（存在则忽略/更新）编写。

## 2. 规则

### 2-1. 测试数据用工厂，在测试内部生成
- 不要让多个测试一起读写预先塞进共享全局夹具的数据。
- 每个测试（或其设置）创建自己的数据，以免与其他测试相互干扰。

```text
// ❌ 禁止 — 共享全局中预先创建的数据（对顺序·干扰脆弱）
GLOBAL.users = [alice, bob]        // 模块加载时创建一次
test A: GLOBAL.users[0].激活()    // 改变状态
test B: assert GLOBAL.users[0].激活?  // A 先运行就会出错

// ✅ 推荐 — 每个测试用工厂重新生成
test A: u = makeUser();  u.激活();  assert ...
test B: u = makeUser();  assert u.未激活?
```

### 2-2. 生成器填入默认值，测试只覆盖所需值
- 数据生成器为所有必填字段提供合理的默认值。
- 调用的测试只覆盖与该测试意图直接相关的字段 — 其余交给默认值。

```text
// ❌ 禁止 — 每个测试都指定全部字段（重复 + 对无关字段脆弱）
makeUser(id=…, name=…, email=…, role="user", createdAt=…, active=true)

// ✅ 推荐 — 在默认值之上只覆盖有意义的值
makeUser()                       // 全部默认值
makeUser(role="admin")           // 只覆盖此测试关心的值
makeAdmin() = makeUser(role="admin")   // 常用变体用命名辅助函数
```

### 2-3. 用伪造数据代替敏感真实数据
- 不要把真实姓名·真实邮箱·电话·地址·卡号等放进测试。
- 用虚拟数据生成器生成仅格式正确的伪造值。需要时指定区域设置（locale）。

```text
// ❌ 禁止 — 真实个人信息
makeUser(name="张三", email="real.person@gmail.com")

// ✅ 推荐 — 生成的伪造数据
makeUser(name=fakeName(locale="ko"), email=fakeEmail())
```

### 2-4. 夹具分层: 按范围分摊成本，测试隔离
- 创建成本高的资源（DB 引擎/模式、应用上下文等）在宽范围（套件/会话）只创建一次并复用。
- 每个测试创建的数据放在窄范围（按测试），结束后回滚/清理，以免泄漏到下一个测试。

```text
// ✅ 推荐 — 划分范围: 昂贵的创建一次，数据按测试 + 隔离
fixture(scope=会话)  dbEngine:  创建模式   → 所有测试共享
fixture(scope=测试) dbSession: 开始事务 → (测试) → 结束后回滚
fixture(scope=测试) sampleUser(dbSession): makeUser() 后返回
```

### 2-5. 动摇结果的随机要固定种子
- 随机生成可能使验证不稳定的地方，固定种子使其可复现。
- 但要保持数据多样性，以免只重复相同的值而看不到边界情况。

```text
// ❌ 禁止 — 每次运行值都变，偶尔失败 (flaky)
random.seed = 当前时间

// ✅ 推荐 — 固定种子使其可复现
random.seed = 1234
```

### 2-6. 大容量数据用文件，路径用常量
- 大输入（样本 JSON/CSV 等）不要内联在测试代码里，而作为文件放置。
- 该路径不要在各测试里散布相对路径，而在一处定义为常量并引用。

```text
// ❌ 禁止 — 到处都是易碎的相对路径
load("../../../fixtures/big.json")

// ✅ 推荐 — 在一处定义为常量并引用
FIXTURES_DIR = <相对于项目基准的绝对/根路径>
load(FIXTURES_DIR + "/big.json")
```

### 2-7. 种子脚本要幂等
- DB 种子以"存在则忽略（或更新）"的方式编写，使多次执行也能无重复·无错误地达到相同状态。
- 不要无条件 INSERT — 重复运行会产生重复键·重复行。

```text
// ❌ 禁止 — 重复运行会重复/出错
for name in 类别: INSERT category(name)

// ✅ 推荐 — 幂等（存在则忽略/更新）
for name in 类别: getOrCreate category(name)
```

## 3. 常见错误

违反规则（§2）时出现的症状 — 看到就回到相应规则。

- **结果随顺序改变** → 依赖全局共享数据（2-1），或未清理测试留下的痕迹（2-4），污染下一个测试。
- **测试因无关变更而出错** → 没有默认值，每次都指定全部字段（2-2），连不关心的字段也耦合了。
- **偶尔失败（flaky）** → 没有固定种子的随机（2-5）使每次运行值都不同。
- **慢** → 每个测试都重新创建昂贵资源（2-4）。
- **重复运行出错** → 种子不幂等（2-7），产生重复键·重复行。
- **其他** → 真实数据暴露（2-3）、大容量内联 + 滥用相对路径（2-6）也由各自的规则防止。

## 4. 清单
- [ ] 是否在测试内部生成测试数据，而不依赖共享全局状态
- [ ] 数据生成器是否提供默认值，测试只覆盖所需值
- [ ] 是否用伪造（生成的）数据代替真实敏感数据
- [ ] 昂贵资源是否在宽范围创建一次，每个测试的数据结束后清理/回滚以隔离
- [ ] 动摇验证的随机是否固定种子使其可复现
- [ ] 是否把大容量数据作为文件放置并将路径定义为常量
- [ ] 种子脚本是否幂等运行

## 附录: 各技术栈示例

> 以下是参考用的实现示例。按相同模式添加符合团队所用技术栈（测试运行器·夹具工具·伪造数据库）的示例。上述 1~4 的原则·规则是标准，附录只是其应用案例。两个技术栈示例是展示相同规则的样本，即使只有一侧有代码，规则同样适用于两侧。

### Python (factory_boy / Faker)

#### Factory 模式
定义带默认值的 Factory，在测试中只覆盖所需值。

```python
# tests/factories.py
from factory import Factory, Faker, SubFactory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = db.session

    id = Factory.LazyFunction(lambda: str(uuid4()))
    name = Faker("name", locale="ko_KR")
    email = Faker("email")
    role = "user"
    created_at = Factory.LazyFunction(datetime.utcnow)

class OrderFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Order
        sqlalchemy_session = db.session

    user = SubFactory(UserFactory)
    total_amount = Faker("random_int", min=1000, max=100000)
    status = "pending"

# 在测试中使用
def test_user_can_view_own_orders():
    user = UserFactory.create()
    orders = OrderFactory.create_batch(3, user=user)
    # 覆盖默认值
    special_order = OrderFactory.create(user=user, status="completed", total_amount=50000)
```

#### pytest Fixture 分层
划分范围（session/function），让成本高的资源只创建一次，每个测试用事务回滚隔离。

```python
# conftest.py — 共享 fixture

@pytest.fixture(scope="session")
def db_engine():
    """整个会话只创建一次"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(db_engine):
    """每个测试事务回滚"""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def sample_user(db_session):
    """创建测试用用户"""
    user = UserFactory(session=db_session)
    db_session.flush()
    return user
```

#### 幂等种子脚本
像 `get_or_create` 那样写成已存在则忽略，使多次执行结果相同。

```python
# scripts/seed.py
def seed_categories():
    categories = ["Electronics", "Books", "Clothing"]
    for name in categories:
        # 已存在则忽略 — 幂等
        Category.get_or_create(name=name)

if __name__ == "__main__":
    seed_categories()
    print("Seed completed")
```

### TypeScript / JavaScript (faker-js)

#### Factory 模式
展开 `overrides`，在默认值之上只覆盖按测试的值，变体用单独的辅助函数创建。

```typescript
// tests/factories/user.factory.ts
import { faker } from "@faker-js/faker";

export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: "user",
  createdAt: new Date(),
  ...overrides,  // 按测试覆盖
});

export const createAdmin = () => createUser({ role: "admin" });

// 在测试中使用
test("管理员可以查询所有用户", () => {
  const admin = createAdmin();
  const users = Array.from({ length: 5 }, () => createUser());
  // ...
});
```

#### 夹具范围 · 幂等种子（概念映射）

上述 Python 示例的 `pytest fixture` 分层（2-4）和幂等种子（2-7）在 JS/TS 中也按相同规则适用。只是工具不同:

- **范围·隔离（2-4）**: 用 `beforeAll` 准备昂贵资源（DB/容器）一次，在 `beforeEach`/`afterEach` 中用事务回滚或 truncate 隔离每个测试（Vitest/Jest 通用）。
- **幂等种子（2-7）**: 种子脚本用 ORM 的 upsert（例如 Prisma `upsert`、TypeORM `save`）写成"存在则更新/忽略"，而不是 `INSERT`。
