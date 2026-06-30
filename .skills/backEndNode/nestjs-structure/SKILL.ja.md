---
name: NestJS プロジェクト構成 & モジュールパターン
description: NestJS アプリケーションのための Module/Controller/Service/Provider レイヤー構成の設計 — 機能単位のモジュール分離、依存性注入（DI）、Interceptor/Guard/Pipe の配置パターン。NestJS プロジェクトを始める場合や、新しい機能モジュールを追加する場合に読む。キーワード: Module, Controller, Service, Injectable, DI, Guard, Interceptor, Pipe, DTO.
rules:
  - "モジュールは機能ドメインごとに分離する — AppModule に Provider を直接登録しない。"
  - "ビジネスロジックは Service に、HTTP の入出力は Controller に、データ検証は DTO + Pipe に置く。"
  - "Controller からデータベースを直接呼び出さない — 常に Service を通じてアクセスする。"
  - "グローバルな Guard（認証）は APP_GUARD で登録し、特定ルートの例外は @Public() デコレーターで指定する。"
  - "検証ルールは class-validator デコレーターで DTO クラスに宣言し、ValidationPipe をグローバルに有効化する。"
tags:
  - "Module"
  - "Controller"
  - "Service"
  - "Injectable"
  - "DI"
  - "Guard"
  - "Interceptor"
  - "Pipe"
  - "DTO"
  - "NestJS"
---

# 🏗️ NestJS プロジェクト構成 & モジュールパターン

> NestJS のモジュールとレイヤー分離の原則に従ってスケーラブルなバックエンドを構築する。機能単位のモジュール分離と依存性注入が中核概念だ。

## 1. 中核原則

- 機能単位のモジュール分離 — `UsersModule`、`AuthModule`、`OrdersModule` のような独立したモジュール。
- レイヤー分離: Controller (HTTP) → Service (ロジック) → Repository/ORM (データ)。
- Controller は DTO を受け取り、Service を呼び出し、結果を返す — それ以上は行わない。

## 2. ルール

### 2-1. モジュール構成

```
src/
  users/
    users.module.ts     # Module — controllers, services, exports を宣言
    users.controller.ts # Controller — HTTP ルート
    users.service.ts    # Service — ビジネスロジック
    dto/
      create-user.dto.ts
      update-user.dto.ts
    entities/
      user.entity.ts
  auth/
    auth.module.ts
    auth.guard.ts       # JWT guard
  app.module.ts         # ルートモジュール — 機能モジュールのみ import
```

### 2-2. Module / Controller / Service パターン

```typescript
// users.module.ts
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],  // 他のモジュールで使う場合のみ export
})
export class UsersModule {}

// users.controller.ts
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id)
  }
}

// users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepo: Repository<User>) {}

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } })
    if (!user) throw new NotFoundException(`User ${id} not found`)
    return user
  }
}
```

### 2-3. DTO + ValidationPipe

```typescript
// create-user.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8)
  password: string
}

// main.ts — ValidationPipe をグローバルに有効化
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
```

### 2-4. グローバル Guard

```typescript
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // 全ルートに適用
]

// 公開ルートは @Public() でマークする
@Public()
@Post('auth/login')
login(@Body() dto: LoginDto) { ... }
```

## 3. よくある誤り

- すべての Provider を `AppModule` に直接登録するとモジュール境界が失われ、テストと保守が困難になる。
- TypeORM の Repository を Controller に直接注入するのはレイヤー分離違反。
- DTO フィールドで `@IsOptional()` を多用すると検証が無意味になる。

## 4. チェックリスト

- [ ] モジュールは機能ドメインごとに分離されているか
- [ ] Controller → Service → Repository のレイヤーが守られているか
- [ ] class-validator デコレーターが DTO に宣言され、ValidationPipe がグローバルに有効化されているか
- [ ] グローバル Guard が APP_GUARD で登録され、公開ルートに @Public() が付いているか
