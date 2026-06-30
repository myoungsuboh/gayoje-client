---
name: 个人信息删除 & 被遗忘权 (Privacy Data Deletion)
description: 当用户请求删除账户/数据时，一致地处理 soft delete・hard delete・cascade・审计日志匿名化・位置/邮箱掩码的标准。在应对 GDPR Art.17・韩国个人信息保护法第36条・PIPL，或设计注销/删除流程时阅读。关键词: GDPR, anonymize, personalData, softDelete, hardDelete。
rules:
  - "将删除请求分类为 soft delete（状态变更）和 hard delete（永久删除）来处理。"
  - "批量删除以异步 Saga 作业分阶段执行（部分失败时可重试）。"
  - "审计日志不删除，而是将标识符匿名化（假名化）后保留。"
  - "对位置坐标进行掩码，将邮箱替换为哈希/假名。"
  - "在删除请求后设置30天宽限期，使其可恢复。"
  - "必须在所有分散之处（DB・外部存储・分析工具）删除，才是真正的被遗忘权。"
tags:
  - "GDPR"
  - "anonymize"
  - "personalData"
  - "softDelete"
  - "hardDelete"
  - "잊혀질 권리"
  - "데이터 이동권"
---

# 🗑️ 个人信息删除 & 被遗忘权

> GDPR Article 17、韩国个人信息保护法第36条、中国 PIPL 第47条均明确规定"用户请求时在合理期限内删除"。在处理用户数据的服务中设计注销・删除流程时阅读。
>
> 相关技能:
> - 认证/安全: [security-backend](../../security/security-backend/SKILL.md)
> - 令牌吊销: [jwt-refresh-rotation](../../security/jwt-refresh-rotation/SKILL.md)
> - DB 通用约定: db-common-conventions
> - 日志保留: [logging-observability](../logging-observability/SKILL.md)

## 1. 核心原则
- 将删除请求分类为 soft delete（状态变更）和 hard delete（永久删除）来处理。
- 批量删除以异步 Saga 作业分阶段执行（部分失败时可重试）。
- 审计日志不删除，而是将标识符匿名化（假名化）后保留。
- 对位置坐标进行掩码，将邮箱替换为哈希/假名。
- 在删除请求后设置30天宽限期，使其可恢复。
- 必须在所有分散之处（DB・外部存储・分析工具）删除，才是真正的被遗忘权。

## 2. 规则

### 2-1. Soft Delete vs Hard Delete — 分类
| 数据种类 | 策略 | 原因 |
|---|---|---|
| **用户资料** | soft → 30天后 hard | 误操作恢复余地 + 法定保留 |
| **敏感信息（位置坐标、健康数据、生物特征信息）** | **立即 hard** | GDPR 建议 — 敏感类别 |
| **支付记录** | 匿名化后保留 | 税务/会计法上 5~7 年的保留义务 |
| **用户内容（帖子、评论）** | 匿名化后保留 | 其他用户的可见性 + 服务完整性 |
| **审计日志（安全事件）** | 匿名化后保留 | 安全事故追踪 |

### 2-2. 用户数据删除 API
```java
@DeleteMapping("/users/me")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<ApiResponse<Void>> deleteAccount(@AuthenticationPrincipal Long userId,
                                                       @RequestBody DeleteAccountRequest req) {
    // 1. 비밀번호 재확인 (또는 OAuth 재인증)
    userService.verifyPassword(userId, req.getPassword());
    // 2. 삭제 잡 enqueue (비동기 처리)
    deletionService.scheduleDeletion(userId, req.getReason());
    return ResponseEntity.ok(ApiResponse.ok("계정 삭제가 접수되었습니다. 30일 이내 완전히 삭제됩니다."));
}
```

