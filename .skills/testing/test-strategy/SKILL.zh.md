---
name: 测试策略 & 金字塔
description: 基于测试金字塔（Unit→Integration→E2E）的均衡测试策略标准。在确定团队的测试编写方式，或决定为新功能放置哪种测试、放多少时阅读。关键词: test, describe, it(, expect, mock, assert, beforeEach, afterEach, given, 测试金字塔, Given-When-Then。
rules:
  - "遵循测试金字塔 — 单元测试（70%）最多，依次是集成测试（20%）、E2E（10%）。"
  - "测试用 Given-When-Then（Arrange-Act-Assert）模式编写，使意图清晰。"
  - "测试名写成包含'测试什么'和'在什么条件下'的清晰描述句。"
  - "测试必须彼此独立，不依赖执行顺序或其他测试的状态。"
  - "外部依赖（DB·API·文件系统）在单元测试中用 Mock·Stub 隔离，在集成测试中使用真实依赖。"
tags:
  - "test"
  - "describe"
  - "it("
  - "expect"
  - "mock"
  - "assert"
  - "beforeEach"
  - "afterEach"
  - "given"
  - "테스트 피라미드"
  - "Given-When-Then"
foundational: true
---

# 🧪 测试策略 & 金字塔

> 基于测试金字塔编写均衡的测试。在确定团队的测试编写方式，或决定为新功能放置哪种测试、放多少时阅读。

## 1. 核心原则
- 遵循测试金字塔 — 单元测试（70%）最多，依次是集成测试（20%）、E2E（10%）。
- 测试用 Given-When-Then（Arrange-Act-Assert）模式编写，使意图清晰。
- 测试名写成包含'测试什么'和'在什么条件下'的清晰描述句。
- 测试必须彼此独立，不依赖执行顺序或其他测试的状态。
- 外部依赖（DB·API·文件系统）在单元测试中用 Mock·Stub 隔离，在集成测试中使用真实依赖。

## 2. 规则

### 2-1. 测试金字塔（按比例布置）

```
          ┌──────────┐
          │   E2E    │  10% — 用户场景的完整流程
          │(Playwright│
          └──────────┘
        ┌────────────────┐
        │  Integration   │  20% — 组件间集成、DB 联动
        │   Tests        │
        └────────────────┘
    ┌─────────────────────────┐
    │      Unit Tests         │  70% — 函数/类单位的隔离验证
    │    (快·独立·多)     │
    └─────────────────────────┘
```

### 2-2. Given-When-Then 模式

```python
# Python
class TestUserService:
    def test_create_user_success(self, mock_db, mock_email):
        # Given — 测试前置条件
        request = CreateUserRequest(name="홍길동", email="hong@example.com")
        mock_db.save.return_value = User(id="u1", **request.dict())

        # When — 执行测试对象
        result = user_service.create(request)

        # Then — 验证期望结果
        assert result.id == "u1"
        assert result.name == "홍길동"
        mock_email.send_welcome.assert_called_once_with("hong@example.com")
```

```javascript
// JavaScript (Vitest/Jest)
describe("UserService", () => {
  describe("create()", () => {
    it("유효한 이메일로 사용자 생성 시 id를 반환한다", async () => {
      // Given
      const request = { name: "홍길동", email: "hong@example.com" };
      mockDb.save.mockResolvedValue({ id: "u1", ...request });

      // When
      const result = await userService.create(request);

      // Then
      expect(result.id).toBe("u1");
      expect(mockEmail.sendWelcome).toHaveBeenCalledWith("hong@example.com");
    });
  });
});
```

### 2-3. 测试隔离（无共享状态）

```python
# 每个测试独立 — 无共享状态
@pytest.fixture(autouse=True)
def reset_db():
    # 测试前初始化
    yield
    db.rollback()  # 测试后回滚
```

### 2-4. Mock vs Stub vs Fake（依赖隔离方式的选择）

| 类型 | 用途 | 示例 |
|------|------|------|
| Mock | 验证调用 | `mockEmail.assert_called_once()` |
| Stub | 固定返回值 | `mockDb.find.return_value = user` |
| Fake | 像真的一样运行 | 内存 DB |
| Spy | 真实调用 + 观察 | `jest.spyOn(obj, 'method')` |

## 3. 常见错误
- ❌ 金字塔倒置（E2E 过多） → 慢且易碎、维护负担重。以单元测试为中心。
- ❌ 与实现细节耦合的测试 → 每次重构都出错。验证公开行为·契约。
- ❌ 只追求覆盖率数值 → 量产没有 assertion 的"只通过"的测试。放置有意义的断言。
- ❌ 测试间共享状态 → 依赖执行顺序·flaky。用隔离·回滚保证独立。
- ❌ 在单元测试中真实调用外部依赖（DB·API） → 慢且不稳定。用 Mock/Stub 隔离。
- ❌ 只测试快乐路径 → 也要一并验证错误·边界值·null·并发。
- ❌ 没有断言消息·清晰的测试名 → 失败时定位原因变慢。

## 4. 清单
- [ ] 单元/集成/E2E 比例是否接近金字塔（70/20/10）
- [ ] 每个测试是否用 Given-When-Then 展现意图
- [ ] 测试名是否包含'测试什么·在什么条件下'
- [ ] 测试是否不依赖执行顺序·其他测试的状态
- [ ] 是否用 Mock·Stub 隔离了单元测试的外部依赖
