---
name: NestJS 项目结构 & 模块模式
description: 面向 NestJS 应用的 Module/Controller/Service/Provider 分层结构设计 — 按功能划分的模块分离、依赖注入（DI）以及 Interceptor/Guard/Pipe 的放置模式。开始一个 NestJS 项目或新增功能模块时阅读。关键词: Module, Controller, Service, Injectable, DI, Guard, Interceptor, Pipe, DTO.
rules:
  - "按功能领域分离模块 — 不要在 AppModule 中直接注册 provider。"
  - "业务逻辑放在 Service，HTTP 输入/输出放在 Controller，数据校验放在 DTO + Pipe。"
  - "切勿在 Controller 中直接调用数据库 — 始终通过 Service 访问。"
  - "通过 APP_GUARD 注册全局守卫（认证），并用 @Public() 装饰器标记特定路由的例外。"
  - "用 class-validator 装饰器在 DTO 类上声明校验规则，并全局启用 ValidationPipe。"
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

# 🏗️ NestJS 项目结构 & 模块模式

> 遵循 NestJS 的模块与分层分离原则构建可扩展的后端。按功能划分的模块分离与依赖注入是核心概念。

## 1. 核心原则

- 按功能划分的模块分离 — 如 `UsersModule`、`AuthModule`、`OrdersModule` 等独立模块。
- 分层分离: Controller (HTTP) → Service (逻辑) → Repository/ORM (数据)。
- Controller 接收 DTO、调用 Service、返回结果 — 仅此而已。

## 2. 规则

### 2-1. 模块结构

```
src/
  users/
    users.module.ts     # Module — 声明 controllers、services、exports
    users.controller.ts # Controller — HTTP 路由
    users.service.ts    # Service — 业务逻辑
    dto/
      create-user.dto.ts
      update-user.dto.ts
    entities/
      user.entity.ts
  auth/
    auth.module.ts
    auth.guard.ts       # JWT guard
  app.module.ts         # 根模块 — 仅 import 功能模块
```

### 2-2. Module / Controller / Service 模式

```typescript
// users.module.ts
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],  // 仅在被其他模块使用时才 export
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

// main.ts — 全局启用 ValidationPipe
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
```

### 2-4. 全局 Guard

```typescript
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // 应用于所有路由
]

// 用 @Public() 标记公开路由
@Public()
@Post('auth/login')
login(@Body() dto: LoginDto) { ... }
```

## 3. 常见错误

- 将所有 provider 直接注册到 `AppModule` 会破坏模块边界，使测试和维护变得困难。
- 将 TypeORM Repository 直接注入 Controller 违反分层分离。
- 在 DTO 字段上滥用 `@IsOptional()` 会使校验失去意义。

## 4. 检查清单

- [ ] 模块是否按功能领域分离？
- [ ] 是否遵循 Controller → Service → Repository 的分层？
- [ ] 是否在 DTO 上声明了 class-validator 装饰器并全局启用 ValidationPipe？
- [ ] 是否通过 APP_GUARD 注册了全局守卫，并在开放路由上使用 @Public()？