### 2-3. 异步删除作业 (Saga 模式)
按顺序删除散布在多个域中的数据。部分失败时必须可重试。
```java
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountDeletionService {

    private final List<DataDeletionHandler> handlers;
    private final DeletionRequestRepository deletionRepo;

    @Transactional
    public void scheduleDeletion(Long userId, String reason) {
        DeletionRequest req = DeletionRequest.builder()
            .userId(userId)
            .reason(reason)
            .status(DeletionStatus.PENDING)
            .requestedAt(Instant.now())
            .scheduledFor(Instant.now().plus(30, ChronoUnit.DAYS))
            .build();
        deletionRepo.save(req);

        // 즉시 처리할 항목: 토큰·세션 폐기, 민감 정보 즉시 삭제
        immediateActions(userId);
    }

    private void immediateActions(Long userId) {
        // 모든 리프레시 토큰 폐기
        refreshTokenService.revokeAllByUserId(userId, "ACCOUNT_DELETION");
        // 위치 raw 포인트 즉시 hard delete (민감 데이터)
        trackPointRepository.hardDeleteByUserId(userId);
    }

    @Scheduled(cron = "0 0 4 * * *")  // 매일 4시
    public void processDeletions() {
        var ready = deletionRepo.findReadyForDeletion(Instant.now());
        for (var req : ready) {
            try {
                executeDeletion(req);
            } catch (Exception e) {
                log.error("Deletion failed userId={}", req.getUserId(), e);
                req.markFailed(e.getMessage());
            }
        }
    }

    private void executeDeletion(DeletionRequest req) {
        for (DataDeletionHandler h : handlers) {
            h.delete(req.getUserId());
        }
        req.markCompleted(Instant.now());
        deletionRepo.save(req);
    }
}
```

每个域实现各自负责的 `DataDeletionHandler` — 敏感信息 hard delete，内容匿名化:
```java
public interface DataDeletionHandler {
    void delete(Long userId);
}

@Component
@RequiredArgsConstructor
public class RunDataDeletionHandler implements DataDeletionHandler {
    private final RunRepository runRepo;

    @Override
    @Transactional
    public void delete(Long userId) {
        // 위치 폴리라인은 민감 정보 → hard delete
        runRepo.hardDeleteByUserId(userId);
    }
}

@Component
@RequiredArgsConstructor
public class FeedPostDeletionHandler implements DataDeletionHandler {
    private final FeedPostRepository feedRepo;

    @Override
    @Transactional
    public void delete(Long userId) {
        // 게시글은 익명화 — 다른 사용자가 단 답글 보존
        feedRepo.anonymizeByUserId(userId, "탈퇴한 사용자");
    }
}
```

### 2-4. 匿名化模式
```sql
-- 게시글 익명화
UPDATE feed_posts
SET author_name = '탈퇴한 사용자',
    author_avatar_url = NULL,
    author_user_id = NULL    -- FK 끊고 익명화
WHERE author_user_id = :userId;

-- 결제 기록 익명화 (세무 보존 7년)
UPDATE payments
SET buyer_email = 'deleted-' || id || '@anonymized.local',
    buyer_phone = NULL,
    buyer_name = '익명'
WHERE user_id = :userId
  AND created_at < NOW() - INTERVAL '7 years';
```
> 必须预先设计可将外键置为 NULL 的 `ON DELETE SET NULL` 或 nullable FK。

### 2-5. 审计日志匿名化 (假名化 + 密钥销毁)
安全事故追踪是必要的，但必须去除可识别信息。
```java
// 감사 로그 적재 시점부터 user_id를 가역 가능한 토큰으로 저장
public void logAuthEvent(Long userId, String event, ...) {
    String pseudonymId = pseudonymService.toPseudonym(userId);   // HMAC(userId, key)
    auditLog.info("event={} userId={} ip={}", event, pseudonymId, maskIp(ip));
}

// 삭제 요청 시 pseudonym key를 폐기 → 원본 user_id 복구 불가능
public void destroyPseudonymMapping(Long userId) {
    pseudonymKeyStore.deleteKey(userId);
}
```
日志本身保留，但无法识别是哪个用户的行为 → 满足"被遗忘"。

