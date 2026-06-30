---
name: Node.js ORM パターン (Prisma / TypeORM)
description: Node.js バックエンド向けの Prisma と TypeORM のパターン — スキーママイグレーション、リレーションクエリ、トランザクション、N+1 の防止、型安全なクエリ。データ層を設計する、またはクエリを最適化する際に読むこと。Keywords: Prisma, TypeORM, migration, transaction, relation, N+1, select, include, QueryBuilder.
rules:
  - "スキーマ変更はマイグレーションファイルで管理し、DDL 文をデータベースに直接実行しない。"
  - "リレーションデータが必要なときは include（Prisma）または relations（TypeORM）を使い、1回のクエリで読み込んで N+1 問題を防ぐ。"
  - "アトミックであるべき複数の DB 操作は $transaction（Prisma）または QueryRunner（TypeORM）で包む。"
  - "クエリでは必要なカラムだけを select し、パスワードなどの機微なフィールドは select から明示的に除外する。"
  - "コネクションプールのサイズは、アプリケーションインスタンス数とデータベースサーバーの最大接続数を考慮して設定する。"
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

# 🗄️ Node.js ORM パターン (Prisma / TypeORM)

> Prisma と TypeORM で安全かつ効率的なデータアクセス層を構築する。マイグレーション、N+1 の防止、トランザクションが中心的な関心事だ。

## 1. 基本原則

- スキーマ変更 = マイグレーションファイル — DB の直接変更は環境の不整合を生む。
- リレーションデータを事前読み込み（eager loading または明示的な include）して N+1 を防ぐ。
- 複数の DB 操作のアトミック性をトランザクションで保証する。

## 2. ルール

### 2-1. Prisma 基本パターン

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

### 2-2. TypeORM 基本パターン

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

### 2-3. N+1 の検出

```typescript
// ❌ N+1 — executes a query on every loop iteration
const users = await userRepo.find()
for (const user of users) {
  user.posts = await postRepo.findBy({ userId: user.id })  // N queries!
}

// ✅ Load in one query
const users = await userRepo.find({ relations: ['posts'] })
```

## 3. よくある間違い

- 本番環境で `synchronize: true` を有効にすると、スキーマ変更時にデータ損失のリスクがある。
- TypeORM 0.3 では `findOne()` に `where` オプションが必須 — 単純な検索ではオプションオブジェクト全体を渡すより `findOneBy({ id })` を優先する。
- `$transaction` コールバック内で外側の `prisma` インスタンスを使ってクエリを実行しても、それはトランザクションに含まれない。

## 4. チェックリスト

- [ ] スキーマ変更はマイグレーションファイルで管理されているか？
- [ ] N+1 を防ぐため、リレーションデータは include/relations で1回のクエリで読み込まれているか？
- [ ] 複数の操作はトランザクションで包まれているか？
- [ ] パスワードや機微なフィールドは select から明示的に除外されているか？
