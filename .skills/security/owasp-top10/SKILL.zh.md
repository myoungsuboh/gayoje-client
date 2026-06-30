---
name: OWASP Top 10 安全指南
description: 基于 OWASP Top 10（2021）预防主要漏洞的防御性编码标准 — 涵盖 Injection、XSS、认证缺陷、易受攻击的依赖等。在设计/实现新功能、处理外部输入/认证/权限/数据暴露时，以及在安全检查、代码审查时阅读。关键词: sanitize, escape, parameterized, IDOR, XSS, injection, npm audit, Content-Security-Policy。
rules:
  - "所有外部输入（用户·API·文件）均不可信，使用白名单校验或参数化查询。"
  - "输出 HTML 时必须转义用户输入，且不将未校验数据插入 innerHTML。"
  - "为防止 IDOR，访问资源时在服务端重新校验所有权与权限。"
  - "敏感数据（密码·令牌·PII）不暴露在响应体·URL·日志中。"
  - "定期扫描依赖漏洞（npm audit / pip-audit），CRITICAL 漏洞立即修补。"
tags:
  - "sanitize"
  - "escape"
  - "parameterized"
  - "IDOR"
  - "XSS"
  - "injection"
  - "npm audit"
  - "Content-Security-Policy"
foundational: true
---

# 🔒 OWASP Top 10 安全指南

> 基于 OWASP Top 10（2021）将预防主要漏洞的防御性编码标准化。在设计/实现新功能、处理外部输入/认证/权限/敏感数据时，以及在安全检查、代码审查时阅读。

## 1. 核心原则

- 所有外部输入（用户·API·文件）均不可信，使用白名单校验或参数化查询。
- 输出 HTML 时必须转义用户输入，且不将未校验数据插入 `innerHTML`。
- 为防止 IDOR，访问资源时在服务端重新校验所有权与权限。
- 敏感数据（密码·令牌·PII）不暴露在响应体·URL·日志中。
- 定期扫描依赖漏洞（`npm audit` / `pip-audit`），CRITICAL 漏洞立即修补。

## 2. 规则

### 2-1. OWASP Top 10 (2021) 概览

| 排名 | 漏洞 | 核心防范措施 |
|------|--------|-------------|
| A01 | 访问控制缺陷 | 服务端权限校验，阻断 IDOR |
| A02 | 加密失败 | 强制 HTTPS，敏感数据加密存储 |
| A03 | 注入 | 参数化查询，输入校验 |
| A04 | 不安全的设计 | 威胁建模，安全设计模式 |
| A05 | 安全配置错误 | 修改默认值，禁用不必要的功能 |
| A06 | 易受攻击且过时的组件 | SCA 扫描，自动更新 |
| A07 | 认证·会话失败 | MFA，会话过期，安全的令牌存储 |
| A08 | 软件·数据完整性失败 | 签名校验，CI/CD 安全 |
| A09 | 安全日志·监控失败 | 审计日志，异常检测告警 |
| A10 | SSRF | 外部 URL 请求白名单 |

### 2-2. 预防 SQL Injection (A03)

```python
# ❌ 금지 — 문자열 조합 쿼리 (입력이 SQL로 해석됨)
query = f"SELECT * FROM users WHERE email = '{email}'"

# ✅ 권장 — 파라미터화 쿼리
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
```

### 2-3. 预防 XSS (A03)

```javascript
// ❌ 금지 — 미검증 입력을 innerHTML에 삽입 (스크립트 실행 위험)
element.innerHTML = userInput;

// ✅ 권장
element.textContent = userInput;       // DOM API
DOMPurify.sanitize(htmlContent);       // HTML 허용 시 sanitize
```

### 2-4. 预防 IDOR（不安全的直接对象引用漏洞） (A01)

```python
# ✅ 권장 — 서버에서 소유권 항상 재검증
def get_order(order_id: str, current_user: User):
    order = db.get(order_id)
    if order.user_id != current_user.id:
        raise ForbiddenError("접근 권한이 없습니다")
    return order
```

## 3. 常见错误

- 仅在客户端检查权限而不在服务端重新校验 → 绕过访问控制。
- 将敏感数据留在日志·URL 查询字符串中 → 制造泄漏途径。
- 未将依赖漏洞扫描纳入 CI，导致过时组件累积。

## 4. 检查清单

- [ ] 是否以白名单校验或参数化查询处理了所有外部输入
- [ ] 输出 HTML 时是否转义，且未将未校验数据放入 `innerHTML`
- [ ] 访问资源时是否在服务端重新校验了所有权与权限
- [ ] 是否未将敏感数据暴露在响应体·URL·日志中
- [ ] 是否扫描了依赖漏洞并修补了 CRITICAL

---

- 输入校验的**具体实现**（如 Pydantic/Zod 的声明式校验）请参考 `input-validation` 技能 — 本技能涵盖 Top 10 概览与优先级。
