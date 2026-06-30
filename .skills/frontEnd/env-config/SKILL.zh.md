---
name: 环境变量 (Env Config)
description: 涵盖 .env 优先级·按环境分离·secret 与公开配置分离·客户端暴露范围控制·模板/校验的环境变量通用标准,与构建工具/框架无关。在添加·整理环境变量时、按环境分离配置时、防止密钥暴露时阅读。
rules:
  - "配置与代码分离: 各环境不同的值(API 地址·功能开关·密钥)不要硬编码在代码里,而是外置为环境变量。让同一构建/镜像只换环境即可复用。"
  - "按环境分离: 为开发·预发·生产等每个环境准备独立的配置文件/来源,并在构建/运行时显式选择是哪个环境。禁止在构建前手动替换某一个文件的方式。"
  - "明确优先级: 多个 .env 文件重叠时,定下什么覆盖什么的规则。一般越具体·越本地的越优先(例如 *.local > 按环境 > 公共)。"
  - "分隔 secret 与公开配置: 不要把密钥(API key·DB 凭据·令牌签名密钥等)与可公开的配置(公开 API 地址·应用版本)混在同一通道。secret 用独立通道/密钥管理器管理。"
  - "控制客户端暴露范围: 进入前端打包的变量要假定任何人都能提取。流向客户端的值只限于显式标记的(前缀·allowlist 等)公开值,其余只在构建/服务端时使用。"
  - "需要密钥的调用在服务端进行: 若结构要求客户端直接持有 secret,那就是设计错了。需要密钥的外部调用由后端/BFF 代理。"
  - "不提交本地 override: 混有个人本地值(*.local 等)和 secret 的文件不要上传到 VCS。改为提交告知需要填什么的模板(.env.example)。"
  - "校验存在·格式: 让必需变量缺失或格式错误在启动时迅速暴露,而不是在运行时深处(类型定义·schema 校验·启动时检查)。"
tags:
  - "import.meta.env"
  - "VITE_"
  - "process.env"
  - ".env"
  - "envConfig"
---

# ⚙️ 环境变量 (Env Config)

> 把各环境(开发/预发/生产)不同的配置从代码中分离,严格分隔 secret 与公开配置,并控制流向客户端的值的暴露范围。在定义·加载·分支·安全处理环境变量时阅读。这是不依赖特定构建工具/框架的通用标准。

## 1. 核心原则
- **配置与代码分离**: 各环境不同的值(API 地址·功能开关·密钥)不要硬编码在代码里,而是外置为环境变量。让同一构建/镜像只换环境即可复用。
- **按环境分离**: 为开发·预发·生产等每个环境准备独立的配置文件/来源,并在构建/运行时显式选择是哪个环境。禁止在构建前手动替换某一个文件的方式。
- **明确优先级**: 多个 `.env` 文件重叠时,定下什么覆盖什么的规则。一般越具体·越本地的越优先(例如 `*.local` > 按环境 > 公共)。
- **分隔 secret 与公开配置**: 不要把密钥(API key·DB 凭据·令牌签名密钥等)与可公开的配置(公开 API 地址·应用版本)混在同一通道。secret 用独立通道/密钥管理器管理。
- **控制客户端暴露范围**: 进入前端打包的变量要假定**任何人都能提取**。流向客户端的值只限于显式标记的(前缀·allowlist 等)公开值,其余只在构建/服务端时使用。
- **需要密钥的调用在服务端进行**: 若结构要求客户端直接持有 secret,那就是设计错了。需要密钥的外部调用由后端/BFF 代理。
- **不提交本地 override**: 混有个人本地值(`*.local` 等)和 secret 的文件不要上传到 VCS。改为提交告知需要填什么的模板(`.env.example`)。
- **校验存在·格式**: 让必需变量缺失或格式错误在启动时迅速暴露,而不是在运行时深处(类型定义·schema 校验·启动时检查)。

## 2. 规则

### 2-1. 把配置从代码分离并按环境拆分
- 把各环境不同的值外置为环境变量,不要塞进源代码。
- 为每个环境(dev/staging/prod)准备独立来源,并在构建/运行时显式选择环境。

```text
// ❌ 禁止 — 在代码里硬编码环境值 / 在构建前手动替换某个文件
const API = "https://prod-api.example.com"   // 每次换环境都要改代码
只放一个 .env,部署前手动替换值

// ✅ 推荐 — 按环境配置 + 显式选择环境
.env.development / .env.staging / .env.production
build --env=staging   // 在构建/运行时选择是哪个环境
```

### 2-2. 定下文件优先级
- 多个配置文件重叠时的优先级,由团队达成共识并文档化。
- 一般原则: **越具体且越本地的值覆盖越通用的值。**

