---
name: Project Architecture
description: Defines the project's directory structure and guidelines for using core libraries. Read when deciding where to put new files/modules or how to keep a consistent structure. Keywords: directory structure, @core, @layouts, api module, utils.
rules:
  - "Use @core by inheriting/extending rather than modifying it."
  - "Manage layouts, APIs, plugins, and utilities each only in their designated directory."
  - "Export every API call function with the Api suffix."
  - "Separate components into reusable units (src/components) and page units (src/views)."
tags:
  - "src/components"
  - "src/pages"
  - "src/composables"
  - "src/store"
  - "src/utils"
---

# 🏗️ Project Architecture

> Provides guidelines for maintaining a consistent structure in this project. Read when adding new files/modules or deciding directory placement.

## 1. Core Principles
- Use `@core` by inheriting/extending rather than modifying it.
- Manage layouts, APIs, plugins, and utilities each only in their designated directory.
- Export every API call function with the `Api` suffix.
- Separate components into reusable units (`src/components`) and page units (`src/views`).

## 2. Rules

### 2-1. Main directory structure
- **`@core`**: Where template layouts and core utilities live. By default, inherit/extend rather than modify it.
- **`src/@layouts`**: Space dedicated to layout components (Header, Sidebar, Footer, etc.).
- **`src/api`**: Manages all external API call functions, organized by module.
- **`src/plugins`**: Where various plugin configurations live, such as Vite, Vue, and Iconify.
- **`src/utils`**: Manages pure utility functions unrelated to business logic (Date formatting, etc.).

### 2-2. Module management principles
- Export all API calls with the `Api` suffix, per individual file.
- Split components into `src/components` and `src/views` to distinguish reusability from page units.

## 3. Common Mistakes
- ❌ Modifying `@core` directly → conflicts on template updates. Use it via inheritance/extension.
- ❌ Inlining API calls in components → separate them into `src/api` modules and export with the `Api` suffix.
- ❌ Putting reusable components and pages in one folder → distinguish `components` (reusable) / `views` (pages).
- ❌ Mixing business logic into `utils` → keep only pure utils and separate domain logic.
- ❌ Circular dependencies between modules → keep dependencies unidirectional.

## 4. Checklist
- [ ] Did you use `@core` via inheritance/extension instead of modifying it directly?
- [ ] Did you put layout components in `src/@layouts`?
- [ ] Did you put API call functions in `src/api` and export them with the `Api` suffix?
- [ ] Did you put plugin configurations in `src/plugins`?
- [ ] Did you put pure utility functions in `src/utils`?
- [ ] Did you separate components into reusable (`src/components`) and page (`src/views`)?
