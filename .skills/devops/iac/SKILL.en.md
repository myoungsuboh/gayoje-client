---
name: Infrastructure as Code (IaC) — Terraform
description: The standard for declaratively managing cloud infrastructure with Terraform — covers modularization, remote state management, environment separation, and drift detection. Read it when defining or changing infrastructure as code, or when deciding on a state backend, CI integration, or environment configuration. Keywords: terraform, .tf, provider, resource, module, tfstate, plan, apply.
rules:
  - "Make all infrastructure changes only through Terraform code; never change anything manually in the console."
  - "Run terraform plan automatically in CI to comment the changes on the PR, and run apply only after approval."
  - "Store the Terraform state file (tfstate) in a remote backend such as S3, GCS, or Terraform Cloud, not locally."
  - "Use independent state files and variable files per environment (dev, staging, prod), and do not share resources between them."
  - "Extract repeatedly used infrastructure patterns into reusable modules and pin their versions."
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

# 🏗️ Infrastructure as Code (IaC) — Terraform

> Manage cloud infrastructure declaratively with Terraform code. Read it when newly defining or changing infrastructure, or when deciding on state management, environment separation, or CI integration.

## 1. Core principles
- Make all infrastructure changes only through Terraform code; never change anything manually in the console.
- Run `terraform plan` automatically in CI to comment the changes on the PR, and run `apply` only after approval.
- Store the Terraform state file (tfstate) in a remote backend such as S3, GCS, or Terraform Cloud, not locally.
- Use independent state files and variable files per environment (dev, staging, prod), and do not share resources between them.
- Extract repeatedly used infrastructure patterns into reusable modules and pin their versions.

## 2. Rules

### 2-1. Directory structure (environment separation)
Keep independent state and variables per environment, and separate common patterns into modules.

```
infrastructure/
├── modules/
│   ├── vpc/           # reusable modules
│   ├── database/
│   └── app-service/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
└── shared/            # common resources (DNS, CI IAM, etc.)
```

### 2-2. Remote state backend (no local tfstate)
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/main.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # concurrent-execution lock
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # pinned version
    }
  }
}
```

### 2-3. Module pattern (reuse + version pinning)
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
  # ... security groups, subnets, etc.
}

output "endpoint" { value = aws_db_instance.this.endpoint }

# environments/production/main.tf — using the module
module "postgres" {
  source         = "../../modules/database"
  name           = "myapp"
  instance_class = "db.r5.large"
  environment    = "production"
}
```

### 2-4. CI/CD integration — plan is automatic, apply after approval (GitHub Actions)
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

- name: Terraform Apply (main branch only)
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

### 2-5. Drift detection (code ↔ actual infrastructure)
```bash
# Run periodically to detect differences between actual infrastructure and code
terraform plan -detailed-exitcode
# Exit code 2 = changes exist → send an alert
```

## 3. Common mistakes
- Manual changes in the console → code and actual infrastructure diverge, causing drift.
- Keeping tfstate locally or in git → concurrent-work conflicts and leakage of sensitive information.
- Sharing state or resources across environments → a change in one environment breaks another.
- Not pinning module/provider versions → unexpected upgrades cause deployment failures.

## 4. Checklist
- [ ] Are all changes made only through code, with no manual console changes?
- [ ] Is tfstate stored in a remote backend with locking configured?
- [ ] Are per-environment state and variable files separated independently?
- [ ] Are repeated patterns extracted into modules with pinned versions?
- [ ] Does CI run plan automatically and apply only after approval?
- [ ] Is drift detection run periodically?
