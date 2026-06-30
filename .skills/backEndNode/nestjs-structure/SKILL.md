---
name: NestJS Project Structure & Module Patterns
description: Module/Controller/Service/Provider layer structure design for NestJS applications — feature-based module separation, Dependency Injection (DI), and Interceptor/Guard/Pipe placement patterns. Read when starting a NestJS project or adding a new feature module. Keywords: Module, Controller, Service, Injectable, DI, Guard, Interceptor, Pipe, DTO.
rules:
  - "Separate modules by feature domain — do not register providers directly in AppModule."
  - "Place business logic in Services, HTTP input/output in Controllers, and data validation in DTOs + Pipes."
  - "Never call the database directly from a Controller — always access it through a Service."
  - "Register global guards (authentication) via APP_GUARD and mark specific route exceptions with a @Public() decorator."
  - "Declare validation rules on DTO classes using class-validator decorators and enable ValidationPipe globally."
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

# 🏗️ NestJS Project Structure & Module Patterns

> Build a scalable backend following NestJS's module and layer separation principles. Feature-based module separation and Dependency Injection are the core concepts.

## 1. Core Principles

- Feature-based module separation — independent modules like `UsersModule`, `AuthModule`, `OrdersModule`.
- Layer separation: Controller (HTTP) → Service (logic) → Repository/ORM (data).
- Controllers receive DTOs, call Services, and return results — nothing more.

## 2. Rules

### 2-1. Module Structure

```
src/
  users/
    users.module.ts     # Module — declares controllers, services, exports
    users.controller.ts # Controller — HTTP routes
    users.service.ts    # Service — business logic
    dto/
      create-user.dto.ts
      update-user.dto.ts
    entities/
      user.entity.ts
  auth/
    auth.module.ts
    auth.guard.ts       # JWT guard
  app.module.ts         # Root module — imports feature modules only
```

### 2-2. Module / Controller / Service Pattern

```typescript
// users.module.ts
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],  // Export only when used by other modules
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

// main.ts — enable ValidationPipe globally
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
```

### 2-4. Global Guard

```typescript
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },  // Applied to all routes
]

// Mark public routes with @Public()
@Public()
@Post('auth/login')
login(@Body() dto: LoginDto) { ... }
```

## 3. Common Mistakes

- Registering all providers directly in `AppModule` removes module boundaries, making testing and maintenance difficult.
- Injecting a TypeORM Repository directly into a Controller violates layer separation.
- Overusing `@IsOptional()` on DTO fields makes validation meaningless.

## 4. Checklist

- [ ] Are modules separated by feature domain?
- [ ] Is the Controller → Service → Repository layer respected?
- [ ] Are class-validator decorators declared on DTOs and ValidationPipe enabled globally?
- [ ] Is the global guard registered via APP_GUARD with @Public() on open routes?
