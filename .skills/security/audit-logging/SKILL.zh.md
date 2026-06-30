---
name: 安全审计日志 & 事件追踪
description: 将安全相关事件(认证、授权、数据变更、管理行为)记录到不可篡改的审计日志并检测异常迹象的标准。在构建认证/授权流程、添加敏感数据变更或管理功能、或确定审计日志结构、保留与告警时阅读。关键词: audit_log, audit, event_log, security_event, append-only, structured_log, SIEM。
rules:
  - "认证事件(登录成功、失败、登出、令牌刷新)与授权失败必须记录到审计日志。"
  - "审计日志以不可篡改(append-only)方式存储，并保存在与应用日志分离的存储中。"
  - "审计日志条目包含时间戳(UTC)、行为者(user_id、IP)、对象(resource_id)、行为与结果。"
  - "不在审计日志中暴露个人信息，敏感值需脱敏或以哈希引用。"
  - "为登录失败反复、异常时段访问、大批量数据查询等异常模式设置告警。"
tags:
  - "audit_log"
  - "audit"
  - "event_log"
  - "security_event"
  - "append-only"
  - "structured_log"
  - "SIEM"
---

# 🔒 安全审计日志 & 事件追踪

> 将安全事件以结构化审计日志留存，用以追踪事故并检测异常迹象。在构建认证、授权、敏感数据变更或管理功能，或确定审计日志结构、保留与告警时阅读。

## 1. 核心原则

- 认证事件(登录成功、失败、登出、令牌刷新)与授权失败必须记录到审计日志。
- 审计日志以不可篡改(append-only)方式存储，并保存在与应用日志分离的存储中。
- 审计日志条目包含时间戳(UTC)、行为者(user_id、IP)、对象(resource_id)、行为与结果。
- 不在审计日志中暴露个人信息，敏感值需脱敏或以哈希引用。
- 为登录失败反复、异常时段访问、大批量数据查询等异常模式设置告警。

## 2. 规则

### 2-1. 审计日志必记事件

以下类别的事件须无遗漏地记录。

| 类别 | 事件示例 |
|----------|-------------|
| 认证 | 登录成功/失败、登出、密码变更、MFA 尝试 |
| 授权 | 权限不足的访问尝试、角色变更 |
| 数据变更 | 创建、更新、删除(敏感资源) |
| 管理行为 | 用户创建/删除、配置变更、权限授予 |
| 系统 | 服务启动/停止、配置文件变更 |

### 2-2. 审计日志结构(必需字段 + append-only 记录)

```python
from dataclasses import dataclass
from datetime import datetime, timezone

@dataclass
class AuditEvent:
    timestamp: str     # ISO 8601 UTC
    event_type: str    # "AUTH_LOGIN_FAILED"
    actor_id: str      # "user_abc123" 또는 "system"
    actor_ip: str      # "192.168.1.1"
    resource_type: str # "User", "Order", "File"
    resource_id: str   # "order_xyz789"
    action: str        # "READ", "CREATE", "UPDATE", "DELETE"
    result: str        # "SUCCESS", "FAILURE", "DENIED"
    detail: dict       # 추가 컨텍스트 (민감 정보 제외)

def record_audit(event: AuditEvent):
    # append-only 스토리지에 기록
    audit_db.insert_one(asdict(event))
    # SIEM으로 스트리밍
    siem_client.send(event)
```

### 2-3. 敏感信息脱敏(禁止暴露个人信息)

```python
# ❌ 금지 — 비밀번호·토큰 등 민감 값을 평문으로 detail에 담음
detail = {"password": raw_password, "token": access_token}

# ✅ 권장 — 민감 값은 마스킹하거나 해시로 참조
detail = {"password": "***", "token_hash": sha256(access_token)}
```

### 2-4. 异常检测告警规则

```python
ALERT_RULES = [
    # 5분 내 로그인 실패 5회 이상
    {"event": "AUTH_LOGIN_FAILED", "count": 5, "window_sec": 300},
    # 1시간 내 대용량 데이터 조회 (>1000 rows)
    {"event": "DATA_EXPORT", "threshold": 1000, "window_sec": 3600},
    # 근무 시간 외(22:00~06:00) 관리 행위
    {"event": "ADMIN_ACTION", "time_range": "22:00-06:00"},
]
```

### 2-5. 日志保留策略

| 日志类型 | 保留期限 | 原因 |
|-----------|-----------|------|
| 认证日志 | 1 年 | 安全调查 |
| 数据变更日志 | 3 年 | 法律要求 |
| 管理行为日志 | 5 年 | 合规要求 |
| 一般访问日志 | 90 天 | 存储成本 |

## 3. 常见错误

- 将审计日志与应用日志混合存储 → 篡改/删除风险，丧失可追溯性。
- 在 detail 中以明文记录密码、令牌、身份证号等敏感值。
- 不记录授权失败(权限不足的访问),从而漏掉攻击尝试。
- 只堆积日志而无告警 → 异常迹象只能事后才发现。
- 未设置保留期限 → 违反法律要求或产生不必要的存储成本。

## 4. 检查清单

- [ ] 是否记录了认证、授权、数据变更、管理行为的全部事件?
- [ ] 是否将审计日志以 append-only 方式、保存在与应用日志分离的存储中?
- [ ] 是否填齐了时间戳(UTC)、行为者、对象、行为、结果字段?
- [ ] 是否对敏感值做了脱敏/哈希处理，使个人信息不被暴露?
- [ ] 是否为登录失败反复、异常时段访问、大批量查询设置了告警?
- [ ] 是否按日志类型定义了保留期限?
