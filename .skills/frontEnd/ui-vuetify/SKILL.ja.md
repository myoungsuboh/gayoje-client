---
name: Vue 3 + Vuetify 3 UI 開発標準 (UI Vuetify)
description: Vue 3 + Vuetify 3 をベースとした画面コンポーネント生成の標準です。グリッドレイアウト階層、PascalCase のコンポーネント命名、レスポンシブ属性、ユーティリティクラスの使用ルールを定義し、画面 SFC を生成またはレビューする際に読みます。キーワード Vuetify, VContainer, VRow, VCol, PascalCase, グリッド。
rules:
  - "レイアウトは必ず VContainer > VRow > VCol の階層構造に従う。"
  - "すべての Vuetify コンポーネントは PascalCase(<V...>)で記述し、ケバブケースは禁止する。"
  - "すべての VCol は cols='12' とともに少なくとも 1 つ以上のレスポンシブ属性(md, lg など)を明示する。"
  - "インラインスタイルの代わりに Vuetify のユーティリティクラス(ma, pa など)を使用する。"
  - "同一の要件に対しては常に PascalCase ベースの標準グリッド構造を出力する。"
tags:
  - "vuetify"
  - "VBtn"
  - "VCard"
  - "VDialog"
  - "VDataTable"
  - "v-btn"
  - "v-card"
  - "v-dialog"
  - "$vuetify"
  - "createVuetify"
---

# 🎨 Vue 3 + Vuetify 3 UI 開発標準

> Vue 3 + Vuetify 3 の画面コンポーネントのグリッド構造、コンポーネント命名、レスポンシブ/スタイルのルールを定義する。新しい画面 SFC を生成するか、既存の画面をレビューする際に読む。

## 1. 中核となる原則
- レイアウトは必ず `VContainer` > `VRow` > `VCol` の階層構造に従う。
- すべての Vuetify コンポーネントは PascalCase(`<V...>`)で記述し、ケバブケースは禁止する。
- すべての `VCol` は `cols="12"` とともに少なくとも 1 つ以上のレスポンシブ属性(md, lg など)を明示する。
- インラインスタイルの代わりに Vuetify のユーティリティクラス(ma, pa など)を使用する。
- 同一の要件に対しては常に PascalCase ベースの標準グリッド構造を出力する。

## 2. ルール

### 2-1. グリッドシステム (GRID_SYSTEM_STRICT)
- レイアウトは必ず `VContainer` > `VRow` > `VCol` の階層構造に従う。
- `VCol` は `VRow` の直接の子として含まれなければならない。

### 2-2. PascalCase 命名 (PASCAL_CASE_NAMING, CRITICAL)
- すべての Vuetify コンポーネントは必ず PascalCase を使用する。
  - [O]: `<VContainer>`, `<VRow>`, `<VCol>`, `<VBtn>`, `<VTextField>`
  - [X]: `<v-container>`, `<v-col>`, `<v-btn>` (ケバブケースは絶対禁止)

### 2-3. レスポンシブ属性 (RESPONSIVE_PROPS)
- すべての `VCol` は `cols="12"` とともに少なくとも 1 つ以上のレスポンシブ属性(md, lg など)を明示する。

### 2-4. スタイル / ユーティリティクラス
- インラインスタイルの代わりに Vuetify のユーティリティクラス(ma, pa など)を使用する。

### 2-5. 作業ワークフロー
1. **[Analysis]**: PRD の User Flow を分析し、画面内のコンポーネント配置の優先順位を決定する。
2. **[Building]**: PascalCase ルールを適用して Vuetify のグリッドおよびデータバインディング(v-model)を記述する。
3. **[Verifying (Self-Check Gate)]**: 自己検証ゲートで PascalCase・グリッド階層・Acceptance Criteria・ユーティリティクラスの使用有無を点検する。
4. **[Recording]**: 最終的な .vue 単一ファイルコンポーネント(SFC)を出力する。

### 2-6. 標準出力構造 (OUTPUT SCHEMA)
```vue
<template>
  <VContainer fluid>
    <VRow justify="center">
      <VCol cols="12" md="10">
        <VCard>
          <VCardTitle>화면 제목</VCardTitle>
          <VCardText>
            <VRow>
              <VCol cols="12" sm="6">
                <VTextField v-model="state.field" label="입력" />
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<script setup>
import { reactive } from 'vue'
const state = reactive({ field: '' })
</script>
```

## 3. よくある間違い
- ❌ ケバブケース(`<v-col>`)の使用 → PascalCase `<VCol>`。
- ❌ `VCol` を `VRow` の直接の子以外の場所に配置 → 階層を守る。
- ❌ `cols` だけでレスポンシブ属性(md/lg)がない → 画面サイズごとにレイアウトが崩れる。
- ❌ インラインスタイルの使用 → Vuetify のユーティリティクラス(ma/pa)。
- ❌ `VContainer` なしで `VRow` を直接 → `VContainer` > `VRow` > `VCol` の階層を守る。

## 4. チェックリスト
- [ ] すべてのコンポーネントが `<V...>` 形式の PascalCase になっているか?
- [ ] `VCol` が `VRow` の直接の子として含まれているか?
- [ ] レイアウトが `VContainer` > `VRow` > `VCol` の階層に従っているか?
- [ ] すべての `VCol` が `cols="12"` とともにレスポンシブ属性(md, lg など)を明示しているか?
- [ ] PRD の `Acceptance Criteria` の機能をすべて含んでいるか?
- [ ] インラインスタイルの代わりに Vuetify のユーティリティクラス(ma, pa など)を使用したか?
