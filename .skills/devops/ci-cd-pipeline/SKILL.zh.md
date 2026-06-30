---
name: CI/CD 流水线标准
description: 持续集成/部署(CI/CD)流水线的通用标准 — 阶段分离(lint→test→build→scan→deploy)与前序阶段失败时的阻断、分支保护合并门禁、环境分离·production 手动审批、不可变制品标记·回滚、密钥管理、缓存。与特定 CI 工具无关。构建流水线或决定阶段·审批·回滚时阅读。关键词: CI, CD, pipeline, build, deploy, branch protection, manual approval, artifact, rollback, GitHub Actions, GitLab CI.
rules:
  - "用自动校验作为合并门禁:强制分支保护规则,使每个变更(PR/MR)只有通过 CI 才能合并到集成分支。只跑 CI 而没有保护规则毫无意义,因为失败也会被合并。"
  - "分离阶段并快速失败(fail-fast):把流水线拆分为 lint→test→build→安全扫描→deploy,前序阶段失败时跳过后续阶段。把廉价且快速的校验(lint)放前面,昂贵的校验(build·deploy)放后面。"
  - "分离环境且 production 须手动审批:分离 dev·staging·production 部署。production 部署必须经过人的明确审批(manual approval),使故障不会在未经校验时传播。"
  - "一次构建并提升制品(build once, promote):构建产物用基于内容/提交的唯一标签来标识,不要为每个环境重新构建,而是提升同一个制品。这样可追踪部署了哪个版本,并能回滚到先前版本。"
  - "密钥来自密钥存储,禁止在日志中暴露:凭据放在 CI 平台的密钥管理功能(或外部密钥存储)中,并确认它们在流水线日志中被掩码。绝不在明文环境变量·代码·日志中暴露密钥。"
  - "可复现且快速:依赖基于锁文件(lock)确定性安装,用缓存降低重复成本。流水线定义以代码形式做版本管理(pipeline as code)。"
tags:
  - "CI"
  - "CD"
  - "pipeline"
  - "build"
  - "deploy"
  - "branch protection"
  - "manual approval"
  - "artifact"
  - "rollback"
  - "GitHub Actions"
  - "GitLab CI"
  - "github-actions"
  - "workflow"
  - ".github/workflows"
  - "on: push"
---

# 🚀 CI/CD 流水线标准

> 把从 lint 到部署的流水线拆分为阶段并自动化,只让通过校验的变更以一致的质量发布。用分支保护阻断合并,用手动审批阻断 production 部署,并对制品做可追踪的标记以保证回滚。新建流水线或决定阶段·环境分离·审批·密钥·回滚时阅读。这是不依赖特定 CI 工具(GitHub Actions·GitLab CI·Jenkins 等)的通用标准。

## 1. 核心原则
- **用自动校验作为合并门禁**:强制分支保护规则,使每个变更(PR/MR)只有通过 CI 才能合并到集成分支。只跑 CI 而没有保护规则毫无意义,因为失败也会被合并。
- **分离阶段并快速失败(fail-fast)**:把流水线拆分为 lint→test→build→安全扫描→deploy,前序阶段失败时跳过后续阶段。把廉价且快速的校验(lint)放前面,昂贵的校验(build·deploy)放后面。
- **分离环境且 production 须手动审批**:分离 dev·staging·production 部署。production 部署必须经过人的明确审批(manual approval),使故障不会在未经校验时传播。
- **一次构建并提升制品(build once, promote)**:构建产物用基于内容/提交的唯一标签来标识,不要为每个环境重新构建,而是提升同一个制品。这样可追踪部署了哪个版本,并能回滚到先前版本。
- **密钥来自密钥存储,禁止在日志中暴露**:凭据放在 CI 平台的密钥管理功能(或外部密钥存储)中,并确认它们在流水线日志中被掩码。绝不在明文环境变量·代码·日志中暴露密钥。
- **可复现且快速**:依赖基于锁文件(lock)确定性安装,用缓存降低重复成本。流水线定义以代码形式做版本管理(pipeline as code)。

## 2. 规则

### 2-1. 把通过 CI 强制为合并条件(分支保护)
- 对集成分支(main/develop 等)施加保护规则,使必需的 CI 检查必须通过才能合并。
- 不要存在"CI 在跑但失败也能合并"的状态 — 检查结果必须作为门禁起作用。

```text
// ❌ 禁止 — CI 在跑但失败也能合并(无门禁)
PR → CI 失败 → 合并按钮仍可点击

// ✅ 推荐 — 把通过必需检查作为合并的前提条件强制执行
PR → 仅在必需 CI 检查通过后才允许合并
```

### 2-2. 串行化阶段,前序阶段失败时阻断后续
- 把流水线拆分为 lint→test→build→安全扫描→deploy 阶段,显式声明阶段间依赖,使前序阶段失败时不执行后续阶段。
- 不要把所有东西塞进一个 job 而使"在哪里坏的"变得模糊。把快速校验放前面以尽快得到反馈。

```text
// ❌ 禁止 — 把全部塞进一个 job,即使 lint 失败也跑到底,浪费时间
job all: lint; test; build; scan; deploy   // 不清楚哪里坏了

// ✅ 推荐 — 阶段分离 + 依赖,前序阶段失败时跳过后续
lint → test → build → scan → deploy        // 每个阶段依赖前一阶段的成功
```

### 2-3. 环境分离 + production 手动审批
- 即使是同一个制品,也分离 dev·staging·production 的部署路径,并把各环境的配置/密钥按环境隔离。
- 不要让 production 部署自动流过,而要经过人的明确审批。明确哪个分支/条件去往哪个环境。

