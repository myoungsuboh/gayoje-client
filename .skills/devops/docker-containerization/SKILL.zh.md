---
name: 容器化标准 (Containerization)
description: 容器镜像的通用标准 — 小镜像、多阶段构建、non-root 运行、层缓存、构建上下文排除、不可变标签、运行时密钥注入、漏洞扫描 — 与运行时/工具无关的 OCI 通用概念。在容器化服务或确定镜像大小、攻击面、密钥注入时阅读。关键词: container, OCI, image, multi-stage, non-root, dockerignore, vulnerability scan, Dockerfile, docker-compose。
rules:
  - "镜像要小: 最终镜像中只保留运行应用所必需的内容。从运行时镜像中移除构建工具、源代码、缓存、文档,以减小体积和攻击面。"
  - "分离构建与运行(多阶段): 将构建阶段与运行阶段分开,使编译器、包管理器、中间产物不会泄漏到最终镜像。"
  - "以 non-root 运行: 容器进程以专用的非特权用户而非 root 运行。减小容器逃逸、权限提升的影响范围。"
  - "有意利用层缓存: 先复制不常变的内容(依赖清单),后复制常变的内容(源代码),以提高缓存命中率。一次性全部复制会在改动一行代码时重新拉取依赖。"
  - "减小构建上下文: 用忽略文件(.dockerignore 等)将 VCS 元数据、依赖目录、密钥、测试文件排除出构建上下文。构建更快且敏感文件不会混入镜像。"
  - "标签要不可变(immutable): 用具体版本或摘要(SHA)固定,而不是 latest 这类浮动标签,以保证可复现的构建。"
  - "密钥在运行时注入: 不要把 API 密钥、密码烤进镜像层(构建参数/环境变量)。通过运行时环境变量、密钥挂载从外部注入 — 镜像层任何人都能查看。"
  - "镜像要不可变、可丢弃: 不要通过修改运行中的容器来积累状态。把状态放在外部(卷、DB),让镜像无论何时丢弃再启动都表现一致。"
  - "扫描漏洞: 在构建流水线中扫描基础镜像和依赖的已知漏洞(CVE),并定期更新基础镜像。"
tags:
  - "container"
  - "OCI"
  - "image"
  - "multi-stage"
  - "non-root"
  - "dockerignore"
  - "vulnerability scan"
  - "Dockerfile"
  - "docker-compose"
  - "COPY"
  - "RUN"
  - "FROM"
  - "docker build"
---

# 📦 容器化标准 (Containerization)

> 构建小巧、安全、可复现的容器镜像,并提供一致的本地开发环境。在将服务打包为镜像或确定镜像大小、攻击面、密钥注入时阅读。这是不依赖于特定构建工具/运行时(Docker、Podman、Buildah、containerd 等)的 OCI 通用标准。

## 1. 核心原则
- **镜像要小**: 最终镜像中只保留运行应用所必需的内容。从运行时镜像中移除构建工具、源代码、缓存、文档,以减小体积和攻击面。
- **分离构建与运行(多阶段)**: 将构建阶段与运行阶段分开,使编译器、包管理器、中间产物不会泄漏到最终镜像。
- **以 non-root 运行**: 容器进程以专用的非特权用户而非 root 运行。减小容器逃逸、权限提升的影响范围。
- **有意利用层缓存**: 先复制不常变的内容(依赖清单),后复制常变的内容(源代码),以提高缓存命中率。一次性全部复制会在改动一行代码时重新拉取依赖。
- **减小构建上下文**: 用忽略文件(`.dockerignore` 等)将 VCS 元数据、依赖目录、密钥、测试文件排除出构建上下文。构建更快且敏感文件不会混入镜像。
- **标签要不可变(immutable)**: 用具体版本或摘要(SHA)固定,而不是 `latest` 这类浮动标签,以保证可复现的构建。
- **密钥在运行时注入**: 不要把 API 密钥、密码烤进镜像层(构建参数/环境变量)。通过运行时环境变量、密钥挂载从外部注入 — 镜像层任何人都能查看。
- **镜像要不可变、可丢弃**: 不要通过修改运行中的容器来积累状态。把状态放在外部(卷、DB),让镜像无论何时丢弃再启动都表现一致。
- **扫描漏洞**: 在构建流水线中扫描基础镜像和依赖的已知漏洞(CVE),并定期更新基础镜像。

