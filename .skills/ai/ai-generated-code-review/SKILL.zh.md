---
name: AI 生成代码审查·安全
description: 在合并·部署前审查 AI 智能体生成代码的检查清单。用于捕捉 AI 代码中常见的密钥泄露·幻觉依赖·脆弱的认证/支付逻辑·过度权限，从而在保持快速生成的同时确保安全。关键词: ai-code-review, vibe-coding, secret-scanning, dependency-hallucination, slopsquatting, owasp, code-review, sast, supply-chain, human-in-the-loop。
rules:
  - "认证·支付·权限·个人信息处理代码绝不直接信任 AI 输出，由人逐行审查。"
  - "确认 AI 添加的依赖(import/package)真实存在且可信 — 拦截不存在的包名幻觉(slopsquatting 的目标)。"
  - "提交前运行密钥扫描 — 防止 AI 硬编码的 API 密钥·密码·令牌泄露到 .env 之外。"
  - "按 OWASP 标准确认 AI 生成代码是否具备输入校验·权限检查·错误处理(AI 倾向只写 happy-path)。"
  - "确认变更的代码路径有测试，并查看 AI 是否为通过测试而削弱断言。"
  - "大量变更要按文件逐一浏览统一 diff，捕捉意外的文件修改·删除。"
  - "将安全工具(secret scanning, SAST, 依赖漏洞扫描)纳入 CI，以补强人工审查。"
tags:
  - "ai-code-review"
  - "vibe-coding"
  - "secret-scanning"
  - "dependency-hallucination"
  - "slopsquatting"
  - "owasp"
  - "code-review"
  - "sast"
  - "supply-chain"
  - "human-in-the-loop"
---

# 🤖 AI 生成代码审查·安全

> 在合并·部署前安全地过滤 AI 生成的代码。当你用 vibe coding 快速生成代码但需要审查认证·支付·权限·依赖风险时阅读本文。

Vibe coding 能快速产出代码，但**AI 代码会看似合理地出错。**
在保持速度的同时防止事故，关键是把"接收前审查"自动化为一份检查清单。

## 1. 核心原则
- 认证·支付·权限·个人信息处理代码绝不直接信任 AI 输出，由人逐行审查。
- 确认 AI 添加的依赖(import/package)真实存在且可信 — 拦截不存在的包名幻觉(slopsquatting 的目标)。
- 提交前运行密钥扫描 — 防止 AI 硬编码的 API 密钥·密码·令牌泄露到 `.env` 之外。
- 按 OWASP 标准确认 AI 生成代码是否具备输入校验·权限检查·错误处理(AI 倾向只写 happy-path)。
- 确认变更的代码路径有测试，并查看 AI 是否为通过测试而削弱断言。
- 大量变更要按文件逐一浏览统一 diff，捕捉意外的文件修改·删除。
- 将安全工具(secret scanning, SAST, 依赖漏洞扫描)纳入 CI，以补强人工审查。

## 2. 规则

### 2-1. AI 代码中常见的陷阱

| 陷阱 | 症状 | 应对 |
|---|---|---|
| 密钥硬编码 | 把 API 密钥·密码直接写进代码 | 提交前密钥扫描 + 强制 .env |
| 幻觉依赖 | import 不存在的包 | 确认安装/实存(slopsquatting 目标) |
| 仅 happy-path | 缺少输入校验·错误处理 | 确认 OWASP 输入校验·权限检查 |
| 削弱断言 | 为通过测试删除/放松 assert | 审查测试 diff |
| 过度权限 | 全访问令牌·`chmod 777` | 确认最小权限原则 |

### 2-2. 绝不直接相信的领域

以下 AI 输出由**人逐行**审查:

- ✅ **认证/授权** — 令牌校验、会话、权限分支
- ✅ **支付** — 金额计算、幂等性、webhook 签名校验
- ✅ **个人信息(PII)** — 存储·日志·删除路径
- ✅ **破坏性操作** — DB 迁移、批量删除、部署

### 2-3. 用 CI 补强

人工审查会遗漏 — 把以下纳入 CI，让机器先做一次过滤:

- ✅ **Secret scanning** (gitleaks, trufflehog)
- ✅ **SAST** (Semgrep, CodeQL)
- ✅ **依赖漏洞·实存检查** (osv-scanner, npm audit)

> 快速生成 + 自动门禁 + 风险领域人工审查 = 把 vibe coding 安全地推上生产的公式。

## 3. 常见错误
- ❌ 把密钥硬编码进代码 → 用提交前密钥扫描 + 强制 `.env` 拦截。
- ❌ import 不存在的包(幻觉) → 确认安装/实存(slopsquatting 目标)。
- ❌ 只写 happy-path，缺少输入校验·错误处理 → 按 OWASP 标准确认。
- ❌ 为通过测试删除/放松断言 → 审查测试 diff。
- ❌ 全访问令牌·`chmod 777` 等过度权限 → 确认最小权限原则。

## 4. 检查清单
- [ ] 已按文件逐一浏览统一 diff(无意外修改/删除)
- [ ] 新增依赖真实存在且可信
- [ ] 密钥扫描通过(硬编码密钥为 0)
- [ ] 认证/支付/PII 代码由人直接阅读
- [ ] 变更路径有测试，且断言未被削弱
- [ ] 具备输入校验·权限检查·错误处理
