---
name: 基础设施即代码 (IaC) — Terraform
description: 用 Terraform 以声明式方式管理云基础设施的标准 — 涵盖模块化、远程状态管理、环境隔离、漂移检测。当以代码定义或变更基础设施，或确定状态后端、CI 集成、环境配置时阅读。关键词: terraform, .tf, provider, resource, module, tfstate, plan, apply。
rules:
  - "所有基础设施变更只能通过 Terraform 代码执行，不在控制台手动变更。"
  - "在 CI 中自动运行 terraform plan，将变更以评论形式显示在 PR 上，apply 在批准后执行。"
  - "Terraform 状态文件(tfstate)保存到 S3、GCS、Terraform Cloud 等远程后端，不放在本地。"
  - "为每个环境(dev、staging、prod)使用独立的状态文件和变量文件，不共享资源。"
  - "将重复使用的基础设施模式抽取为可复用模块，并固定其版本。"
tags:
  - "terraform"
  - ".tf"
  - "provider"
  - "resource"
  - "module"
  - "tfstate"
  - "plan"
  - "apply"
---

# 🏗️ 基础设施即代码 (IaC) — Terraform

> 用 Terraform 代码以声明式方式管理云基础设施。当新定义或变更基础设施，或确定状态管理、环境隔离、CI 集成时阅读。

## 1. 核心原则
- 所有基础设施变更只能通过 Terraform 代码执行，不在控制台手动变更。
- 在 CI 中自动运行 `terraform plan`，将变更以评论形式显示在 PR 上，`apply` 在批准后执行。
- Terraform 状态文件(tfstate)保存到 S3、GCS、Terraform Cloud 等远程后端，不放在本地。
- 为每个环境(dev、staging、prod)使用独立的状态文件和变量文件，不共享资源。
- 将重复使用的基础设施模式抽取为可复用模块，并固定其版本。

## 2. 规则

### 2-1. 目录结构 (环境隔离)
为每个环境放置独立的状态和变量，将通用模式分离为模块。

```
infrastructure/
├── modules/
│   ├── vpc/           # 可复用的模块
│   ├── database/
│   └── app-service/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
└── shared/            # 通用资源 (DNS, CI IAM 等)
```

### 2-2. 远程状态后端 (禁止本地保存 tfstate)
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/main.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # 并发执行锁
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # 固定版本
    }
  }
}
```

### 2-3. 模块模式 (复用 + 版本固定)
```hcl
# modules/database/main.tf
variable "name" { type = string }
variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "environment" { type = string }

resource "aws_db_instance" "this" {
  identifier     = "${var.environment}-${var.name}"
  instance_class = var.instance_class
  # ... 安全组、子网等
}

output "endpoint" { value = aws_db_instance.this.endpoint }

# environments/production/main.tf — 使用模块
module "postgres" {
  source         = "../../modules/database"
  name           = "myapp"
  instance_class = "db.r5.large"
  environment    = "production"
}
```

### 2-4. CI/CD 集成 — plan 自动，apply 批准后执行 (GitHub Actions)
```yaml
- name: Terraform Plan
  run: |
    terraform init
    terraform plan -out=tfplan -var-file=environments/staging/terraform.tfvars
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}

- name: PR Comment
  uses: borchero/terraform-plan-comment@v1
  with: { plan-file: "tfplan" }

- name: Terraform Apply (仅 main 分支)
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

### 2-5. 漂移检测 (代码 ↔ 实际基础设施)
```bash
# 定期运行以检测实际基础设施与代码之间的差异
terraform plan -detailed-exitcode
# 退出码 2 = 存在变更 → 发送告警
```

## 3. 常见错误
- 在控制台手动变更 → 代码与实际基础设施不一致而产生漂移。
- 将 tfstate 保存在本地或 git 中 → 并发工作冲突、敏感信息泄露。
- 在环境间共享状态或资源 → 一个环境的变更破坏另一个环境。
- 未固定模块/提供方版本 → 意外升级导致部署失败。

## 4. 检查清单
- [ ] 是否所有变更都仅通过代码执行，没有控制台手动变更
- [ ] 是否将 tfstate 保存到远程后端并配置了锁
- [ ] 是否将各环境的状态/变量文件独立隔离
- [ ] 是否将重复模式抽取为模块并固定版本
- [ ] CI 是否自动运行 plan，且 apply 在批准后执行
- [ ] 是否定期运行漂移检测
