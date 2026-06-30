---
name: 单元测试 — 隔离·快速·可靠
description: 将函数·类单元从外部依赖中隔离，以编写快速且可靠的单元测试的通用(foundational)标准，与具体语言/工具无关 — 一行为一测试、FIRST、边界值·异常、外部依赖(时间·HTTP·DB·文件)隔离、参数化。在新写单元测试，或决定如何处理外部依赖·时间·边界值时阅读(单元/集成/E2E 范围选择见 test-strategy)。与特定语言/工具无关。
rules:
  - "一行为一测试: 一个测试只验证一个行为(逻辑流程·结果) — 确认同一行为的多个断言是可以的。用例不同就拆分。"
  - "隔离外部与非确定性因素: 像 DB·HTTP·文件·时间·随机这类位于单元之外的东西，用测试替身替换，使结果不会因外部环境·执行顺序·当前时间而动摇(保持确定性)。"
  - "不只看正常路径，还要看边界·异常: 将边界值(0·最小·最大·null·空集合)与失败路径一并查看。"
  - "自动判定 + 良好的失败信息: 无需用眼睛比对，成功/失败自动区分，失败时揭示什么出错、为什么出错。"
  - "测试也要达到生产质量: 重复的准备用公共 fixture/helper，仅输入不同的用例用参数化归并。"
tags:
  - "jest"
  - "vitest"
  - "pytest"
  - "unittest"
  - "mock"
  - "spy"
  - "assert"
  - "toBe"
  - "toEqual"
  - "@Test"
  - "JUnit"
foundational: true
---

# 🔬 单元测试 — 隔离·快速·可靠

> 将函数·类单元从外部依赖中隔离，构建快速且任何时候都给出相同结果的可靠测试。在新写单元测试，或决定如何处理外部依赖·时间·边界值时阅读。这是不依附于特定语言/测试工具的通用标准。(关于用单元/集成/E2E 中的哪一个来验证什么的范围决定，参见 test-strategy)

## 1. 核心原则
- **一行为一测试**: 一个测试只验证一个行为(逻辑流程·结果) — 确认同一行为的多个断言是可以的。用例不同就拆分。
- **隔离外部与非确定性因素**: 像 DB·HTTP·文件·时间·随机这类位于单元之外的东西，用测试替身替换，使结果不会因外部环境·执行顺序·当前时间而动摇(保持确定性)。
- **不只看正常路径，还要看边界·异常**: 将边界值(0·最小·最大·null·空集合)与失败路径一并查看。
- **自动判定 + 良好的失败信息**: 无需用眼睛比对，成功/失败自动区分，失败时揭示什么出错、为什么出错。
- **测试也要达到生产质量**: 重复的准备用公共 fixture/helper，仅输入不同的用例用参数化归并。

## 2. 规则

### 2-1. 好的单元测试的特性 (FIRST)

| 特性 | 含义 |
|------|------|
| **F**ast | 以毫秒级运行(无 DB·网络) |
| **I**solated | 与其他测试独立(不受共享状态·执行顺序影响) |
| **R**epeatable | 任何时间任何地点都得到相同结果 |
| **S**elf-validating | 自动判断成功/失败 |
| **T**imely | 在生产代码编写前后适时编写 |

### 2-2. 一个测试只验证一个行为
- 用例(正常·边界·异常)不同就拆分测试。不要把多个行为塞进一个测试。
- 让人仅看测试名就能读出"它保证了什么"。

```text
// ❌ 禁止 — 一个测试一次性验证多个行为(失败时原因模糊)
test("discount"):
  assert discount(10000, member=true)  == 9000
  assert discount(0,     member=true)  == 0
  assert discount(10000, member=false) == 10000

// ✅ 推荐 — 每个行为单独一个测试，意图由名称体现
test("会员享 10% 折扣"):      assert discount(10000, member=true)  == 9000
test("价格为 0 则为 0"):      assert discount(0,     member=true)  == 0
test("非会员无折扣"):         assert discount(10000, member=false) == 10000
```

### 2-3. 必须验证边界值和异常路径
- 不要只看正常用例，要将边界(0、最小·最大、null/缺失、空集合)与失败·异常一并查看。
- 对异常，不仅验证"是否被抛出"，还要验证"是否以正确的种类/原因被抛出"。

```text
// ❌ 禁止 — 只验证正常路径一行，边界·异常被放任
test("只确认正常价格的折扣")

// ✅ 推荐 — 将边界·异常也拆为用例来验证
test("边界: 价格 0 → 0")
test("异常: 负价格 → 抛出 '价格必须为 0 以上' 错误")
test("边界: 空购物车 → 合计 0")
```

### 2-4. 用测试替身隔离外部依赖
- DB·HTTP·文件系统·消息队列等单元之外的资源不要真正调用，用 Mock/Stub/Fake 替换。
- 验证单元向协作者"请求了什么、如何请求"(交互)以及"如何处理响应"。