```text
// 优先级(高 → 低)示例
按环境-本地(.env.[env].local) > 按环境(.env.[env]) > 公共-本地(.env.local) > 公共(.env)
```

| 分类 | 适用范围 | VCS 提交 |
|---|---|---|
| 公共 | 所有环境默认值 | O (无 secret 时) |
| 公共-本地 | 所有环境,个人本地 override | **X** |
| 按环境 | 特定环境(dev/staging/prod) | O (无 secret 时) |
| 按环境-本地 | 特定环境 + 个人本地 | **X** |

### 2-3. 分隔 secret 与公开配置
- 不要把可公开的配置和密钥混在同一通道。
- secret 优先用密钥管理器/部署流水线注入,而非以明文放在环境变量文件里。

```text
// ❌ 禁止 — 把公开配置和 secret 以明文混在一个文件
PUBLIC_API_URL=https://api.example.com
DB_PASSWORD=super-secret        // 同一文件·同一通道

// ✅ 推荐 — 环境文件里只放公开配置,secret 走独立通道
PUBLIC_API_URL=https://api.example.com
# DB_PASSWORD 等密钥用密钥管理器/CI 注入来分离
```

> 密钥本身的保管·轮换·访问控制请一并参考 `secrets-management` 技能。

### 2-4. 控制客户端暴露范围
- 假定包含在前端打包中的值**会被公开**(可从打包中提取)。
- 显式区分要导出到客户端的变量(前缀·allowlist 等),其余变量则阻止在客户端被访问。

```text
// ❌ 禁止 — 把密钥放进客户端暴露变量 (原样嵌入打包)
CLIENT_OPENAI_API_KEY=sk-xxx     // 任何人都能从 dist 打包中提取

// ✅ 推荐 — 客户端只放公开值,密钥仅限服务端
CLIENT_API_URL=https://api.example.com   // 公开 OK
OPENAI_API_KEY=sk-xxx                     // 仅在服务端环境,不流向客户端
```

### 2-5. 需要密钥的调用通过后端/BFF 代理
- 不要构建让客户端直接持有 secret 去调用外部 API 的结构。
- 需要密钥的调用由服务端(后端/BFF)代为执行,客户端只调用自家服务器。

```text
// ❌ 禁止 — 浏览器用 secret 直接调用外部 API
browser ──(API key)──▶ 外部支付/AI API

// ✅ 推荐 — 服务器持有 secret 并代理
browser ──▶ 我方服务器(BFF) ──(secret)──▶ 外部 API
```

### 2-6. 本地 override·secret 不提交,提交模板
- 把混有个人本地值(`*.local` 等)和 secret 的文件用 `.gitignore` 排除。
- 提交一个值为空的模板(`.env.example`),让新人知道要填什么。

```text
// .gitignore (概念)
*.local            // 排除个人本地 override
.env               // 若混入 secret,公共文件也排除,只提交 example

// .env.example (用于提交的模板 — 只有键,值留空)
PUBLIC_API_URL=
PUBLIC_APP_VERSION=
```

### 2-7. 在启动时校验必需变量的存在·格式
- 为了让必需变量缺失·格式错误不在运行时深处爆发,使其在启动时快速失败。
- 设置类型定义/schema 校验,让哪个变量需要什么格式在一处可见。

```text
// ❌ 禁止 — 缺失的变量很久之后才在运行时以 undefined 被发现
fetch(config.apiUrl + "/x")   // apiUrl 未设置 → 调用 "undefined/x"

// ✅ 推荐 — 启动时校验必需变量,缺失则立即失败
assert env.PUBLIC_API_URL is set and is URL   // 在启动阶段 fail-fast
```

## 3. 常见错误
- **把 secret 放进客户端暴露变量** → 从打包中被提取而泄露。密钥仅限服务端,暴露变量只放公开值。
- **提交本地/secret 文件** → 密钥泄露·环境污染。`*.local` 和混有 secret 的文件要 ignore。
- **未维护 `.env.example`** → 新人不知道要填什么。提交只含键的模板。
- **不区分环境而手动替换一个文件** → 每次部署都有人为错误。按环境分离并显式选择环境。
- **环境名拼写错误导致分支失败** (`producton`) → 期望的环境配置不生效。用常量/类型收口。
- **不知道暴露规则(前缀·allowlist)就访问变量** → 在客户端浪费时间调试 `undefined`。先确认暴露规则。
- **混淆各构建工具的访问方式** → 用非构建工具规定的访问通道去读,总是 `undefined`。确认技术栈的规则。
- **省略必需变量校验** → 缺失会在运行时深处爆发。在启动时校验。

