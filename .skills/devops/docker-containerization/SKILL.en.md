---
name: Containerization Standard (Containerization)
description: A universal standard for container images — small images, multi-stage builds, non-root execution, layer caching, build-context exclusions, immutable tags, runtime secret injection, vulnerability scanning — universal OCI concepts independent of runtime/tooling. Read it when containerizing a service or deciding image size, attack surface, and secret injection. Keywords: container, OCI, image, multi-stage, non-root, dockerignore, vulnerability scan, Dockerfile, docker-compose.
rules:
  - "Keep images small: leave in the final image only what is strictly necessary to run the application. Remove build tools, source code, caches, and docs from the runtime image to reduce size and attack surface."
  - "Separate build and runtime (multi-stage): split the build stage from the run stage so compilers, package managers, and intermediate outputs do not leak into the final image."
  - "Run as non-root: run the container process as a dedicated unprivileged user, not root. This reduces the blast radius of container escape and privilege escalation."
  - "Use layer caching deliberately: copy what changes rarely (dependency manifests) first and what changes often (source code) later to raise cache hit rate. Copying everything at once re-fetches dependencies even when you change a single line of code."
  - "Reduce the build context: use an ignore file (.dockerignore, etc.) to exclude VCS metadata, dependency directories, secrets, and test files from the build context. Builds get faster and sensitive files do not get mixed into the image."
  - "Keep tags immutable: instead of floating tags like latest, pin to a specific version or digest (SHA) to guarantee reproducible builds."
  - "Inject secrets at runtime: do not bake API keys and passwords into image layers (build args/environment variables). Inject them from outside via runtime environment variables or secret mounts — image layers can be inspected by anyone."
  - "Keep images immutable and disposable: do not accumulate state by modifying a running container. Keep state outside (volumes, DB), and make the image behave identically whenever it is discarded and re-launched."
  - "Scan for vulnerabilities: scan base images and dependencies for known vulnerabilities (CVEs) in the build pipeline, and update base images periodically."
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

# 📦 Containerization Standard (Containerization)

> Build small, secure, reproducible container images and provide a consistent local development environment. Read it when packaging a service into an image or deciding image size, attack surface, and secret injection. It is a universal OCI standard not tied to any specific build tool/runtime (Docker, Podman, Buildah, containerd, etc.).

## 1. Core Principles
- **Keep images small**: leave in the final image only what is strictly necessary to run the application. Remove build tools, source code, caches, and docs from the runtime image to reduce size and attack surface.
- **Separate build and runtime (multi-stage)**: split the build stage from the run stage so compilers, package managers, and intermediate outputs do not leak into the final image.
- **Run as non-root**: run the container process as a dedicated unprivileged user, not root. This reduces the blast radius of container escape and privilege escalation.
- **Use layer caching deliberately**: copy what changes rarely (dependency manifests) first and what changes often (source code) later to raise cache hit rate. Copying everything at once re-fetches dependencies even when you change a single line of code.
- **Reduce the build context**: use an ignore file (`.dockerignore`, etc.) to exclude VCS metadata, dependency directories, secrets, and test files from the build context. Builds get faster and sensitive files do not get mixed into the image.
- **Keep tags immutable**: instead of floating tags like `latest`, pin to a specific version or digest (SHA) to guarantee reproducible builds.
- **Inject secrets at runtime**: do not bake API keys and passwords into image layers (build args/environment variables). Inject them from outside via runtime environment variables or secret mounts — image layers can be inspected by anyone.
- **Keep images immutable and disposable**: do not accumulate state by modifying a running container. Keep state outside (volumes, DB), and make the image behave identically whenever it is discarded and re-launched.
- **Scan for vulnerabilities**: scan base images and dependencies for known vulnerabilities (CVEs) in the build pipeline, and update base images periodically.

## 2. Rules

### 2-1. Leave only build outputs via multi-stage
- Compile/bundle in the build stage, and copy only those outputs and runtime dependencies into the runtime stage.
- Do not leave compilers, build caches, or source trees in the final image.

```text
# ❌ Forbidden — a single stage retains build tools, source, and cache
build-tools + source + deps + artifact  → final image (huge, large attack surface)

# ✅ Recommended — copy only build outputs to the runtime stage
stage(build):   build-tools + source → artifact
stage(runtime): runtime-deps + artifact   # no build tools or source
```

### 2-2. Run as a non-root user
- Create a dedicated unprivileged user and launch the process as that user.
- Do not run as the default (root). Grant permissions only on directories that strictly need them.

```text
# ❌ Forbidden — run as default root
(no USER specified) → app runs with root privileges

# ✅ Recommended — run as a dedicated unprivileged user
create user appuser → run as appuser
```

### 2-3. Copy in an order that preserves layer cache
- Copy and install dependency manifests first, then copy the source code.
- Make the dependency-install layer reusable from cache when only the source changes.

```text
# ❌ Forbidden — copy everything at once → reinstall dependencies even for a one-line code change
copy(everything) → install deps → build

# ✅ Recommended — manifest first (cache), source later
copy(manifest) → install deps   # cache hit when manifest is unchanged
copy(source)   → build
```

