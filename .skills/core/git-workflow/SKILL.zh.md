---
name: Git 工作流 — 分支策略 & 协作 (Git Workflow)
description: 一份与技术栈无关的协作指南，规定了基于主干的分支策略、小 PR、合并门槛(审查·CI 通过后)、rebase/merge·冲突解决、force-push·密钥排除规则。在切新作业分支、提交 PR 或处理合并·冲突时阅读。它是小 PR·分支·合并门槛的单一所有者文档(自审是 `code-review`，完成证明是 `verification-before-completion`)。关键词: git, branch, trunk-based, pull-request, CI, rebase, merge, force-push, gitignore, conflict, main。
rules:
  - "采用基于主干 — 让 main 始终保持可部署状态，作业在短命(理想为 1~2 天)分支上进行并快速合并。长寿命分支会养大冲突。"
  - "不要直接 push 到 main — 所有变更都经过分支 → PR。用分支保护阻止对 main 的直接 push·force-push。"
  - "PR 要小 — 一个 PR 只做一件事。小 PR 审查更快且更不易藏 bug。"
  - "合并前的门槛要两个都通过 — 至少 1 人审查批准 + CI(构建·测试·lint)绿灯。其中任一为红都不合并。"
  - "共享分支不要覆盖历史 — 禁止对他人会看到的分支(main·协作分支)force-push。rebase 只在自己的本地分支上。"
  - "不要提交密钥·构建产物 — 用 .gitignore 从一开始就排除。一旦推上去的秘密视为已泄露。"
tags:
  - "git"
  - "branch"
  - "trunk-based"
  - "pull-request"
  - "CI"
  - "rebase"
  - "merge"
  - "force-push"
  - "gitignore"
  - "conflict"
  - "main"
foundational: true
---

# 🌿 Git 工作流 — 分支策略 & 协作

> 把分支保持短小、且不通过审查·CI 就进不了 main 钉死，使得无论谁来作业，历史都干净、冲突都少。在切新分支、提交 PR 或处理合并·冲突时阅读。

AI 智能体和人最常犯的协作错误是 **直接 push 到 main、一次性丢上巨大的变更、用 force-push 推平共享分支**。起初看着快，但审查·回退·追溯原因会急剧变难。把流程钉成规则，智能体也会在这个框架内安全提交。

## 1. 核心原则

- 采用基于主干 — 让 main 始终保持可部署状态，作业在短命(理想为 1~2 天)分支上进行并快速合并。长寿命分支会养大冲突。
- 不要直接 push 到 main — 所有变更都经过分支 → PR。用分支保护阻止对 main 的直接 push·force-push。
- PR 要小 — 一个 PR 只做一件事。小 PR 审查更快且更不易藏 bug。
- 合并前的门槛要两个都通过 — 至少 1 人审查批准 + CI(构建·测试·lint)绿灯。其中任一为红都不合并。
- 共享分支不要覆盖历史 — 禁止对他人会看到的分支(main·协作分支)force-push。rebase 只在自己的本地分支上。
- 不要提交密钥·构建产物 — 用 `.gitignore` 从一开始就排除。一旦推上去的秘密视为已泄露。

## 2. 规则

### 2-1. 分支命名 & 保持短命

```
# ❌ 禁止 — 无意义的/长寿命分支
git checkout -b temp
git checkout -b my-work        # 搁置数周 → 合并地狱

# ✅ 推荐 — 类型/issue/摘要，作业完成就立即合并·删除
git checkout -b feat/142-login-rate-limit
git checkout -b fix/payment-null-amount
git checkout -b chore/bump-deps
```

- 格式示例: `<类型>/<issue编号>-<简短摘要>` (类型: feat·fix·chore·docs·refactor 等)。小写·kebab-case。
- 一个分支 = 一项作业。完成后合并并删除，让列表保持干净。

### 2-2. 保护 main & 经由 PR

```
# ❌ 禁止 — 直接向 main 提交·push
git switch main && git commit -m "..." && git push

# ✅ 推荐 — 在分支上作业 → push → 创建 PR
git switch -c feat/142-login-rate-limit
git push -u origin feat/142-login-rate-limit
# → 打开 PR 接受审查·CI
```