## 2. 规则

### 2-1. 用多阶段只保留构建产物
- 在构建阶段编译/打包,在运行时阶段只复制该产物及其运行依赖。
- 不要把编译器、构建缓存、源码树留在最终镜像中。

```text
# ❌ 禁止 — 单一阶段中构建工具、源码、缓存全部残留
build-tools + source + deps + artifact  → 最终镜像 (庞大、攻击面大)

# ✅ 推荐 — 只把构建产物复制到运行时阶段
stage(build):   build-tools + source → artifact
stage(runtime): runtime-deps + artifact   # 无构建工具、无源码
```

### 2-2. 以 non-root 用户运行
- 创建一个专用的非特权用户,并以该用户启动进程。
- 不要以默认值(root)运行。只给真正需要的目录授权。

```text
# ❌ 禁止 — 以默认 root 运行
(未指定 USER) → 以 root 权限运行应用

# ✅ 推荐 — 以专用非特权用户运行
create user appuser → run as appuser
```

### 2-3. 以保住层缓存的顺序复制
- 先复制并安装依赖清单,然后再复制源代码。
- 让仅源码变更时依赖安装层能从缓存复用。

```text
# ❌ 禁止 — 一次性全部复制 → 仅改一行代码也重装依赖
copy(everything) → install deps → build

# ✅ 推荐 — 清单先(缓存),源码后
copy(manifest) → install deps   # 清单未变则缓存命中
copy(source)   → build
```

### 2-4. 从构建上下文排除不必要、敏感的文件
- 用忽略文件排除 VCS 元数据、依赖目录、环境文件、测试、文档。
- 从根本上杜绝密钥混入镜像的事故,并减少构建上下文传输量。

```text
# ✅ 推荐 — 加入忽略列表 (示例)
.git              # VCS 元数据
.env              # 密钥
<deps-dir>        # 可重装的依赖 (例如 node_modules, .venv)
build/ dist/      # 产物
tests/ *.test.*   # 测试
```

### 2-5. 将镜像标签固定为不可变
- 基础镜像和部署镜像都固定为具体版本或摘要。
- 不要依赖 `latest` 这类所指目标会变的标签 — 构建可复现性会被破坏。

```text
# ❌ 禁止 — 浮动标签
FROM runtime:latest

# ✅ 推荐 — 用版本/摘要固定
FROM runtime:20.11.1
FROM runtime@sha256:<digest>
```

### 2-6. 不要把密钥烤进镜像,而在运行时注入
- 不要把密码、令牌、密钥写死为构建参数或镜像环境变量。
- 用运行时环境变量、密钥挂载注入。任何人都能提取并查看镜像层。

```text
# ❌ 禁止 — 密钥永久残留在镜像层中
ENV API_KEY=sk-live-12345

# ✅ 推荐 — 运行时从外部注入
(镜像中无值) → 运行时通过环境变量/密钥挂载传入
```

### 2-7. 审视健康检查与只读文件系统
- 定义健康检查,让编排器能知道容器是否"存活"以及"可处理请求"。
- 尽可能将根文件系统设为只读,只把需要写入的路径通过卷/tmpfs 打开。

```text
# ✅ 推荐
healthcheck: 通过应用状态端点/命令判断就绪状态
read-only root fs + 只挂载需要写入的路径
```

### 2-8. 在构建流水线中扫描漏洞
- 自动扫描基础镜像、依赖的已知漏洞(CVE),并定期更新基础镜像。
- 扫描是与工具无关的步骤 — 用团队所用的扫描器(Trivy、Grype、云镜像仓库扫描等)挂到 CI 上。

