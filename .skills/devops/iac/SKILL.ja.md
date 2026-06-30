---
name: インフラのコード化 (IaC) — Terraform
description: Terraform でクラウドインフラを宣言的に管理する標準 — モジュール化、リモート状態管理、環境分離、ドリフト検知を扱う。インフラをコードとして定義・変更するとき、または状態バックエンド・CI 連携・環境構成を決めるときに読む。キーワード: terraform, .tf, provider, resource, module, tfstate, plan, apply。
rules:
  - "すべてのインフラ変更は Terraform コードを通じてのみ行い、コンソールで手動変更しない。"
  - "terraform plan を CI で自動実行して変更内容を PR にコメント表示し、apply は承認後に実行する。"
  - "Terraform 状態ファイル(tfstate)は S3・GCS・Terraform Cloud などのリモートバックエンドに保存し、ローカルに置かない。"
  - "環境(dev・staging・prod)ごとに独立した状態ファイルと変数ファイルを使い、リソースを共有しない。"
  - "繰り返し使うインフラパターンは再利用可能なモジュールとして抽出し、バージョンを固定して使う。"
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

# 🏗️ インフラのコード化 (IaC) — Terraform

> クラウドインフラを Terraform コードで宣言的に管理する。インフラを新たに定義・変更するとき、または状態管理・環境分離・CI 連携を決めるときに読む。

## 1. 基本原則
- すべてのインフラ変更は Terraform コードを通じてのみ行い、コンソールで手動変更しない。
- `terraform plan` を CI で自動実行して変更内容を PR にコメント表示し、`apply` は承認後に実行する。
- Terraform 状態ファイル(tfstate)は S3・GCS・Terraform Cloud などのリモートバックエンドに保存し、ローカルに置かない。
- 環境(dev・staging・prod)ごとに独立した状態ファイルと変数ファイルを使い、リソースを共有しない。
- 繰り返し使うインフラパターンは再利用可能なモジュールとして抽出し、バージョンを固定して使う。

## 2. ルール

### 2-1. ディレクトリ構成 (環境分離)
環境ごとに独立した状態・変数を置き、共通パターンはモジュールに分離する。

```
infrastructure/
├── modules/
│   ├── vpc/           # 再利用可能なモジュール
│   ├── database/
│   └── app-service/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── production/
└── shared/            # 共通リソース (DNS, CI IAM など)
```

### 2-2. リモート状態バックエンド (tfstate のローカル保存禁止)
```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/main.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # 同時実行ロック
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"  # バージョン固定
    }
  }
}
```

### 2-3. モジュールパターン (再利用 + バージョン固定)
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
  # ... セキュリティグループ、サブネットなど
}

output "endpoint" { value = aws_db_instance.this.endpoint }

# environments/production/main.tf — モジュールの使用
module "postgres" {
  source         = "../../modules/database"
  name           = "myapp"
  instance_class = "db.r5.large"
  environment    = "production"
}
```

### 2-4. CI/CD 連携 — plan は自動、apply は承認後 (GitHub Actions)
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

- name: Terraform Apply (main ブランチのみ)
  if: github.ref == 'refs/heads/main'
  run: terraform apply -auto-approve tfplan
```

### 2-5. ドリフト検知 (コード ↔ 実際のインフラ)
```bash
# 定期実行で実際のインフラとコードの差分を検知
terraform plan -detailed-exitcode
# 終了コード 2 = 変更あり → アラート送信
```

## 3. よくある間違い
- コンソールでの手動変更 → コードと実際のインフラが食い違いドリフトが発生。
- tfstate をローカル・git に保管 → 同時作業の競合・機密情報の漏洩。
- 環境間で状態・リソースを共有 → ある環境の変更が別の環境を壊す。
- モジュール・プロバイダのバージョン未固定 → 予期しないアップグレードでデプロイ失敗。

## 4. チェックリスト
- [ ] すべての変更をコードのみで行い、コンソールでの手動変更がないか
- [ ] tfstate をリモートバックエンドに保存しロックを設定したか
- [ ] 環境ごとの状態・変数ファイルを独立して分離したか
- [ ] 繰り返しパターンをモジュールに抽出しバージョンを固定したか
- [ ] CI で plan を自動実行し、apply は承認後に行うか
- [ ] ドリフト検知を定期実行しているか