- 在仓库设置中对 main(以及 release 分支)施加 **分支保护**: 阻止直接 push、必须 PR、必须通过审查·CI。

### 2-3. 小 PR & 合并前门槛

```
# ❌ 禁止 — 把功能·重构·格式化放进一个 PR 涉及 90 个文件
# ✅ 推荐 — 目的单一，尽可能小。审查者一次能读完的量
```

- 必须同时满足审查批准 1+ & CI 绿灯 **两者** 才合并。不要以「以后再修」合并失败的 CI(禁止自我批准)。
- 提交前的自审(去除调试痕迹等)遵循 `code-review`，完成证明(DoD·确认 CI 绿灯)遵循 `verification-before-completion`。

### 2-4. rebase vs merge & 冲突解决

```
# ✅ 把自己的本地分支整理到最新 main 之上 (干净的直线历史)
git switch feat/142-login-rate-limit
git fetch origin
git rebase origin/main
# 冲突时: 修改文件 → git add <file> → git rebase --continue
#         要回退就 git rebase --abort

# ✅ 若保留共享历史很重要则 merge (留下合并提交)
git merge origin/main
```

- **rebase**: 用于整理尚未共享的自己的分支。历史会变成直线。
- **merge**: 当要保留已共享的历史时。遵循团队规则(直线 vs 合并提交)。
- 冲突绝不要盲目覆盖一方，要确认双方意图后解决。

### 2-5. 禁止 force-push (共享分支)

```
# ❌ 绝对禁止 — 破坏共享分支历史 (丢失他人的作业)
git push --force origin main

# ✅ 允许 — 在自己的个人分支上，且要用安全选项
git push --force-with-lease origin feat/142-login-rate-limit
```

- `--force-with-lease` 在此期间他人若有 push 则拒绝 → 防止覆盖事故。即便如此也不要用在共享分支上。

### 2-6. .gitignore — 排除密钥·产物

```gitignore
# ❌ 不该被提交的东西 (示例)
.env
.env.*
*.key
*.pem
secrets/

# 构建产物·依赖·本地缓存
dist/
build/
node_modules/
*.log
.DS_Store
```

- 秘密(.env·密钥·令牌)和构建产物·依赖文件夹从一开始就不要追踪。
- 若不小心提交了秘密: 立即吊销·轮换密钥(即便从历史中抹掉也视为已暴露)。

### 2-7. 频繁地·按意义单位提交

```
# ❌ 禁止 — 攒一整天后来一个巨大的一次性提交
# ✅ 推荐 — 以能运行的小单位频繁提交 → push
```

- 小而频繁的提交让审查·回退·追溯原因(`git bisect`)更容易。
- 提交消息格式(类型·标题·正文规则)遵循 `coding-styles`。

## 3. 常见错误

审查时筛掉。

- ❌ 直接 push 到 main 或不加保护放任
- ❌ 混杂数百文件·多个目的的巨大 PR
- ❌ CI 红灯·无审查就合并
- ❌ 用 `--force` 推平共享分支丢失他人的提交
- ❌ 不确认双方意图就把冲突覆盖到一方
- ❌ 提交 `.env`·密钥·`node_modules`·`dist`
- ❌ 不删除已合并的分支导致列表堆积到数百个

> **应用技巧**: 在仓库托管(GitHub/GitLab 等)上开启分支保护·必须审查·必须 CI，即便人·智能体忘记规则，系统也会拦住。消息约定可与 `coding-styles` 一起看，变更审查标准可与 `architecture-layering` 一起看。

## 4. 检查清单

- [ ] 是否在短命分支而非 main 上作业，分支名是否遵循 `类型/摘要` 规则?
- [ ] PR 是否围绕单一目的小幅拆分?
- [ ] 是否同时通过了审查批准 1+ 与 CI(构建·测试·lint)绿灯?
- [ ] 是否没有对共享分支 force-push (个人分支用 `--force-with-lease`)?
- [ ] `.env`·密钥·令牌·构建产物是否没混进提交 (检查 `.gitignore`)?
- [ ] 合并后是否删除了作业分支?
