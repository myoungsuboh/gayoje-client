---
name: 输入校验 & 数据净化 (Security)
description: 在服务端校验并净化不可信输入以阻止 Injection、XSS、Path Traversal 的通用(foundational)安全标准,涵盖白名单、按上下文转义/参数化、HTML 净化、文件上传多重校验(与技术栈无关)。在构建接收输入的 API、表单、文件上传,或修改净化/转义逻辑时阅读。关键词:sanitize, whitelist, escape, parameterize, injection, XSS, path traversal, file upload。
rules:
  - "共同基础(摘要):不信任输入,在服务端强制,以声明式 schema 约束,失败即拒绝(fail-closed)。 —— 详见 validation-bean。"
  - "白名单优先:显式定义「要允许的值」并拒绝其余。只挑出「危险值」拦截的黑名单无法阻止新的绕过模式。"
  - "按上下文处理(转义/参数化):防御因输入用在何处而不同。查询要参数化(禁止字符串拼接),HTML 输出要编码/转义,Shell、文件路径用相应上下文规则消解。「校验过了就可照样用」是危险的。"
  - "危险输出要净化:若必须允许 HTML 等标记,用经过验证的净化工具只放行允许的标签·属性。不要用自制正则去过滤标签。"
  - "文件上传要多重校验:校验扩展名·MIME 类型·实际内容(魔数)·大小,并且不把上传文件存到 Web 可直接执行/提供的位置(Web 根)。"
  - "阻止 Path Traversal:把输入拼接到文件路径/名时,先归一化再确认是否在允许目录内。"
tags:
  - "sanitize"
  - "whitelist"
  - "escape"
  - "parameterize"
  - "injection"
  - "XSS"
  - "path traversal"
  - "file upload"
  - "validate"
  - "schema"
  - "pydantic"
  - "zod"
  - "DOMPurify"
  - "bleach"
foundational: true
---

# 🛡️ 输入校验 & 数据净化 (Security)

> 在服务端校验并净化所有不可信输入,以阻止 Injection、XSS、Path Traversal 等攻击。在构建接收输入的 API、表单、文件上传,或修改校验/净化逻辑时阅读。它是一个不依赖特定语言/库的通用安全标准。
>
> 本技能是**安全视角**(攻击防御)。输入模型校验的一般设计与错误响应标准请一并参阅 `validation-bean`(输入值校验标准)。输出编码、SQL Injection 等攻击目录全貌请参考 `owasp-top10`。

## 1. 核心原则

校验的共同基础(不信任输入·服务端强制·声明式 schema·fail-closed)只用一行带过,以下集中于**安全特有的防御**。校验与错误响应的一般设计见 `validation-bean`(输入值校验标准)。

- **共同基础(摘要)**:不信任输入,在服务端强制,以声明式 schema 约束,失败即拒绝(fail-closed)。 —— 详见 `validation-bean`。
- **白名单优先**:显式定义「要允许的值」并拒绝其余。只挑出「危险值」拦截的黑名单无法阻止新的绕过模式。
- **按上下文处理(转义/参数化)**:防御因输入用在何处而不同。查询要**参数化**(禁止字符串拼接),HTML 输出要**编码/转义**,Shell、文件路径用相应上下文规则消解。「校验过了就可照样用」是危险的。
- **危险输出要净化**:若必须允许 HTML 等标记,用经过验证的净化工具**只放行允许的标签·属性**。不要用自制正则去过滤标签。
- **文件上传要多重校验**:校验扩展名·MIME 类型·实际内容(魔数)·大小,并且不把上传文件存到 Web 可直接执行/提供的位置(Web 根)。
- **阻止 Path Traversal**:把输入拼接到文件路径/名时,先归一化再确认是否在允许目录内。

```
在服务端校验 (必需)        > 在客户端校验 (可选 UX)
白名单 (允许列表)          > 黑名单 (拦截列表)
声明式 schema              > 手写正则
参数化 / 转义              > 直接拼接输入字符串
魔数(实际内容)            > 只信任扩展名/MIME
```

## 2. 规则

> 进入点统一校验·服务端强制·声明式 schema 的一般规则遵循 `validation-bean`。出于安全,格式·枚举·长度校验不要用手写正则·`if` 散落在各处理器,而要汇集到声明式 schema(防遗漏·防绕过)。以下只放安全特有的规则。

### 2-1. 用白名单明示允许的值
- 定义允许的格式·枚举值·范围并拒绝其余。不依赖挑出危险字符串拦截的黑名单。
- 枚举型的值(角色·状态·排序键等)用允许列表强制,使任意值不流入逻辑·查询。

```text
// ❌ 禁止 — 用黑名单只拦截「看起来危险的东西」(可绕过)
if input contains "<script>" or "DROP TABLE": reject

// ✅ 推荐 — 只放行允许列表
role ∈ { "user", "admin" }          // 其余全部拒绝
sortKey ∈ { "createdAt", "name" }   // 拦截任意列名
```

### 2-2. 按输出上下文做参数化/转义
- DB 查询用**参数化/绑定**处理,不把输入作为字符串拼接(SQL Injection 防御)。
- 作为 HTML 输出的值按输出上下文做**编码/转义**(XSS 防御)。
- 把输入放进 Shell 命令·文件路径时用相应上下文规则消解,路径则归一化后确认是否在允许目录内(Path Traversal 防御)。

```text
// ❌ 禁止 — 把输入照样拼接 (Injection)
query("SELECT * FROM users WHERE id = " + input.id)
render("<div>" + input.comment + "</div>")
open(baseDir + "/" + input.filename)        // 可用 "../" 逃逸

// ✅ 推荐 — 参数化 · 转义 · 路径归一化后检查
query("SELECT * FROM users WHERE id = ?", [input.id])
render(escapeHtml(input.comment))
path = normalize(baseDir + "/" + input.filename)
assert path startsWith baseDir              // 在允许目录之外则拒绝
```