```text
// ❌ 禁止 — 打到真实外部系统，导致缓慢且不稳定
test("获取个人资料"):
  result = userApi.fetchProfile("u1")   // 真实服务器 HTTP 调用 → 依赖网络
  assert result.name == "洪吉童"

// ✅ 推荐 — 用替身替换协作者，只验证单元逻辑
test("获取个人资料"):
  httpClient.get = stub(returns { id:"u1", name:"洪吉童" })
  result = userApi.fetchProfile("u1")
  assert result.name == "洪吉童"
```

### 2-5. 固定时间·随机等非确定性因素
- 像"当前时间"·随机数·UUID 这类每次调用都会变化的值，用测试替身/伪造固定，使其确定。
- 若将代码设计为接收注入的时钟·随机源而非直接调用，就容易固定。

```text
// ❌ 禁止 — 依赖真实当前时间 → 只在周六通过/失败
test("是否周末"):
  assert isWeekend() == true     // 仅当今天是周六时正确

// ✅ 推荐 — 固定时间使结果确定
test("周六是周末"):
  clock.fixTo("2026-06-14")      // 固定为周六
  assert isWeekend() == true
```

### 2-6. 用参数化·fixture 消除重复
- 仅输入不同而验证结构相同的用例，归并成表(数据)并参数化。
- 将重复的准备(setup)抽取为公共 fixture/helper，但只共享到不遮蔽测试意图的程度。

```text
// ❌ 禁止 — 同样的验证只改输入而复制粘贴
test("a@b.com 有效"):     assert isValidEmail("a@b.com") == true
test("invalid 无效"):     assert isValidEmail("invalid") == false
test("@no.com 无效"):     assert isValidEmail("@no.com") == false

// ✅ 推荐 — 将用例归并成数据，合为一个测试
test_each([
  ("a@b.com", true),
  ("invalid", false),
  ("@no.com", false),
  ("",        false),
])("邮箱校验", (input, expected):
  assert isValidEmail(input) == expected
)
```

## 3. 常见错误

违反规则(§2)时出现的症状 — 看到就回到对应规则。

- **即使失败也无法定位原因** → 把多个行为捆进一个测试(2-2)导致不清楚什么坏了，或失败信息只有 "expected true, got false"(缺少自动判定·信息)。
- **只在生产中炸裂** → 只验证正常路径，放任边界·异常(2-3)。
- **只偶尔/在特定环境中坏掉(flaky)** → 真正调用外部依赖(2-4)、依赖当前时间·随机(2-5)，或在测试间共享状态而受执行顺序影响(isolation)。
- **测试臃肿且脆弱** → 把仅输入不同的用例复制粘贴(2-6)。

## 4. 检查清单
- [ ] 一个测试是否只验证一个行为(意图能否从名称读出)
- [ ] 是否验证了边界值(0·最小·最大·null/缺失·空集合)和异常路径
- [ ] 是否用测试替身隔离了外部依赖(DB·HTTP·文件系统·时间·随机)
- [ ] 是否固定了时间·随机等非确定性因素使其确定(repeatable)
- [ ] 是否不在测试间共享状态从而与执行顺序无关(isolated)
- [ ] 成功/失败是否自动判定(self-validating)，能否从失败信息得知原因
- [ ] 是否将重复用例抽取为参数化、重复准备抽取为公共 fixture/helper

## 附录: 各技术栈示例

> 以下是供参考的实现示例。按相同模式，添加符合团队所用技术栈(测试运行器·mocking 库)的示例。上面 1～4 的原则·规则才是标准，附录只是其应用案例。

### Python (pytest)

边界·异常(2-3):

```python
class TestCalculateDiscount:
    # 정상 케이스
    def test_10percent_for_membership(self):
        assert calculate_discount(price=10000, is_member=True) == 9000

    # 경계값
    def test_zero_price_returns_zero(self):
        assert calculate_discount(price=0, is_member=True) == 0

    def test_negative_price_raises_error(self):
        with pytest.raises(ValueError, match="가격은 0 이상이어야 합니다"):
            calculate_discount(price=-100, is_member=True)

    # 예외 케이스
    def test_non_member_no_discount(self):
        assert calculate_discount(price=10000, is_member=False) == 10000
```

时间隔离(2-5, `unittest.mock.patch`):

```python
from unittest.mock import patch
from datetime import datetime, date

def test_is_weekend_saturday():
    with patch("app.services.datetime") as mock_dt:
        mock_dt.today.return_value = date(2026, 6, 14)  # 토요일
        assert is_weekend() is True
```

HTTP 隔离(2-4, `AsyncMock`):

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_fetch_user_profile():
    mock_response = AsyncMock()
    mock_response.json = AsyncMock(return_value={"id": "u1", "name": "홍길동"})

    with patch("httpx.AsyncClient.get", return_value=mock_response):
        result = await user_api.fetch_profile("u1")

    assert result.name == "홍길동"
```

参数化(2-6, `@pytest.mark.parametrize`):

```python
@pytest.mark.parametrize("input,expected", [
    ("hello@email.com", True),
    ("invalid-email", False),
    ("@nodomain.com", False),
    ("", False),
])
def test_email_validation(input, expected):
    assert is_valid_email(input) == expected
```

### JS (Jest 等)

时间隔离(2-5, fake timer):

```javascript
// Jest — 시스템 시간 모킹
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-06-14") });
});
afterEach(() => jest.useRealTimers());
```
