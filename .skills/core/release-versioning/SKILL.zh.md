---
name: 发布 & 版本管理 (Release & Versioning)
description: 软件发布的版本赋予（SemVer）·变更历史（CHANGELOG）·Git 标签·发布说明·废弃（deprecation）策略标准。与技术栈无关的通用标准，在提升版本、发布版本或整理变更历史时阅读。（REST API 契约版本委托给 `api-versioning-swagger`，依赖版本卫生委托给 `dependency-management`。）关键词: semver, MAJOR.MINOR.PATCH, CHANGELOG, git tag, release notes, breaking change, deprecation, conventional commits.
rules:
  - "遵守 SemVer: 以 MAJOR.MINOR.PATCH 赋予版本。兼容性破坏时提升 MAJOR，向后兼容的功能新增提升 MINOR，向后兼容的缺陷修复提升 PATCH。"
  - "维护变更历史: 所有发布都以用户影响为中心（Added/Changed/Fixed/Removed/Deprecated/Security）记录在 CHANGELOG 中。写『改了什么』，而不是罗列提交哈希。"
  - "不可变标签: 每次发布打一个 annotated Git 标签（vMAJOR.MINOR.PATCH），已发布的标签绝不移动或复用。"
  - "明示 Breaking change: 破坏兼容性的变更要在发布说明·CHANGELOG 顶部清楚标明，并一并写出迁移方法。"
  - "分阶段废弃: 不立即移除功能，而是按 deprecated 告知 → 宽限期 → 在下一个 MAJOR 中移除 的顺序进行。"
  - "注意 0.x: 1.0.0 之前（0.y.z）意味着公开 API 不稳定。若要承诺稳定性，则切出 1.0.0。"
tags:
  - "semver"
  - "MAJOR.MINOR.PATCH"
  - "CHANGELOG"
  - "git tag"
  - "release notes"
  - "breaking change"
  - "deprecation"
  - "conventional commits"
  - "Keep a Changelog"
---

# 🏷️ 发布 & 版本管理 (Release & Versioning)

> 为软件发布赋予一致的版本，以用户视角留下变更历史，并安全地进行废弃。在提升版本、发布版本或整理变更历史时阅读。这是不依赖特定语言/框架的通用标准。
>
> 边界: REST API 的契约版本（`/v1/`、Sunset 头）见 [api-versioning-swagger](../../backEnd/api-versioning-swagger/SKILL.md)，外部依赖的版本采纳·卫生见 [dependency-management](../dependency-management/SKILL.md)。本技能处理 **我所交付产物（应用·库·服务）的发布版本**。

## 1. 核心原则

- **遵守 SemVer**: 版本承载含义 — MAJOR（兼容破坏）·MINOR（向后兼容的功能）·PATCH（向后兼容的修复）。
- **维护变更历史**: 发布以用户影响为中心记录在 CHANGELOG 中。
- **不可变标签**: 已发布的标签不移动 — 可重现性与信任的基础。
- **分阶段废弃**: 用 deprecated → 宽限 → 移除 替代立即移除。

## 2. 规则

### 2-1. SemVer — 什么提升哪一位

| 变更 | 提升的位 | 示例 |
|------|------------|-----|
| 破坏兼容性的变更（移除签名·改变行为） | **MAJOR** | 1.4.2 → 2.0.0 |
| 向后兼容的功能新增 | **MINOR** | 1.4.2 → 1.5.0 |
| 向后兼容的缺陷修复 | **PATCH** | 1.4.2 → 1.4.3 |

- 提升 MAJOR 时 MINOR·PATCH 重置为 0（2.0.0）。提升 MINOR 时仅 PATCH 为 0。
- 预发布用 `1.5.0-rc.1`，构建元数据用 `1.5.0+build.42` 格式。

### 2-2. CHANGELOG — 不是提交日志而是“变更摘要”

推荐 [Keep a Changelog](https://keepachangelog.com) 格式。按类别归组:

```markdown
## [1.5.0] - 2026-06-24
### Added
- 会议日志多语言上传支持
### Fixed
- 在空目录下推荐停止的问题
### Deprecated
- `/api/legacy/export` — 计划在 1.7.0 中移除，请使用 `/api/export`
### Removed
- (无)
```

- ❌ 禁止: 原样粘贴 `git log`（哈希·合并提交对用户无意义）。
- ✅ 推荐: 用一行写“从用户/调用方视角看改了什么”。

### 2-3. Git 标签 — annotated + 不可变

```bash
# ✅ annotated 标签（保留作者·日期·消息）
git tag -a v1.5.0 -m "Release 1.5.0 — 多语言上传"
git push origin v1.5.0

# ❌ 移动已发布的标签（破坏可重现性 — 有人已经取得了 v1.5.0）
git tag -f v1.5.0   # 禁止
```

### 2-4. 发布说明 — 把 Breaking change 放在最上面

```markdown
## v2.0.0 ⚠️ Breaking Changes
- `parseLog(text)` → 签名变更为 `parseLog(text, options)`。
  迁移: 请将 `{}` 作为第二个参数传入。
```

破坏兼容性的变更 **必须** 一并写出迁移方法。

### 2-5. 废弃（Deprecation）要分阶段

```
1) 标记 deprecated + 提示替代方案（代码注释·文档·运行时警告）
2) 宽限期 — 至少在一次 MINOR 发布期间保留
3) 在下一个 MAJOR 中移除
```

### 2-6. （可选）用 Conventional Commits 实现版本自动化

将 `feat:` → MINOR、`fix:` → PATCH、`feat!:`/`BREAKING CHANGE:` → MAJOR 映射后，可用工具自动生成版本·CHANGELOG（如 semantic-release）。

## 3. 常见错误

- 把破坏兼容性的变更偷偷以 MINOR/PATCH 发出 → 用户构建悄无声息地破坏（SemVer 的信任崩塌）。
- 没有 CHANGELOG 只打标签 → 没人知道“这个版本改了什么?”。
- 用 force-push 覆盖已发布的标签 → 同一版本在不同人手里成为不同的代码。
- 明明是 0.x 却让人当作稳定 API 来依赖 → 应当公告 0.x 可能破坏。

## 4. 检查清单

- [ ] 是否按 SemVer 标准判定了本次变更的性质（MAJOR/MINOR/PATCH）
- [ ] 是否以用户影响为中心记录在 CHANGELOG 中
- [ ] 是否打了 annotated Git 标签且未动既有标签
- [ ] 若有 Breaking change，是否在发布说明顶部连同迁移一起标明
- [ ] 是否遵循分阶段废弃（deprecated → 宽限 → 移除）而非直接移除