### 2-6. 位置坐标掩码
位置是最敏感的数据。在运营日志・分析日志中始终掩码。
```java
public static double maskCoordinate(double coord) {
    // 소수 2자리까지만 (~1km 정밀도)
    return Math.round(coord * 100.0) / 100.0;
}
```
掩码后日志示例: `lat=37.56, lng=126.97` — 仅可识别到城市级别，不暴露个人位置。

### 2-7. 数据导出 (Article 20 — 数据可携权)
```java
@GetMapping("/users/me/export")
public ResponseEntity<Resource> exportMyData(@AuthenticationPrincipal Long userId) {
    UserDataExport export = exportService.export(userId);
    // JSON + CSV로 패키징
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=my-data.zip")
        .body(new ByteArrayResource(export.toZip()));
}
```
导出的数据: 资料、跑步记录、好友列表、帖子、同意历史。绝不包含密码・令牌。

### 2-8. 30天宽限期 UX
```vue
<v-banner v-if="account.pendingDeletion" color="warning" icon="mdi-account-clock">
  계정 삭제 예약됨 — {{ daysRemaining }}일 후 완전 삭제됩니다.
  <template #actions>
    <v-btn variant="text" @click="cancelDeletion">취소</v-btn>
  </template>
</v-banner>
```
在30天内登录时提供 (a) 删除已预约的告知，(b) 取消选项。取消则 `deletion_requests.status = CANCELLED`。

### 2-9. 外部系统同步
也一并删除 S3/Cloudinary 等外部存储中的用户资源。
```java
@Component
public class S3MediaDeletionHandler implements DataDeletionHandler {
    private final AmazonS3 s3;

    @Override
    public void delete(Long userId) {
        // 프리픽스 기반 일괄 삭제
        ListObjectsV2Request listReq = ListObjectsV2Request.builder()
            .bucket("user-media")
            .prefix("users/" + userId + "/")
            .build();
        var list = s3.listObjectsV2(listReq);
        if (!list.contents().isEmpty()) {
            s3.deleteObjects(DeleteObjectsRequest.builder()
                .bucket("user-media")
                .delete(d -> d.objects(list.contents().stream()
                    .map(o -> ObjectIdentifier.builder().key(o.key()).build())
                    .toList()))
                .build());
        }
    }
}
```
也对分析工具（Mixpanel/Amplitude）调用 GDPR 删除 API:
```java
amplitudeClient.deleteUser(userId);
mixpanelClient.deleteProfile(userId);
```

### 2-10. 同意（删除）历史的保留
删除处理历史本身在单独的表中匿名化后保留（需要法律举证）。
```sql
CREATE TABLE deletion_audit (
    id              BIGSERIAL PRIMARY KEY,
    pseudonym_id    VARCHAR(64),
    requested_at    TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    reason          VARCHAR(50),
    handlers_run    JSONB
);
```
以"YYYY年MM月DD日 匿名用户 abc123 完成删除请求"的形式留存。

## 3. 常见错误（绝对不能做的事）
- ❌ 删除请求后仍持续保管数据 — 30天宽限后必须移除。
- ❌ 位置坐标仅 soft delete — 敏感信息须立即 hard delete。
- ❌ 不吊销令牌只删除账户 — 不能用已吊销的令牌哪怕短暂地访问。
- ❌ 忘记分析工具・外部存储只删 DB — 在所有分散之处删除才是真正的被遗忘权。
- ❌ 不匿名化就保留内容 — 昵称/资料原样留存则不满足被遗忘。
- ❌ 以明文 user_id 永久保管审计日志 — 用假名化令牌 + 密钥销毁来满足被遗忘。

## 4. 检查清单
- [ ] 是否按数据种类分类了 soft/hard/匿名化策略
- [ ] 是否以异步 Saga 作业（可重试）执行批量删除
- [ ] 敏感信息（位置・生物特征）是否立即 hard delete
- [ ] 是否一并吊销令牌・会话
- [ ] 是否删除到外部存储（S3）・分析工具
- [ ] 是否以假名化 + 密钥销毁处理审计日志
- [ ] 是否提供30天宽限・取消 UX
- [ ] 是否运行验证程序（以随机抽样确认 DB・S3・分析・日志的残留）
