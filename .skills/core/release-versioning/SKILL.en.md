---
name: Release & Versioning (Release & Versioning)
description: Standards for assigning release versions (SemVer), change history (CHANGELOG), Git tags, release notes, and deprecation policy for software releases. A stack-agnostic general standard, read when bumping a version, cutting a release, or organizing change history. (REST API contract versions are delegated to `api-versioning-swagger`, and dependency version hygiene to `dependency-management`.) Keywords: semver, MAJOR.MINOR.PATCH, CHANGELOG, git tag, release notes, breaking change, deprecation, conventional commits.
rules:
  - "Follow SemVer: assign versions as MAJOR.MINOR.PATCH. Bump MAJOR on a breaking change, MINOR on a backward-compatible feature addition, and PATCH on a backward-compatible bug fix."
  - "Keep change history: every release is recorded in the CHANGELOG centered on user impact (Added/Changed/Fixed/Removed/Deprecated/Security). Write 'what changed', not a list of commit hashes."
  - "Immutable tags: stamp an annotated Git tag (vMAJOR.MINOR.PATCH) for each release, and never move or reuse a tag that has already been shipped."
  - "State breaking changes: clearly mark breaking changes at the top of the release notes/CHANGELOG and include the migration method alongside them."
  - "Phased deprecation: rather than removing a feature immediately, proceed in order of deprecated notice → grace period → removal in the next MAJOR."
  - "Mind 0.x: before 1.0.0 (0.y.z) means the public API is unstable. Cut 1.0.0 to promise stability."
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

# 🏷️ Release & Versioning (Release & Versioning)

> Assign consistent versions to software releases, leave a change history from the user's perspective, and proceed with deprecation safely. Read when bumping a version, cutting a release, or organizing change history. This is a general standard not tied to any specific language/framework.
>
> Boundary: for REST API contract versions (`/v1/`, Sunset header) see [api-versioning-swagger](../../backEnd/api-versioning-swagger/SKILL.md), and for adopting and keeping external dependency versions hygienic see [dependency-management](../dependency-management/SKILL.md). This skill covers **the release version of the artifacts I ship (apps, libraries, services)**.

## 1. Core Principles

- **Follow SemVer**: a version carries meaning — MAJOR (breaking), MINOR (backward-compatible feature), PATCH (backward-compatible fix).
- **Keep change history**: a release is recorded in the CHANGELOG centered on user impact.
- **Immutable tags**: a shipped tag is not moved — the foundation of reproducibility and trust.
- **Phased deprecation**: instead of immediate removal, deprecated → grace → removal.

## 2. Rules

### 2-1. SemVer — what bumps which position

| Change | Position bumped | Example |
|------|------------|-----|
| Breaking change (signature removal, behavior change) | **MAJOR** | 1.4.2 → 2.0.0 |
| Backward-compatible feature addition | **MINOR** | 1.4.2 → 1.5.0 |
| Backward-compatible bug fix | **PATCH** | 1.4.2 → 1.4.3 |

- Bumping MAJOR resets MINOR/PATCH to 0 (2.0.0). Bumping MINOR resets only PATCH to 0.
- Pre-release uses the `1.5.0-rc.1` format, build metadata the `1.5.0+build.42` format.

### 2-2. CHANGELOG — a "summary of changes", not a commit log

The [Keep a Changelog](https://keepachangelog.com) format is recommended. Group by category:

```markdown
## [1.5.0] - 2026-06-24
### Added
- Multilingual upload support for meeting logs
### Fixed
- Issue where recommendations stalled on an empty catalog
### Deprecated
- `/api/legacy/export` — to be removed in 1.7.0, use `/api/export`
### Removed
- (none)
```

- ❌ Forbidden: pasting `git log` as-is (hashes and merge commits are meaningless to users).
- ✅ Recommended: one line on "what changed from the user/caller's perspective".

### 2-3. Git tags — annotated + immutable

```bash
# ✅ annotated tag (preserves author, date, message)
git tag -a v1.5.0 -m "Release 1.5.0 — multilingual upload"
git push origin v1.5.0

# ❌ moving an already-shipped tag (destroys reproducibility — someone already pulled v1.5.0)
git tag -f v1.5.0   # forbidden
```

### 2-4. Release notes — breaking changes at the top

```markdown
## v2.0.0 ⚠️ Breaking Changes
- `parseLog(text)` → signature changed to `parseLog(text, options)`.
  Migration: pass `{}` as the second argument.
```

A breaking change **must** include the migration method alongside it.

### 2-5. Deprecation proceeds in phases

```
1) Mark as deprecated + announce a replacement (code comments, docs, runtime warning)
2) Grace period — maintain through at least one MINOR release
3) Remove in the next MAJOR
```

### 2-6. (Optional) Automate versioning with Conventional Commits

Mapping `feat:` → MINOR, `fix:` → PATCH, `feat!:`/`BREAKING CHANGE:` → MAJOR lets tools auto-generate versions and the CHANGELOG (semantic-release, etc.).

## 3. Common Mistakes

- Slipping a breaking change out as MINOR/PATCH → users' builds break silently (SemVer's trust collapses).
- Stamping only a tag without a CHANGELOG → no one knows "what changed in this version?".
- Overwriting a shipped tag with force-push → the same version becomes different code for different people.
- Letting people depend on a 0.x as if it were a stable API → you must announce that 0.x can break.

## 4. Checklist

- [ ] Did you judge the nature of this change (MAJOR/MINOR/PATCH) by the SemVer criteria?
- [ ] Did you record it in the CHANGELOG centered on user impact?
- [ ] Did you stamp an annotated Git tag without touching existing tags?
- [ ] If there is a breaking change, did you mark it at the top of the release notes with the migration?
- [ ] Did you follow phased deprecation (deprecated → grace → removal) instead of removal?