```text
// ❌ 禁止 — 合并到集成分支即自动部署到 production
merge → 自动部署到 production           // 未经校验,故障传播

// ✅ 推荐 — 环境分离 + production 手动审批门禁
develop → 自动部署到 staging
main    → (手动审批) → 部署到 production
```

### 2-4. 制品标记 + 回滚(一次构建,提升)
- 给构建产物附加基于内容/提交的唯一标签,以追踪哪个版本部署到了哪里。
- 不要为每个环境重新构建,而是提升同一个制品,并保留它以便能立即回滚到上一个正常版本。

```text
// ❌ 禁止 — 无标签且为每个环境重新构建 → 回滚目标不明确
staging:    build → deploy
production: build(再次) → deploy        // 无法追踪已部署版本·回滚目标

// ✅ 推荐 — 用唯一标签一次构建后提升,可回滚
build → artifact:<commit-hash>
staging/production 都提升同一个 artifact:<commit-hash>
回滚 = 重新部署上一个正常标签
```

### 2-5. 密钥来自密钥存储,日志掩码
- 从 CI 平台的密钥管理功能(或外部密钥存储)注入凭据·令牌·密钥,并按环境分离。
- 确认密钥在流水线日志中被掩码,绝不在明文环境变量·源代码·日志中暴露。

```text
// ❌ 禁止 — 把密钥以明文暴露在代码/日志中
DEPLOY_TOKEN = "ghp_xxxxxxxx"          // 代码/日志中明文 → 泄露
echo $DEPLOY_TOKEN                      // 原样打印到日志

// ✅ 推荐 — 从密钥存储注入,确认日志掩码
DEPLOY_TOKEN = <从 secret store 注入>  // 日志中掩码为 ***
```

### 2-6. 确定性安装 + 缓存以优化速度
- 依赖基于锁文件(lock)确定性安装,以保证构建可复现性。
- 缓存依赖·构建产物以降低重复成本,但把缓存键关联到内容(如锁文件哈希),以免错误地使用陈旧缓存。

```text
// ✅ 推荐 — 基于 lock 的确定性安装 + 基于内容的缓存键
install(lockfile)                       // 相同输入 → 相同结果
cache key = hash(lockfile)              // lock 变化时使缓存失效
```

## 3. 常见错误
- **没有分支保护只跑 CI** → 检查失败也会被合并,无法作为门禁。
- **不分离阶段** → 即使 lint 失败,test·build·deploy 也照跑,浪费时间,并模糊了在哪里坏的。
- **自动部署到 production** → 未经人工校验就直接部署,故障原样传播。设置手动审批门禁。
- **把密钥暴露在明文环境变量·日志中** → 凭据泄露。从密钥存储注入并确认日志掩码。
- **制品没有唯一标签 / 为每个环境重新构建** → 不清楚部署了哪个版本·回滚目标。一次构建并标记后提升。
- **缓存键未关联到内容** → 即使依赖变化也使用陈旧缓存,导致构建出错。
- **只在 UI 中手动配置流水线** → 没有变更历史·评审。把流水线定义以代码形式做版本管理。

## 4. 检查清单
- [ ] 是否有把通过 CI 作为合并条件的**分支保护规则**?
- [ ] 是否分离了 **lint→test→build→安全扫描→deploy** 阶段,并在前序阶段失败时跳过后续?
- [ ] 是否**分离了** dev·staging·production **环境**,且 production 经过**手动审批**?
- [ ] 是否用**唯一标签**标识制品,一次构建后提升,并能**回滚**?
- [ ] 是否用**密钥存储**管理密钥,并确认在日志中被**掩码**?
- [ ] 是否**基于锁文件**确定性安装依赖,并用**缓存**优化?
- [ ] 是否把流水线定义**以代码形式做版本管理**?

> 安全扫描阶段的扫描器选择·严重度阈值·门禁策略遵循 `의존성 보안 스캐닝 (SCA)` 标准(这里只决定阶段放置·失败时阻断)。输入值校验·异常响应等各阶段细则参考相应技能(`validation-bean` 等)。

## 附录:各技术栈示例

> 以下是供参考的实现示例。上面 1~4 的原则·规则才是标准,附录只是其应用案例。按相同模式添加符合团队所用 CI 工具(如 GitLab CI、Jenkins、CircleCI 等)的示例。

### GitHub Actions (GitLab CI 等)

用 `needs` 串行化阶段,使前序阶段失败时跳过后续阶段。

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v4

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with: { name: "dist-${{ github.sha }}", path: "dist/" }

  security:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # 扫描器选择·严重度阈值·门禁策略遵循 `의존성 보안 스캐닝 (SCA)` 标准。
      # 这里只决定"放置":在 build 之后放置 scan 阶段,并在超过阈值时使构建失败。
      - run: # 运行 SCA 扫描(超过阈值时 exit≠0)
```

#### 部署流水线(环境分离 + 手动审批)
```yaml
  deploy-staging:
    needs: security
    if: github.ref == 'refs/heads/develop'
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: "dist-${{ github.sha }}" }
      # 部署命令...

  deploy-production:
    needs: security
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://app.example.com
    runs-on: ubuntu-latest
    # environment 设置 → 在 GitHub 中要求手动审批
    steps:
      # 部署命令...
```

#### 分支策略
```
feature/* → develop → PR Review → 自动部署到 staging
                    → main → 手动审批后部署到 production
hotfix/*  → main → 手动审批后部署到 production
```

#### 用缓存优化速度
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-
```