### 2-3. 危险输出(HTML 等)用经过验证的工具净化
- 若必须允许 HTML 输入,用经过验证的净化工具**只放行允许的标签·属性**并移除其余。
- 不要用自制正则去过滤 `<script>` 之类 —— 会被编码·嵌套·事件处理器等绕过。

```text
// ❌ 禁止 — 用自制正则移除标签 (可绕过)
stripTags(userHtml)

// ✅ 推荐 — 用经过验证的净化器只放行允许的标签·属性
allowTags  = { b, i, em, strong, a, p, br }
allowAttrs = { a: [href, title] }
clean = sanitize(userHtml, allowTags, allowAttrs)
```

### 2-4. 文件上传要多重校验 + 安全存储
- 用白名单校验扩展名·MIME 类型·大小,并确认**实际内容(魔数)** 以阻止伪装文件。
- 不把上传文件存到 Web 根(可通过直接 URL 执行/提供的位置),不照搬文件名(使用服务端生成的名称,阻止路径逃逸)。

```text
// ❌ 禁止 — 只看扩展名就信任,以原文件名存到 Web 根
save(file, webroot + "/" + file.name)

// ✅ 推荐 — 扩展名 + MIME + 魔数 + 大小,存到安全位置
assert ext  ∈ allowedExts
assert mime ∈ allowedMimes
assert magicBytes(file) matches declaredType    // 阻止伪装文件
assert size <= maxSize
save(file, nonWebrootDir + "/" + generatedName) // 不使用原文件名
```

## 3. 常见错误

> 只信客户端校验·遗漏进入点校验等一般陷阱参考 `validation-bean`。以下为安全特有陷阱。

- **用黑名单只拦截危险值** → 无法阻止新的绕过模式。用白名单。
- **假设校验过就安全而照样使用** → 校验与输出处理是两码事。查询要参数化,HTML 要转义。
- **用自制正则移除 HTML/脚本** → 经编码·嵌套绕过 XSS。用经过验证的净化器。
- **只看扩展名/MIME 就信任文件** → 伪装文件可能被执行。要确认到魔数。
- **以原名把上传文件存到 Web 根** → 上传的脚本可能被执行或发生路径逃逸。
- **把输入照样拼接到路径/文件名** → 用 `../` 逃出目录。归一化后检查允许范围。
- **在错误响应中暴露内部信息** → 不照样输出堆栈跟踪·实现细节(参考 `validation-bean`)。

## 4. 检查清单

> 服务端校验·声明式 schema 等一般项用 `validation-bean` 检查清单。以下为安全特有项。

- [ ] 是否用**白名单(允许列表)** 方式强制格式·枚举·范围(禁止依赖手写正则)
- [ ] 是否对 DB 查询做**参数化/绑定**,不把输入作为字符串拼接(SQL Injection)
- [ ] 是否按输出上下文对 HTML 输出值做**转义/编码**(XSS)
- [ ] 是否对进入文件路径/名的输入归一化后检查**是否在允许范围内**(Path Traversal)
- [ ] HTML 输入是否用**经过验证的净化器**只放行允许的标签·属性
- [ ] 是否对文件上传的扩展名·MIME·**魔数**·大小全部校验
- [ ] 是否把上传文件以服务端生成的名称存到 **Web 根之外**
- [ ] 校验失败是否为**拒绝(fail-closed)**,且响应中不暴露内部信息

## 附录:按技术栈的示例

> 以下为参考用实现示例。按你团队使用的技术栈以相同模式添加。上面 1~4 的原则与规则是标准,附录只是其应用实例。

### Python (Pydantic) — 声明式 schema 校验

```python
# ✅ 권장 — 선언적 스키마로 구조·타입·범위를 강제
from pydantic import BaseModel, EmailStr, constr, validator

class CreateUserRequest(BaseModel):
    name: constr(min_length=1, max_length=100)
    email: EmailStr
    age: int = Field(ge=0, le=150)
    role: Literal["user", "admin"]  # 화이트리스트 강제

    @validator("name")
    def name_no_html(cls, v):
        if "<" in v or ">" in v:
            raise ValueError("이름에 HTML 태그를 사용할 수 없습니다.")
        return v
```

### TypeScript/JavaScript (Zod) — 声明式 schema 校验

```typescript
// ✅ 권장 — safeParse 로 검증하고 실패 시 400 응답
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});

const result = createUserSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.flatten() });
}
```

### Python — 文件上传安全

校验扩展名·MIME 类型·大小,并用魔数确认实际格式。

```python
# ✅ 권장 — 화이트리스트로 확장자·MIME·크기를 모두 검증
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def validate_upload(file):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("허용되지 않는 파일 형식입니다.")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError("MIME 타입이 올바르지 않습니다.")
    if file.size > MAX_FILE_SIZE:
        raise ValueError("파일 크기는 10MB 이하여야 합니다.")
    # 매직 바이트로 실제 형식 추가 검증 권장 (python-magic 라이브러리)
```

### Python (bleach) — HTML 净化

```python
# ❌ 금지 — 자체 정규식으로 태그를 거르려는 시도 (우회 가능)
# ✅ 권장 — 검증된 라이브러리(bleach)로 허용 태그·속성만 통과
import bleach

ALLOWED_TAGS = ["b", "i", "em", "strong", "a", "p", "br"]
ALLOWED_ATTRS = {"a": ["href", "title"]}

clean_html = bleach.clean(user_html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS)
```

> 若需在前端(浏览器)渲染 HTML 前进行净化,使用 DOMPurify 这类经过验证的库。