## 4. 检查清单
- [ ] 是否把各环境不同的值从代码分离并外置为环境变量
- [ ] 是否按环境(dev/staging/prod)分离配置并**显式选择环境**(禁止手动替换)
- [ ] 是否定下了重叠配置文件的**优先级**
- [ ] 是否把 secret 与公开配置分离到**不同通道**(secret 用密钥管理器/注入)
- [ ] 是否把进入客户端打包的变量**只限于公开值**(暴露范围控制)
- [ ] 是否把需要密钥的调用通过后端/BFF 代理(让客户端不直接持有 secret)
- [ ] 是否把本地 override·secret 文件放进 `.gitignore`,并提交了 **`.env.example` 模板**
- [ ] 是否在**启动时**校验必需变量的存在·格式(类型定义/schema)

## 附录: 各技术栈示例

> 以下是参考用的实现示例。按团队所用的技术栈(例如 Next.js, Webpack/CRA, Node 服务器, Vite 等)以相同模式添加示例。上面 1~4 的原则·规则是标准,附录只是其应用案例。

### Vite (Vue)

> 这里只承载用 Vite 实现正文 1~4 原则·规则时的**技术栈具体值(文件名·前缀·命令·API)**。优先级·secret 分离·暴露控制等的「为什么」看正文。

#### 文件优先级 (正文 2-2 的 Vite 具体值)

后出现的文件**覆盖**先出现的。优先级(高 → 低): `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

| 文件 | 加载时机 | git 提交 |
|---|---|---|
| `.env` | 所有模式 | O |
| `.env.local` | 所有模式 (本地 override) | **X** |
| `.env.[mode]` | 对应模式 (`development`/`production`/`staging`) | O |
| `.env.[mode].local` | 对应模式 + 本地 | **X** |

#### `VITE_` 前缀 = 客户端暴露通道 (正文 2-4 的 Vite 具体值)

暴露给客户端(`import.meta.env`)的变量必须以 `VITE_` 开头,其余变量只在构建时使用。

```dotenv
# .env
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0

# 不暴露 (仅在 Vite plugin 中访问)
SENTRY_AUTH_TOKEN=xxx
```

#### 模式切换

```bash
vite                              # development 模式 (加载 .env.development)
vite --mode staging               # staging 模式 (加载 .env.staging)
vite build                        # production 模式 (加载 .env.production)
vite build --mode staging         # staging 构建
```

`package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build:staging": "vite build --mode staging",
    "build": "vite build"
  }
}
```

#### 各环境 API URL 矩阵

| 文件 | VITE_API_URL | VITE_SENTRY_DSN |
|---|---|---|
| `.env.development` | http://localhost:8080/api | (empty) |
| `.env.staging` | https://staging-api.example.com | staging DSN |
| `.env.production` | https://api.example.com | prod DSN |

#### 使用 (`import.meta.env`)

```javascript
// src/utils/axios.js
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000
})
export default api
```

内置变量: `import.meta.env.MODE`(当前模式)、`.DEV`/`.PROD`(boolean)、`.BASE_URL`(app base URL)。模式分支用 `import.meta.env.DEV`/`.PROD`。

#### 类型定义 (正文 2-7 — 启动校验的 Vite 方式)

```typescript
// src/env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_VERSION: string
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### Secret 分离 (正文 2-4·2-5 — `VITE_` 会原样嵌入构建产物)

```dotenv
# BAD - 可从客户端打包中提取
VITE_OPENAI_API_KEY=sk-xxx

# GOOD - 仅在服务端 .env,secret 调用从 BFF 代理
OPENAI_API_KEY=sk-xxx
```

详情参考 `security-frontend` skill。

#### `.gitignore` (正文 2-6 的 Vite 具体值)

```gitignore
.env.local
.env.*.local
```
`.env`/`.env.[mode]` 仅在无 secret 时提交;若混入 secret,这些也 ignore,只提交 `.env.example`。

```dotenv
# .env.example (用于提交的模板 — 只有键,值留空)
VITE_API_URL=
VITE_APP_VERSION=
VITE_SENTRY_DSN=
```

#### Vite 特有的常见错误

- 用 `VITE_API_SECRET=xxx` 把密钥暴露到客户端。
- 把 `.env.local` 提交到 git。
- 使用 `process.env.VITE_API_URL`(Vite 只对 `import.meta.env` 生效)。
- 用 `import.meta.env.MODE` 分支时把模式名拼错 (`producton`)。
- 用 `import.meta.env` 访问无 `VITE_` 前缀的变量后,浪费时间调试 `undefined`。