### 2-4. Exclude unnecessary/sensitive files from the build context
- Use an ignore file to exclude VCS metadata, dependency directories, env files, tests, and docs.
- Eliminate at the source the accident of secrets getting mixed into the image, and reduce build-context transfer volume.

```text
# ✅ Recommended — include in the ignore list (example)
.git              # VCS metadata
.env              # secrets
<deps-dir>        # reinstallable dependencies (e.g. node_modules, .venv)
build/ dist/      # outputs
tests/ *.test.*   # tests
```

### 2-5. Pin image tags immutably
- Pin both base images and deployment images to a specific version or digest.
- Do not depend on tags like `latest` whose target changes — build reproducibility breaks.

```text
# ❌ Forbidden — floating tag
FROM runtime:latest

# ✅ Recommended — pin by version/digest
FROM runtime:20.11.1
FROM runtime@sha256:<digest>
```

### 2-6. Do not bake secrets into the image; inject at runtime
- Do not embed passwords, tokens, or keys as build args or image environment variables.
- Inject them via runtime environment variables or secret mounts. Image layers can be extracted and inspected by anyone.

```text
# ❌ Forbidden — the secret remains permanently in an image layer
ENV API_KEY=sk-live-12345

# ✅ Recommended — inject from outside at runtime
(no value in the image) → passed at run time via environment variable/secret mount
```

### 2-7. Review health checks and a read-only filesystem
- Define a health check so the orchestrator can know that the container is "alive" and "able to handle requests."
- Where possible, make the root filesystem read-only and open only the paths that need writes via volumes/tmpfs.

```text
# ✅ Recommended
healthcheck: judge readiness via the app's status endpoint/command
read-only root fs + mount only the paths that need writes
```

### 2-8. Scan for vulnerabilities in the build pipeline
- Automatically scan base images and dependencies for known vulnerabilities (CVEs), and update base images periodically.
- Scanning is a tool-agnostic stage — wire it into CI with your team's scanner (Trivy, Grype, cloud registry scan, etc.).

```text
# ✅ Recommended — include the scan in a CI stage
build image → scan(image) → (fail the build when the vulnerability threshold is exceeded)
```

## 3. Common Mistakes
- **Building in a single stage** → compilers, source, and cache remain in the final image, bloating it and enlarging the attack surface. Leave only outputs via multi-stage.
- **Running as root** → damage grows on container escape. Run as a dedicated unprivileged user.
- **Copying everything at once** → reinstalling dependencies even for a one-line code change slows the build. Manifest first, source later.
- **Depending on the `latest` tag** → a build that worked yesterday breaks today. Pin by version/digest.
- **Baking secrets into the image** → extractable from layers. Switch to runtime injection.
- **Missing ignore file** → `.env`, dependency directories, and `.git` get mixed into the build context and image. Manage the ignore list.
- **No health check** → the orchestrator sends traffic to dead/not-ready containers.
- **Skipping vulnerability scanning** → known CVEs get deployed as-is. Wire a scan into CI.
- **Accumulating state inside the container** → data is lost on restart/redeploy. Keep state outside (volumes, DB).

## 4. Checklist
- [ ] Did you leave only outputs in the final image via a **multi-stage build** (build tools/source removed)?
- [ ] Do you run as a **non-root** unprivileged user?
- [ ] Did you copy the dependency manifest first to preserve the **layer cache**?
- [ ] Did you use an ignore file (`.dockerignore`, etc.) to **exclude unnecessary/sensitive files from the build context**?
- [ ] Is the image tag a **pinned version/digest** (`latest` forbidden)?
- [ ] Do you **inject secrets at runtime** (no hardcoding in build args/image environment variables)?
- [ ] Did you **remove caches** during package installation to shrink layers?
- [ ] Did you define a **health check**?
- [ ] Did you review a **read-only filesystem** (open only the paths that need writes)?
- [ ] Do you **scan for vulnerabilities** in the build pipeline (periodic base-image updates)?

## Appendix: Per-Stack Examples

> The following are Docker-based reference implementation examples. Add examples matching your team's runtime/build tool (e.g. Podman, Buildah, containerd, or a different base image) following the same pattern. The principles/rules in 1–4 above are the standard; the appendix is merely an application example. For input validation such as validation models/unified error responses, refer to the separate skill (`Input Validation Standard`).

### Docker

#### Multi-stage Dockerfile (Node.js)
```dockerfile
# Stage 1: Build — full install including devDependencies, then build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                       # all dependencies (build needs devDependencies)
COPY . .
RUN npm run build

# Stage 2: Production — only build outputs + runtime dependencies
FROM node:20-alpine AS production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev            # install only runtime dependencies
COPY --from=builder /app/dist ./dist   # copy only build outputs
USER appuser
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### Multi-stage Dockerfile (Python / FastAPI)
```dockerfile
FROM python:3.12-slim AS base
RUN adduser --disabled-password --no-create-home appuser
WORKDIR /app

# Build — build wheels to gather runtime dependencies (build tools excluded from the final image)
FROM base AS builder
RUN pip install --no-cache-dir build
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Production — install only the pre-built runtime dependencies
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

#### Docker Compose (local development)
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

#### Vulnerability scan (example commands)
```
docker scan <image>      # or
trivy image <image>
```
