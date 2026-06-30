---
name: Kubernetes デプロイ標準
description: コンテナオーケストレーションの安定運用のための標準 — リソースの requests/limits、liveness/readiness プローブ、ConfigMap/Secret の分離、無停止ローリングアップデート、宣言的 IaC 管理を扱う。K8s にアプリをデプロイする、またはリソース・ヘルスチェック・設定・デプロイ戦略を決める際に読む。キーワード: kubernetes, k8s, helm, deployment, health-probe.
rules:
  - "すべてのコンテナに resources.requests/limits を明示する — 未設定だとノードのリソース枯渇・OOMKill・隣接への影響（noisy neighbor）のリスクがある。requests でスケジューリング、limits で上限を設ける。CPU は throttle、メモリ超過は OOMKill。"
  - "liveness と readiness プローブを分離する — readiness 失敗時はトラフィックから除外するのみ、liveness 失敗時は再起動する。startup プローブで遅い起動を保護する。"
  - "設定は ConfigMap、機密は Secret（または外部のシークレットマネージャ）に分離する — イメージ・マニフェストへの平文ハードコード禁止。Secret には RBAC・暗号化（etcd at-rest）を適用する。"
  - "デプロイは RollingUpdate + maxSurge/maxUnavailable で無停止とし、失敗判定基準と自動ロールバックを設ける。重要なサービスは PodDisruptionBudget で同時終了を防止する。"
  - "マニフェストは Helm/Kustomize で環境別に管理し Git（IaC）に置く — kubectl edit による手動変更禁止（GitOps）。"
tags:
  - "kubernetes"
  - "k8s"
  - "helm"
  - "deployment"
  - "health-probe"
---

# ☸️ Kubernetes デプロイ標準

> コンテナオーケストレーションの事実上の標準。K8s にアプリをデプロイする、またはリソース・ヘルスチェック・設定分離・無停止デプロイ戦略を決める際に読む。

## 1. 基本原則
- すべてのコンテナに `resources.requests/limits` を明示する — 未設定だとノードのリソース枯渇・OOMKill・隣接への影響（noisy neighbor）のリスクがある。requests でスケジューリング、limits で上限を設ける。CPU は throttle、メモリ超過は OOMKill。
- liveness と readiness プローブを分離する — readiness 失敗時はトラフィックから除外するのみ、liveness 失敗時は再起動する。startup プローブで遅い起動を保護する。
- 設定は ConfigMap、機密は Secret（または外部のシークレットマネージャ）に分離する — イメージ・マニフェストへの平文ハードコード禁止。Secret には RBAC・暗号化（etcd at-rest）を適用する。
- デプロイは RollingUpdate + `maxSurge`/`maxUnavailable` で無停止とし、失敗判定基準と自動ロールバックを設ける。重要なサービスは PodDisruptionBudget で同時終了を防止する。
- マニフェストは Helm/Kustomize で環境別に管理し Git（IaC）に置く — `kubectl edit` による手動変更禁止（GitOps）。

## 2. ルール

### 2-1. リソースの requests/limits（必須）
未設定だとノードのリソース枯渇・OOMKill・noisy neighbor のリスク。

```yaml
# ❌ 禁止 — resources 未設定（リソース枯渇・OOMKill リスク）
containers:
  - name: app
    image: myapp:1.0

# ✅ 推奨 — requests でスケジューリング、limits で上限
containers:
  - name: app
    image: myapp:1.0
    resources:
      requests: { cpu: "250m", memory: "256Mi" }
      limits:   { cpu: "500m", memory: "512Mi" }
```

### 2-2. liveness / readiness プローブの分離
readiness 失敗 → トラフィックから除外するのみ、liveness 失敗 → 再起動。

```yaml
# ✅ 推奨 — 役割の異なる 2 つのプローブを分離
readinessProbe:           # 「トラフィックを受ける準備ができた」
  httpGet: { path: /ready, port: 8080 }
livenessProbe:            # 「プロセスが生きている」
  httpGet: { path: /healthz, port: 8080 }
startupProbe:             # 遅い起動を保護
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
```

### 2-3. 設定/機密の分離（ハードコード禁止）
```yaml
# ❌ 禁止 — イメージ・マニフェストに平文の機密
env:
  - name: DB_PASSWORD
    value: "p@ssw0rd"

# ✅ 推奨 — ConfigMap（設定）/ Secret（機密）に分離
envFrom:
  - configMapRef: { name: app-config }
  - secretRef:    { name: app-secret }   # RBAC・etcd 暗号化を適用
```

### 2-4. 無停止ローリングアップデート + 自動ロールバック
```yaml
# ✅ 推奨 — 段階的ロールアウト + PDB で同時終了を防止
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
---
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2
```

### 2-5. 宣言的管理（GitOps）
```bash
# ❌ 禁止 — 手動変更（ドリフト・追跡不能）
kubectl edit deployment myapp

# ✅ 推奨 — Helm/Kustomize マニフェストを Git に置き CI/CD で適用
helm upgrade --install myapp ./chart -f values-prod.yaml
```

## 3. よくある誤り
- resources 未設定 → 1 つの Pod がノードのリソースを独占し隣接を殺す。
- liveness/readiness を同一に設定 → 一時的な負荷でも再起動ループ。
- 機密を ConfigMap・イメージに平文で保存 → 漏洩リスク。
- `kubectl edit` で直接修正 → Git と食い違い、次のデプロイでロールバックされる。

## 4. チェックリスト
- [ ] すべてのコンテナに requests/limits を明示したか
- [ ] liveness と readiness プローブを役割に応じて分離したか
- [ ] 設定は ConfigMap、機密は Secret に分離し、ハードコードがないか
- [ ] RollingUpdate + maxSurge/maxUnavailable で無停止を保証し、自動ロールバック基準があるか
- [ ] 重要なサービスに PodDisruptionBudget を設けたか
- [ ] マニフェストを Git（IaC）で管理し、手動変更がないか
