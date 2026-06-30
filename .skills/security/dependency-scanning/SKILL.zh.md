---
name: 依赖安全扫描 (SCA)
description: 通过软件成分分析(SCA)检测、追踪并修补第三方依赖中已知漏洞的通用(foundational)自动化标准。涵盖 CI 门禁、自动修补 PR、基于严重度的优先级、锁文件与依赖的分离。在将漏洞扫描集成进 CI、设置依赖自动更新或采用新库时阅读。
rules:
  - "自动且持续地检测:漏洞数据库每天更新,因此一次性检查不够。通过 CI 和定期计划反复运行,捕获新公开的漏洞。"
  - "严重就拦截,补丁拉进来:对达到一定严重度以上的在构建中设门禁(仅警告则没人看),让自动化工具以 PR 形式提交安全补丁,人专注于审查与合并。"
  - "让攻击面更小且可复现:提交锁文件以便处处得到相同的依赖树,生产环境只放运行时依赖,新库在引入前先验证。"
tags:
  - "npm audit"
  - "pip-audit"
  - "dependabot"
  - "renovate"
  - "CVE"
  - "package-lock"
  - "requirements.txt"
  - "SBOM"
foundational: true
---

# 🛡️ 依赖安全扫描 (SCA)

> 自动检测、追踪并修补隐藏在第三方依赖中的已知漏洞,并在构建阶段拦截严重的漏洞。在为 CI 流水线接入扫描、设置依赖自动更新或采用新库时阅读。它是一个不绑定特定包管理器(npm/pip/Maven 等)或 CI 工具(GitHub Actions/Dependabot 等)的通用标准。版本固定、范围策略等依赖本身的管理规则请一并参阅 `dependency-management`。

## 1. 核心原则

出发点只有一个 —— **你拉入的每一个第三方包(以及它进而拉入的传递依赖)都是攻击面。** 不假设"别人做的所以安全"。由此推出以下几点。

- **自动且持续地检测**:漏洞数据库每天更新,因此一次性检查不够。通过 CI 和定期计划反复运行,捕获新公开的漏洞。
- **严重就拦截,补丁拉进来**:对达到一定严重度以上的在构建中设门禁(仅警告则没人看),让自动化工具以 PR 形式提交安全补丁,人专注于审查与合并。
- **让攻击面更小且可复现**:提交锁文件以便处处得到相同的依赖树,生产环境只放运行时依赖,新库在引入前先验证。

具体实践在 §2 规则中以 ✅/❌ 阐述。

## 2. 规则

### 2-1. 不无条件信任外部依赖
- 不要假设"被广泛使用的包所以安全",而是把直接依赖和传递依赖都视为扫描对象。
- 漏洞不仅出现在你直接调用的包中,也出现在那些包拉入的深层依赖中。要连传递依赖一起检测。

```text
// ❌ 禁止 — "因为有名"就不检查直接添加了事
add some-popular-pkg            // 不知道带来什么漏洞就使用

// ✅ 推荐 — 把直接依赖与传递依赖都作为漏洞扫描对象
scan(all dependencies incl. transitive) → 只用通过的
```

### 2-2. 将漏洞扫描集成进 CI,严重就拦截构建
- 让依赖漏洞扫描在每次 PR/构建时自动运行,并且不只一次,而要按定期计划再次运行,以便即使代码不变也能捕获新漏洞。
- 当发现达到设定严重度阈值(例如 CRITICAL)以上的项时,使流水线**失败**。不要只留警告就放行。
- 把扫描阶段放在流水线的何处、失败时如何阻断后续(阶段串行化、fail-fast)遵循 `CI/CD 流水线标准`。本标准定义"在何种严重度拦截什么"(扫描器、阈值、门禁策略)。

```text
// ❌ 禁止 — 扫描结果只打日志,始终放行
scan(deps); build_status = SUCCESS    // 即使有 CRITICAL 也照样部署

// ✅ 推荐 — 达到阈值以上则流水线失败(门禁)
result = scan(deps)
if result.maxSeverity >= CRITICAL: fail build   // 阻断流入生产
```

### 2-3. 以自动建议接收安全补丁
- 启用依赖自动更新工具,以自动变更请求(PR/MR)接收有漏洞依赖的安全补丁。
- 把安全更新单独归组,优先审查与合并。让人不必手动追踪漏洞通告。

```text
// ❌ 禁止 — 人手动追踪通告,最终漏补丁、延迟
"总会有人偶尔升一下依赖版本吧"      // 安全补丁被搁置数月

// ✅ 推荐 — 自动化工具提交补丁 PR,人审查与合并
auto-update tool → opens PR(安全补丁) → 审查后合并
```

### 2-4. 漏洞优先级与响应期限(SLA)
- 按标准严重度评分(例如 CVSS)设定响应期限,从致命的开始处理。
- **"越严重越快"是原则,具体期限由团队设定。** 下表只是起点示例,请按风险容忍度调整阈值与期限。

