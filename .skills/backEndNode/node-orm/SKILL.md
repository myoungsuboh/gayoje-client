---
name: Node.js ORM Patterns (Prisma / TypeORM)
description: Prisma and TypeORM patterns for Node.js backends — schema migrations, relation queries, transactions, N+1 prevention, and type-safe queries. Read when designing the data layer or optimizing queries. Keywords: Prisma, TypeORM, migration, transaction, relation, N+1, select, include, QueryBuilder.
rules:
  - "Manage schema changes with migration files — never run DDL statements directly against the database."
  - "When relation data is needed, use include (Prisma) or relations (TypeORM) to load it in a single query and prevent N+1 problems."
  - "Wrap multiple DB operations that must be atomic in $transaction (Prisma) or QueryRunner (TypeORM)."
  - "Select only the columns needed in a query, and explicitly exclude sensitive fields like passwords from select."
  - "Configure the connection pool size considering the number of application instances and the database server's max connections."
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

# 🗄️ Node.js ORM Patterns (Prisma / TypeORM)

> Build a safe and efficient data access layer with Prisma and TypeORM. Migrations, N+1 prevention, and transactions are the core concerns.

## 1. Core Principles

- Schema changes = migration files — direct DB modifications create environment inconsistencies.
- Pre-load relation data (eager loading or explicit include) to block N+1.
- Guarantee atomicity for multiple DB operations with transactions.

## 2. Rules

### 2-1. Prisma Basic Patterns

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

### 2-2. TypeORM Basic Patterns

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

### 2-3. Detecting N+1

```typescript
// ❌ N+1 — executes a query on every loop iteration
const users = await userRepo.find()
for (const user of users) {
  user.posts = await postRepo.findBy({ userId: user.id })  // N queries!
}

// ✅ Load in one query
const users = await userRepo.find({ relations: ['posts'] })
```

## 3. Common Mistakes

- Enabling `synchronize: true` in production risks data loss when the schema changes.
- In TypeORM 0.3, `findOne()` requires a `where` option — for a simple lookup prefer `findOneBy({ id })` over passing a full options object.
- Running a query using the outer `prisma` instance inside a `$transaction` callback does not include it in the transaction.

## 4. Checklist

- [ ] Are schema changes managed with migration files?
- [ ] Is relation data loaded with include/relations in a single query to prevent N+1?
- [ ] Are multiple operations wrapped in a transaction?
- [ ] Are passwords and sensitive fields explicitly excluded from select?