```text
# ✅ 推荐 — 在 CI 阶段包含扫描
build image → scan(image) → (漏洞超过阈值时构建失败)
```

## 3. 常见错误
- **以单一阶段构建** → 编译器、源码、缓存留在最终镜像中导致臃肿且攻击面变大。用多阶段只保留产物。
- **以 root 运行** → 容器逃逸时损失更大。以专用非特权用户运行。
- **一次性全部复制** → 改一行代码也重新拉取依赖,使构建变慢。清单先,源码后。
- **依赖 `latest` 标签** → 昨天能用的构建今天就坏。用版本/摘要固定。
- **把密钥烤进镜像** → 可从层中提取。改为运行时注入。
- **缺少忽略文件** → `.env`、依赖目录、`.git` 混入构建上下文和镜像。管理好忽略列表。
- **没有健康检查** → 编排器把流量发给已死/未就绪的容器。
- **省略漏洞扫描** → 已知 CVE 原样部署。把扫描挂到 CI。
- **在容器内积累状态** → 重启/重部署时数据丢失。状态放在外部(卷、DB)。

## 4. 检查清单
- [ ] 是否用**多阶段构建**在最终镜像中只保留产物(移除构建工具、源码)
- [ ] 是否以 **non-root** 非特权用户运行
- [ ] 是否先复制依赖清单以保住**层缓存**
- [ ] 是否用忽略文件(`.dockerignore` 等)**从构建上下文排除不必要、敏感的文件**
- [ ] 镜像标签是否为**固定版本/摘要**(禁止 `latest`)
- [ ] 是否**在运行时注入密钥**(禁止硬编码到构建参数/镜像环境变量)
- [ ] 安装包时是否**移除缓存**以减小层
- [ ] 是否定义了**健康检查**
- [ ] 是否审视了**只读文件系统**(只开放需要写入的路径)
- [ ] 是否在构建流水线中**扫描漏洞**(定期更新基础镜像)

## 附录: 各技术栈示例

> 以下是以 Docker 为基准的参考实现示例。请按相同模式为团队所用的运行时/构建工具(例如 Podman、Buildah、containerd,或其他基础镜像)添加示例。上面 1~4 的原则、规则是标准,附录只是其应用案例。验证模型/统一错误响应等输入验证请参考单独的技能(`输入值验证标准`)。

### Docker

#### 多阶段 Dockerfile (Node.js)
```dockerfile
# Stage 1: Build — 安装包含 devDependencies 的全部后构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                       # 全部依赖 (build 需要 devDependencies)
COPY . .
RUN npm run build

# Stage 2: Production — 仅构建产物 + 运行依赖
FROM node:20-alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev            # 仅安装运行依赖
COPY --from=builder /app/dist ./dist   # 仅复制构建产物
USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### 多阶段 Dockerfile (Python / FastAPI)
```dockerfile
FROM python:3.12-slim AS base
RUN adduser --disabled-password --no-create-home appuser
WORKDIR /app

# Build — 构建 wheel 以收集运行依赖 (构建工具从最终镜像排除)
FROM base AS builder
RUN pip install --no-cache-dir build
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Production — 仅安装预先构建的运行依赖
FROM base AS production
COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt
COPY . .
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### .dockerignore
```
.git
.env
node_modules
dist
__pycache__
*.pyc
.pytest_cache
tests/
*.test.*
README.md
```

#### Docker Compose (本地开发)
```yaml
services:
  app:
    build: { context: ., target: development }
    volumes: ["./src:/app/src"]   # Hot reload
    environment:
      DATABASE_URL: postgresql://postgres:password@db:5432/mydb
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16-alpine
    environment: { POSTGRES_PASSWORD: password }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
    volumes: ["postgres-data:/var/lib/postgresql/data"]

volumes:
  postgres-data:
```

#### 漏洞扫描 (示例命令)
```
docker scan <image>      # 或
trivy image <image>
```