| 严重度(例如 CVSS) | 等级 | 响应期限 —— 示例(团队调整) |
|-----------------|--------|----------------|
| 9.0–10.0 | CRITICAL | 最快(例如数日内) |
| 7.0–8.9 | HIGH | 尽快(例如 1~2 周内) |
| 4.0–6.9 | MEDIUM | 纳入计划(例如一个月内) |
| 0.1–3.9 | LOW | 下个版本 |

### 2-5. 采用新库的标准
- 新库在采用前要确认其维护活跃度、流行度、许可证及已有漏洞。
- 被弃置(长期未更新、问题无响应)的包不采用,因为它对未来的漏洞拿不到补丁。

```text
// ❌ 禁止 — 把最后更新久远、问题被搁置、漏洞未确认的包直接添加
add some-abandoned-pkg

// ✅ 推荐 — 采用前检查后再添加
// - 最后更新:最近(例如 6 个月以内)
// - 问题/PR 响应速度:合理
// - 用量/流行度:契合项目性质
// - 许可证:符合公司政策(注意限制性许可证)
// - 无已知漏洞(采用前以扫描事先确认)
scan(candidate) → 无异常则 add trusted-pkg
```

### 2-6. 提交锁文件并分离生产/开发依赖
- 始终把固定了精确解析版本的锁文件提交到版本管理,以保证可复现的构建。
- 生产产物只包含运行时所需的依赖,排除构建、测试、lint 用的开发依赖。

```text
// ❌ 禁止 — 锁文件不提交 + 生产含开发依赖
ignore(lockfile)                 // 各环境版本不同 → 不可复现
build(prod, include dev deps)    // 不必要地扩大攻击面

// ✅ 推荐 — 提交锁文件 + 生产只放运行时依赖
commit(lockfile)                 // 在哪构建都是相同的依赖树
build(prod, runtime deps only)   // 排除开发依赖
```

## 3. 常见错误

只挑出明知规则却常犯的陷阱(规则的重复从略)。

- **只看直接依赖** → 漏洞更常出现在你所调用的包进而拉入的传递依赖中。扫描范围务必包含传递依赖。
- **把扫描结果只当警告处理** → 即使有 CRITICAL 也放行构建,就没人看。达到阈值以上以门禁拦截才有意义。
- **以为通过一次就完事** → 即使不改代码,新漏洞也每天公开。没有定期计划扫描就会被原样搁置。
- **忽视严重度的一刀切处理** → 不分优先级地处理会延误对致命漏洞的响应。用按严重度的期限(§2-4)排队。

## 4. 检查清单
- [ ] 是否把直接依赖与传递依赖都视为漏洞扫描对象
- [ ] 是否将依赖扫描集成进 CI,并在达到临界严重度以上时使构建**失败**
- [ ] 即使代码无变更,是否按定期计划再次运行扫描
- [ ] 是否通过自动更新工具接收安全补丁变更请求(PR/MR)
- [ ] 是否设定并遵守与严重度(例如 CVSS)匹配的响应期限(SLA)
- [ ] 是否把锁文件提交到版本管理以保证可复现的构建
- [ ] 是否从生产产物中排除开发依赖
- [ ] 采用新库前是否确认其维护活跃度、流行度、许可证及已有漏洞

## 附录:按技术栈的示例

> 以下为参考用实现示例。上面 1~4 的原则与规则是标准,附录只是其应用实例。按你团队使用的技术栈(包管理器、CI 工具)以相同模式添加示例。

### 按工具的示例 (npm/pip/Dependabot 等)

#### CI 流水线集成

**npm (Node.js)**
```yaml
# GitHub Actions
- name: Security Audit
  run: npm audit --audit-level=critical
  # 有 CRITICAL 漏洞则退出码 1 → 构建失败
```

**Python**
```yaml
- name: Pip Audit
  run: |
    pip install pip-audit
    pip-audit --requirement requirements.txt --fail-on CRITICAL
```

**Java (Maven)**
```yaml
- name: OWASP Dependency Check
  run: mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=9
```

#### Dependabot 自动更新
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      security-updates:
        applies-to: security-updates
        patterns: ["*"]

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
```

#### 库采用前的检查 (npm 示例)

采用标准参见 §2-5。npm 中的预扫描命令:

```bash
# ❌ 不检查就添加被弃置的包
npm install some-abandoned-pkg

# ✅ 采用前事先确认漏洞后再添加 (可用 snyk test 等替代)
npm audit && npm install trusted-pkg
```

#### 提交锁文件与分离依赖 (npm 示例)

原则参见 §2-6。npm 中的命令:

```bash
# ✅ 提交锁文件 (poetry.lock, requirements.txt 同理)
git add package-lock.json

# ✅ 在生产构建中排除 devDependencies
npm ci --omit=dev
```
