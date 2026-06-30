---
name: リリース & バージョン管理 (Release & Versioning)
description: ソフトウェアリリースのバージョン付与（SemVer）・変更履歴（CHANGELOG）・Git タグ・リリースノート・廃止（deprecation）ポリシーの標準。スタックに依存しない汎用標準で、バージョンを上げる・リリースを出す・変更履歴を整理するときに読む。（REST API 契約バージョンは `api-versioning-swagger`、依存関係のバージョン衛生は `dependency-management` に委譲。）キーワード: semver, MAJOR.MINOR.PATCH, CHANGELOG, git tag, release notes, breaking change, deprecation, conventional commits.
rules:
  - "SemVer を順守する: バージョンを MAJOR.MINOR.PATCH で付与する。互換が壊れたら MAJOR、後方互換の機能追加は MINOR、後方互換のバグ修正は PATCH を上げる。"
  - "変更履歴を維持する: すべてのリリースはユーザー影響を中心に（Added/Changed/Fixed/Removed/Deprecated/Security）CHANGELOG に記録する。コミットハッシュの羅列ではなく『何が変わったか』を書く。"
  - "不変タグ: リリースごとに annotated Git タグ（vMAJOR.MINOR.PATCH）を打ち、すでにデプロイされたタグは決して移動・再利用しない。"
  - "Breaking change を明示する: 互換が壊れる変更はリリースノート・CHANGELOG の先頭に明確に表示し、移行方法を併記する。"
  - "段階的廃止: 機能を即時削除せず、deprecated 告知 → 猶予期間 → 次の MAJOR で削除 の順で進める。"
  - "0.x に注意: 1.0.0 以前（0.y.z）は公開 API が不安定であることを意味する。安定性を約束するなら 1.0.0 を切る。"
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

# 🏷️ リリース & バージョン管理 (Release & Versioning)

> ソフトウェアリリースに一貫したバージョンを付与し、変更履歴をユーザー視点で残し、廃止を安全に進める。バージョンを上げる・リリースを出す・変更履歴を整理するときに読む。特定の言語/フレームワークに依存しない汎用標準である。
>
> 境界: REST API の契約バージョン（`/v1/`、Sunset ヘッダー）は [api-versioning-swagger](../../backEnd/api-versioning-swagger/SKILL.md)、外部依存関係のバージョン採用・衛生は [dependency-management](../dependency-management/SKILL.md) を見る。本スキルは **自分が送り出す成果物（アプリ・ライブラリ・サービス）のリリースバージョン** を扱う。

## 1. 中核原則

- **SemVer を順守する**: バージョンは意味を持つ — MAJOR（互換崩壊）・MINOR（後方互換の機能）・PATCH（後方互換の修正）。
- **変更履歴を維持する**: リリースはユーザー影響を中心に CHANGELOG に記録する。
- **不変タグ**: デプロイされたタグは移動しない — 再現性と信頼の基盤。
- **段階的廃止**: 即時削除の代わりに deprecated → 猶予 → 削除。

## 2. ルール

### 2-1. SemVer — 何がどの位を上げるか

| 変更 | 上げる位 | 例 |
|------|------------|-----|
| 互換が壊れる変更（シグネチャ削除・動作変更） | **MAJOR** | 1.4.2 → 2.0.0 |
| 後方互換の機能追加 | **MINOR** | 1.4.2 → 1.5.0 |
| 後方互換のバグ修正 | **PATCH** | 1.4.2 → 1.4.3 |

- MAJOR を上げると MINOR・PATCH は 0 にリセット（2.0.0）。MINOR を上げると PATCH のみ 0。
- プレリリースは `1.5.0-rc.1`、ビルドメタは `1.5.0+build.42` 形式。

### 2-2. CHANGELOG — コミットログではなく「変更サマリー」

[Keep a Changelog](https://keepachangelog.com) 形式を推奨。カテゴリでまとめる:

```markdown
## [1.5.0] - 2026-06-24
### Added
- ミーティングログの多言語アップロード対応
### Fixed
- 空のカタログで推薦が止まる問題
### Deprecated
- `/api/legacy/export` — 1.7.0 で削除予定、`/api/export` を使用
### Removed
- (なし)
```

- ❌ 禁止: `git log` をそのまま貼り付ける（ハッシュ・マージコミットはユーザーに意味がない）。
- ✅ 推奨: 「ユーザー/呼び出し側の視点で何が変わったか」を一行で。

### 2-3. Git タグ — annotated + 不変

```bash
# ✅ annotated タグ（作成者・日付・メッセージを保存）
git tag -a v1.5.0 -m "Release 1.5.0 — 多言語アップロード"
git push origin v1.5.0

# ❌ すでにデプロイされたタグを移動する（再現性破壊 — 誰かがすでに v1.5.0 を取得している）
git tag -f v1.5.0   # 禁止
```

### 2-4. リリースノート — Breaking change を一番上に

```markdown
## v2.0.0 ⚠️ Breaking Changes
- `parseLog(text)` → `parseLog(text, options)` にシグネチャ変更。
  移行: 第二引数に `{}` を渡してください。
```

互換が壊れる変更は **必ず** 移行方法を併記する。

### 2-5. 廃止（Deprecation）は段階的に

```
1) deprecated 表示 + 代替の案内（コードコメント・ドキュメント・ランタイム警告）
2) 猶予期間 — 最低一回の MINOR リリースの間維持
3) 次の MAJOR で削除
```

### 2-6. （任意）Conventional Commits でバージョン自動化

`feat:` → MINOR、`fix:` → PATCH、`feat!:`/`BREAKING CHANGE:` → MAJOR にマッピングすると、バージョン・CHANGELOG をツールで自動生成できる（semantic-release など）。

## 3. よくある誤り

- 互換が壊れる変更を MINOR/PATCH でこっそり出す → ユーザーのビルドが静かに壊れる（SemVer の信頼が崩れる）。
- CHANGELOG なしでタグだけ打つ → 「このバージョンで何が変わったのか?」を誰も分からない。
- デプロイされたタグを force-push で上書き → 同じバージョンが人によって異なるコードになる。
- 0.x なのに安定 API であるかのように依存させる → 0.x は壊れ得ると告知すべき。

## 4. チェックリスト

- [ ] 今回の変更の性質（MAJOR/MINOR/PATCH）を SemVer 基準で判定したか
- [ ] CHANGELOG にユーザー影響を中心に記録したか
- [ ] annotated Git タグを打ち、既存のタグに触れていないか
- [ ] Breaking change があるならリリースノートの先頭に移行と共に表示したか
- [ ] 削除の代わりに段階的廃止（deprecated → 猶予 → 削除）に従ったか
