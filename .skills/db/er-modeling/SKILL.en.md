---
name: ER Modeling Conventions
description: Standards for entity-relationship modeling, normalization, naming, and relationship design (DB-neutral). Read it when designing new tables/schemas or deciding on PK, FK, N:M relationships, or normalization level. Keywords: er, entity, relationship, normalization, foreign-key, schema, naming, uuid.
rules:
  - "Use snake_case, plural form (users·orders) for table and column names, and avoid names that collide with reserved words."
  - "Use a UUID (v7) or auto-increment BIGINT for the primary key, and do not use a business key (email·order number) as the PK."
  - "Design to third normal form (3NF) by default, but denormalize intentionally when performance requires it and leave the reason as a comment."
  - "Always declare FK constraints so the DB guarantees referential integrity — do not validate in the application only."
  - "Resolve N:M relationships with a join table, and include an audit column (created_at) in the join table too."
tags:
  - "er"
  - "entity"
  - "relationship"
  - "normalization"
  - "foreign-key"
  - "schema"
  - "naming"
  - "uuid"
---

# 🗂️ ER Modeling Conventions

> Unify naming, normalization, and relationship design for entity-relationship modeling. Read it when designing new tables or schemas or deciding on PK, FK, or N:M relationships.

## 1. Core Principles
- Use snake_case, plural form (users·orders) for table and column names, and avoid names that collide with reserved words.
- Use a UUID (v7) or auto-increment BIGINT for the primary key, and do not use a business key (email·order number) as the PK.
- Design to third normal form (3NF) by default, but denormalize intentionally when performance requires it and leave the reason as a comment.
- Always declare FK constraints so the DB guarantees referential integrity — do not validate in the application only.
- Resolve N:M relationships with a join table, and include an audit column (created_at) in the join table too.

## 2. Rules

### 2-1. Naming Rules
| Target | Convention | Example |
|------|--------|------|
| Table | snake_case, plural | `users`, `order_items` |
| Column | snake_case | `created_at`, `user_id` |
| PK | `id` | `id UUID PRIMARY KEY` |
| FK | `{table_singular}_id` | `user_id`, `order_id` |
| Index | `idx_{table}_{cols}` | `idx_orders_user_status` |
| Unique | `uq_{table}_{cols}` | `uq_users_email` |

```sql
-- ❌ Forbidden — singular form·camelCase·using a business key as the PK
CREATE TABLE User (userEmail VARCHAR(200) PRIMARY KEY);

-- ✅ Recommended — plural·snake_case·surrogate key (PK)
CREATE TABLE users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(200) NOT NULL
);
```

### 2-2. Basic Table Structure
```sql
CREATE TABLE products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(200) NOT NULL,
  price        NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  category_id  UUID NOT NULL REFERENCES categories(id),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP   -- soft delete
);
```

### 2-3. N:M Relationship (Join Table)
```sql
-- User ↔ Role (N:M)
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

### 2-4. Normalization Level
```
1NF: atomic values, eliminate repeating groups
2NF: eliminate partial functional dependencies (with a composite PK)
3NF: eliminate transitive functional dependencies (in A→B→C, separate B,C)

Denormalization example: caching an aggregate value (order.total_amount)
  → reason: SUM(order_items.price) every time is expensive.
```

### 2-5. FK Behavior Policy
| Policy | Description | When to use |
|------|------|-----------|
| RESTRICT | Refuse deletion if a referencing row exists | Recommended default |
| CASCADE | Delete children when the parent is deleted | Dependent data |
| SET NULL | Set the FK to NULL when the parent is deleted | Optional reference |

## 3. Common Mistakes
- Using a business key (email·order number) as the PK → references break when the value changes.
- Not declaring FK constraints and validating only in the application → integrity is not guaranteed.
- Denormalization without a reason → becomes a source of data inconsistency.
- Missing audit columns in the join table → cannot track when the relationship was created.

## 4. Checklist
- [ ] Are table and column names snake_case and plural?
- [ ] Is the PK a surrogate key (UUID/BIGINT) and not using a business key?
- [ ] Is the default 3NF, with a reason comment for denormalization?
- [ ] Did you declare FK constraints and decide the behavior policy (RESTRICT/CASCADE/SET NULL)?
- [ ] Did you resolve N:M with a join table and include audit columns?
