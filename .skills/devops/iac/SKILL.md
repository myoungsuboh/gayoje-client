---
name: 인프라 코드화 (IaC) — Terraform
description: Terraform으로 클라우드 인프라를 선언적으로 관리하는 표준 — 모듈화, 원격 상태 관리, 환경 분리, 드리프트 감지를 다룬다. 인프라를 코드로 정의·변경하거나 상태 백엔드·CI 통합·환경 구성을 정할 때 읽는다. 키워드: terraform, .tf, provider, resource, module, tfstate, plan, apply.
rules:
  - "모든 인프라 변경은 Terraform 코드를 통해서만 수행하고, 콘솔에서 수동으로 변경하지 않는다."
  - "terraform plan을 CI에서 자동 실행해 PR에 변경사항을 댓글로 표시하고, apply는 승인 후 실행한다."
  - "Terraform 상태 파일(tfstate)은 S3·GCS·Terraform Cloud 등 원격 백엔드에 저장하고 로컬에 두지 않는다."
  - "환경(dev·staging·prod)별로 독립된 상태 파일과 변수 파일을 사용하고, 리소스를 공유하지 않는다."
  - "반복 사용되는 인프라 패턴은 재사용 가능한 모듈로 추출하고, 버전을 고정해 사용한다."
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

# 🏗️ 인프라 코드화 (IaC) — Terraform

> 클라우드 인프라를 Terraform 코드로 선언적으로 관리한다. 인프라를 새로 정의·변경하거나 상태 관리·환경 분리·CI 통합을 정할 때 읽는다.

## 1. 핵심 원칙
- 모든 인프라 변경은 Terraform 코드를 통해서만 수행하고, 콘솔에서 수동으로 변경하지 않는다.
- `terraform plan`을 CI에서 자동 실행해 PR에 변경사항을 댓글로 표시하고, `apply`는 승인 후 실행한다.
- Terraform 상태 파일(tfstate)은 S3·GCS·Terraform Cloud 등 원격 백엔드에 저장하고 로컬에 두지 않는다.
- 환경(dev·staging·prod)별로 독립된 상태 파일과 변수 파일을 사용하고, 리소스를 공유하지 않는다.
- 반복 사용되는 인프라 패턴은 재사용 가능한 모듈로 추출하고, 버전을 고정해 사용한다.

## 2. 규칙

### 2-1. 디렉토리 구조 (환경 분리)
환경별로 독립된 상태·변수를 두고, 공통 패턴은 모듈로 분리한다.

```
infrastructure/
├── modules/
│   ├── vpc/           # 재사용 가능한 모듈
│   ├── database/
│   └── app-service/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
└── shared/            # 공통 리소스 (DNS, CI IAM 등)
```

### 2-2. 원격 상태 백엔드 (tfstate 로컬 금지)
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/main.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # 동시 실행 잠금
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # 버전 고정
    }
  }
}
```

### 2-3. 모듈 패턴 (재사용 + 버전 고정)
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
  # ... 보안 그룹, 서브넷 등
}

output "endpoint" { value = aws_db_instance.this.endpoint }

# environments/production/main.tf — 모듈 사용
module "postgres" {
  source         = "../../modules/database"
  name           = "myapp"
  instance_class = "db.r5.large"
  environment    = "production"
}
```

### 2-4. CI/CD 통합 — plan은 자동, apply는 승인 후 (GitHub Actions)
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

- name: Terraform Apply (main 브랜치만)
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

### 2-5. 드리프트 감지 (코드 ↔ 실제 인프라)
```bash
# 정기 실행으로 실제 인프라와 코드 간 차이 감지
terraform plan -detailed-exitcode
# 종료 코드 2 = 변경사항 있음 → 알람 발송
```

## 3. 흔한 실수
- 콘솔에서 수동 변경 → 코드와 실제 인프라가 어긋나 드리프트 발생.
- tfstate를 로컬·git에 보관 → 동시 작업 충돌·민감정보 유출.
- 환경 간 상태·리소스 공유 → 한 환경 변경이 다른 환경을 깨뜨린다.
- 모듈·프로바이더 버전 미고정 → 예기치 않은 업그레이드로 배포 실패.

## 4. 체크리스트
- [ ] 모든 변경을 코드로만 수행하고 콘솔 수동 변경이 없는가
- [ ] tfstate를 원격 백엔드에 저장하고 잠금을 설정했는가
- [ ] 환경별 상태·변수 파일을 독립적으로 분리했는가
- [ ] 반복 패턴을 모듈로 추출하고 버전을 고정했는가
- [ ] CI에서 plan을 자동 실행하고 apply는 승인 후 수행하는가
- [ ] 드리프트 감지를 정기 실행하는가
