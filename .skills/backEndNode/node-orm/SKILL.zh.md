---
name: Node.js ORM 模式 (Prisma / TypeORM)
description: 面向 Node.js 后端的 Prisma 和 TypeORM 模式 — 模式迁移、关系查询、事务、N+1 防范以及类型安全查询。在设计数据层或优化查询时阅读。Keywords: Prisma, TypeORM, migration, transaction, relation, N+1, select, include, QueryBuilder.
rules:
  - "用迁移文件管理模式变更 — 绝不直接对数据库执行 DDL 语句。"
  - "需要关系数据时，使用 include（Prisma）或 relations（TypeORM）在单次查询中加载，以防范 N+1 问题。"
  - "将必须原子化的多个 DB 操作包裹在 $transaction（Prisma）或 QueryRunner（TypeORM）中。"
  - "查询中只 select 所需的列，并将密码等敏感字段从 select 中显式排除。"
  - "配置连接池大小时，要考虑应用实例数量和数据库服务器的最大连接数。"
tags:
  - "Prisma"
  - "TypeORM"
  - "migration"
  - "transaction"
  - "relation"
  - "N+1"
  - "select"
  - "include"
  - "QueryBuilder"
---

# 🗄️ Node.js ORM 模式 (Prisma / TypeORM)

> 用 Prisma 和 TypeORM 构建安全高效的数据访问层。迁移、N+1 防范和事务是核心关注点。

## 1. 核心原则

- 模式变更 = 迁移文件 — 直接修改 DB 会造成环境不一致。
- 预加载关系数据（eager loading 或显式 include）以阻断 N+1。
- 用事务保证多个 DB 操作的原子性。

## 2. 规则

### 2-1. Prisma 基本模式

```typescript
// schema.prisma
model User {
  id       String  @id @default(cuid())
  email    String  @unique
  name     String
  posts    Post[]
  @@map("users")
}

// Generate and apply migrations
// npx prisma migrate dev --name add-users-table
// npx prisma migrate deploy  (production)
```

```typescript
// Prevent N+1 — nest the relation inside select to load it in one query.
// NOTE: Prisma forbids top-level `include` and `select` together — put the
// relation under `select` to both pick scalar fields and load the relation.
const users = await prisma.user.findMany({
  select: {
    id: true, name: true, email: true,   // exclude password by omission!
    posts: { select: { id: true, title: true } },  // relation loaded in the same query
  },
})

// Transaction
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email, name } })
  await tx.profile.create({ data: { userId: user.id } })
})
```

### 2-2. TypeORM 基本模式

```typescript
// Entity
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @OneToMany(() => Post, post => post.author)
  posts: Post[]
}

// Repository pattern
const users = await userRepo.find({
  relations: ['posts'],           // Prevent N+1
  select: ['id', 'name', 'email'], // Necessary columns only
})

// Transaction (QueryRunner)
const queryRunner = dataSource.createQueryRunner()
await queryRunner.connect()
await queryRunner.startTransaction()
try {
  await queryRunner.manager.save(user)
  await queryRunner.manager.save(profile)
  await queryRunner.commitTransaction()
} catch (err) {
  await queryRunner.rollbackTransaction()
  throw err
} finally {
  await queryRunner.release()
}
```

### 2-3. 检测 N+1

```typescript
// ❌ N+1 — executes a query on every loop iteration
const users = await userRepo.find()
for (const user of users) {
  user.posts = await postRepo.findBy({ userId: user.id })  // N queries!
}

// ✅ Load in one query
const users = await userRepo.find({ relations: ['posts'] })
```

## 3. 常见错误

- 在生产环境启用 `synchronize: true` 会在模式变更时带来数据丢失风险。
- 在 TypeORM 0.3 中，`findOne()` 需要 `where` 选项 — 对于简单查找，优先使用 `findOneBy({ id })` 而非传入完整的选项对象。
- 在 `$transaction` 回调内使用外层的 `prisma` 实例执行查询，不会将其纳入该事务。

## 4. 检查清单

- [ ] 模式变更是否用迁移文件管理？
- [ ] 是否用 include/relations 在单次查询中加载关系数据以防范 N+1？
- [ ] 多个操作是否包裹在事务中？
- [ ] 密码和敏感字段是否从 select 中显式排除？
