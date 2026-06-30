---
name: Personal Data Deletion & Right to Be Forgotten (Privacy Data Deletion)
description: A standard for consistently handling soft delete, hard delete, cascade, audit log anonymization, and location/email masking when a user requests account/data deletion. Read this when addressing GDPR Art.17, Article 36 of the Korean Personal Information Protection Act, or PIPL, or when designing a withdrawal/deletion flow. Keywords: GDPR, anonymize, personalData, softDelete, hardDelete.
rules:
  - "Classify deletion requests into soft delete (status change) and hard delete (permanent deletion) for processing."
  - "Run bulk deletion as an asynchronous Saga job in stages (retryable on partial failure)."
  - "Instead of deleting audit logs, anonymize (pseudonymize) identifiers and retain them."
  - "Mask location coordinates and replace emails with a hash/pseudonym."
  - "Provide a 30-day grace period after a deletion request, keeping it recoverable."
  - "True right to be forgotten requires deletion everywhere it is distributed (DB, external storage, analytics tools)."
tags:
  - "GDPR"
  - "anonymize"
  - "personalData"
  - "softDelete"
  - "hardDelete"
  - "잊혀질 권리"
  - "데이터 이동권"
---

# 🗑️ Personal Data Deletion & Right to Be Forgotten

> GDPR Article 17, Article 36 of the Korean Personal Information Protection Act, and Article 47 of China's PIPL all specify "deletion within a reasonable period upon user request." Read this when designing a withdrawal/deletion flow in a service that handles user data.
>
> Related skills:
> - Authentication/security: [security-backend](../../security/security-backend/SKILL.md)
> - Token revocation: [jwt-refresh-rotation](../../security/jwt-refresh-rotation/SKILL.md)
> - Common DB conventions: db-common-conventions
> - Logging retention: [logging-observability](../logging-observability/SKILL.md)

## 1. Core Principles
- Classify deletion requests into soft delete (status change) and hard delete (permanent deletion) for processing.
- Run bulk deletion as an asynchronous Saga job in stages (retryable on partial failure).
- Instead of deleting audit logs, anonymize (pseudonymize) identifiers and retain them.
- Mask location coordinates and replace emails with a hash/pseudonym.
- Provide a 30-day grace period after a deletion request, keeping it recoverable.
- True right to be forgotten requires deletion everywhere it is distributed (DB, external storage, analytics tools).

## 2. Rules

### 2-1. Soft Delete vs Hard Delete — Classification
| Data Type | Policy | Reason |
|---|---|---|
| **User profile** | soft → hard after 30 days | Room for mistake recovery + legal retention |
| **Sensitive info (location coordinates, health data, biometric info)** | **immediate hard** | GDPR recommendation — sensitive category |
| **Payment records** | retain after anonymization | 5–7 year retention obligation under tax/accounting law |
| **User content (posts, comments)** | retain after anonymization | Other users' visibility + service integrity |
| **Audit logs (security events)** | retain after anonymization | Security incident tracing |

### 2-2. User Data Deletion API
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

### 2-3. Asynchronous Deletion Job (Saga Pattern)
Delete data scattered across multiple domains in order. Must be retryable on partial failure.
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

Each domain implements its own `DataDeletionHandler` — hard delete for sensitive info, anonymize for content:
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

### 2-4. Anonymization Pattern
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
> A nullable FK design or `ON DELETE SET NULL` must already be in place so foreign keys can be set to NULL.

### 2-5. Audit Log Anonymization (Pseudonymization + Key Destruction)
Security incident tracing is necessary, but identifying information must be removed.
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
The log itself remains, but it becomes impossible to identify which user performed the action → satisfies "being forgotten."

### 2-6. Location Coordinate Masking
Location is the most sensitive data. Always mask it in operational logs and analytics logs.
```java
public static double maskCoordinate(double coord) {
    // 소수 2자리까지만 (~1km 정밀도)
    return Math.round(coord * 100.0) / 100.0;
}
```
Example log after masking: `lat=37.56, lng=126.97` — only city-level identification possible, no exposure of individual location.

### 2-7. Data Export (Article 20 — Right to Data Portability)
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
Data to export: profile, running records, friend list, posts, consent history. Never include passwords or tokens.

### 2-8. 30-Day Grace Period UX
```vue
<v-banner v-if="account.pendingDeletion" color="warning" icon="mdi-account-clock">
  계정 삭제 예약됨 — {{ daysRemaining }}일 후 완전 삭제됩니다.
  <template #actions>
    <v-btn variant="text" @click="cancelDeletion">취소</v-btn>
  </template>
</v-banner>
```
During the 30 days, on login provide (a) notice that deletion is scheduled, and (b) a cancel option. On cancel, `deletion_requests.status = CANCELLED`.

### 2-9. External System Synchronization
Also delete the user's resources in external storage like S3/Cloudinary.
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
Also call the GDPR deletion API on analytics tools (Mixpanel/Amplitude):
```java
amplitudeClient.deleteUser(userId);
mixpanelClient.deleteProfile(userId);
```

### 2-10. Retention of Consent (Deletion) History
The deletion processing history itself is retained in a separate table after anonymization (legal proof needed).
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
It remains in the form "On YYYY-MM-DD, anonymous user abc123 completed a deletion request."

## 3. Common Mistakes (Things You Must Never Do)
- ❌ Keep retaining data after a deletion request — must remove after the 30-day grace period.
- ❌ Only soft delete location coordinates — sensitive info must be hard deleted immediately.
- ❌ Delete only the account without revoking tokens — access must not be possible even briefly with a revoked token.
- ❌ Delete only the DB, forgetting analytics tools and external storage — true right to be forgotten requires deletion everywhere it is distributed.
- ❌ Retain content without anonymization — leaving nicknames/profiles as-is fails the "being forgotten" requirement.
- ❌ Permanently keep audit logs with plaintext user_id — satisfy "being forgotten" with a pseudonymization token + key destruction.

## 4. Checklist
- [ ] Did you classify soft/hard/anonymization policy by data type?
- [ ] Do you run bulk deletion as an asynchronous Saga job (retryable)?
- [ ] Do you hard delete sensitive info (location, biometric) immediately?
- [ ] Do you revoke tokens/sessions together?
- [ ] Do you delete up to external storage (S3) and analytics tools?
- [ ] Did you handle audit logs with pseudonymization + key destruction?
- [ ] Do you provide the 30-day grace and cancel UX?
- [ ] Do you operate a verification procedure (checking DB, S3, analytics, and logs for residue via random sampling)?
