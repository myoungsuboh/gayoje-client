---
name: 개인정보 삭제 & 잊혀질 권리 (Privacy Data Deletion)
description: 사용자가 계정/데이터 삭제를 요청했을 때 soft delete·hard delete·cascade·감사 로그 익명화·위치/이메일 마스킹을 일관되게 처리하는 표준. GDPR Art.17·개인정보보호법 제36조·PIPL 대응이나 탈퇴/삭제 플로우를 설계할 때 읽는다. 키워드: GDPR, anonymize, personalData, softDelete, hardDelete, 잊혀질 권리, 데이터 이동권.
rules:
  - "삭제 요청은 soft delete(상태 변경)와 hard delete(영구 삭제)를 분류해 처리한다."
  - "대량 삭제는 비동기 Saga 잡으로 단계별로 실행한다(일부 실패 시 재시도 가능)."
  - "감사 로그는 삭제 대신 식별자를 익명화(가명화)해 보존한다."
  - "위치 좌표는 마스킹하고 이메일은 해시/가명으로 치환한다."
  - "삭제 요청 후 30일 유예 기간을 두고 복구 가능하게 한다."
  - "분산된 모든 곳(DB·외부 스토리지·분석 도구)에서 삭제해야 진정한 잊혀질 권리다."
tags:
  - "GDPR"
  - "anonymize"
  - "personalData"
  - "softDelete"
  - "hardDelete"
  - "잊혀질 권리"
  - "데이터 이동권"
---

# 🗑️ 개인정보 삭제 & 잊혀질 권리

> GDPR Article 17, 한국 개인정보보호법 제36조, 중국 PIPL 제47조 모두 "사용자가 요청하면 합리적 기간 내 삭제"를 명시한다. 사용자 데이터를 다루는 서비스에서 탈퇴·삭제 플로우를 설계할 때 읽는다.
>
> 관련 스킬:
> - 인증/보안: [security-backend](../../security/security-backend/SKILL.md)
> - 토큰 폐기: [jwt-refresh-rotation](../../security/jwt-refresh-rotation/SKILL.md)
> - DB 공통 규약: db-common-conventions
> - 로깅 보존: [logging-observability](../logging-observability/SKILL.md)

## 1. 핵심 원칙
- 삭제 요청은 soft delete(상태 변경)와 hard delete(영구 삭제)를 분류해 처리한다.
- 대량 삭제는 비동기 Saga 잡으로 단계별로 실행한다(일부 실패 시 재시도 가능).
- 감사 로그는 삭제 대신 식별자를 익명화(가명화)해 보존한다.
- 위치 좌표는 마스킹하고 이메일은 해시/가명으로 치환한다.
- 삭제 요청 후 30일 유예 기간을 두고 복구 가능하게 한다.
- 분산된 모든 곳(DB·외부 스토리지·분석 도구)에서 삭제해야 진정한 잊혀질 권리다.

## 2. 규칙

### 2-1. Soft Delete vs Hard Delete — 분류
| 데이터 종류 | 정책 | 이유 |
|---|---|---|
| **사용자 프로필** | soft → 30일 후 hard | 실수 복구 여유 + 법정 보존 |
| **민감 정보(위치 좌표, 헬스 데이터, 생체 정보)** | **즉시 hard** | GDPR 권고 — 민감 카테고리 |
| **결제 기록** | 익명화 후 보존 | 세무/회계법상 5~7년 보존 의무 |
| **사용자 콘텐츠(게시글, 댓글)** | 익명화 후 보존 | 다른 사용자 가시성 + 서비스 무결성 |
| **감사 로그(보안 이벤트)** | 익명화 후 보존 | 보안 사고 추적 |

### 2-2. 사용자 데이터 삭제 API
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

### 2-3. 비동기 삭제 잡 (Saga 패턴)
여러 도메인에 흩어진 데이터를 순서대로 삭제. 일부 실패 시 재시도 가능해야 함.
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

각 도메인이 자기 책임의 `DataDeletionHandler`를 구현 — 민감 정보는 hard delete, 콘텐츠는 익명화:
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

### 2-4. 익명화 패턴
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
> 외래키를 NULL로 만들 수 있도록 `ON DELETE SET NULL` 또는 nullable FK 설계가 미리 들어가 있어야 한다.

### 2-5. 감사 로그 익명화 (가명화 + 키 폐기)
보안 사고 추적은 필요하지만 식별 정보는 빼야 한다.
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
로그 자체는 남되 어느 사용자의 행위였는지 식별 불가능 → "잊혀짐" 충족.

### 2-6. 위치 좌표 마스킹
위치는 가장 민감한 데이터. 운영 로그·분석 로그에서 항상 마스킹.
```java
public static double maskCoordinate(double coord) {
    // 소수 2자리까지만 (~1km 정밀도)
    return Math.round(coord * 100.0) / 100.0;
}
```
마스킹 후 로그 예: `lat=37.56, lng=126.97` — 도시 수준 식별만 가능, 개인 위치 노출 X.

### 2-7. 데이터 내보내기 (Article 20 — 데이터 이동권)
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
내보내는 데이터: 프로필, 러닝 기록, 친구 목록, 게시글, 동의 이력. 비밀번호·토큰은 절대 포함하지 않음.

### 2-8. 30일 유예 기간 UX
```vue
<v-banner v-if="account.pendingDeletion" color="warning" icon="mdi-account-clock">
  계정 삭제 예약됨 — {{ daysRemaining }}일 후 완전 삭제됩니다.
  <template #actions>
    <v-btn variant="text" @click="cancelDeletion">취소</v-btn>
  </template>
</v-banner>
```
30일 동안 로그인 시 (a) 삭제 예약 사실 안내, (b) 취소 옵션 제공. 취소하면 `deletion_requests.status = CANCELLED`.

### 2-9. 외부 시스템 동기화
S3/Cloudinary 같은 외부 스토리지의 사용자 자원도 같이 삭제.
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
분석 도구(Mixpanel/Amplitude)에도 GDPR 삭제 API 호출:
```java
amplitudeClient.deleteUser(userId);
mixpanelClient.deleteProfile(userId);
```

### 2-10. 동의(삭제) 이력 보존
삭제 처리 이력 자체는 별도 테이블에 익명화 후 보존(법적 입증 필요).
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
"OO년 OO월 OO일 익명 사용자 abc123이 삭제 요청 완료" 형태로 남는다.

## 3. 흔한 실수 (절대 하면 안 되는 것)
- ❌ 삭제 요청 후 데이터 계속 보관 — 30일 유예 후 반드시 제거.
- ❌ 위치 좌표를 soft delete만 — 민감 정보는 즉시 hard delete.
- ❌ 토큰을 폐기하지 않고 계정만 삭제 — 폐기된 토큰으로 잠시라도 액세스 가능하면 안 됨.
- ❌ 분석 도구·외부 스토리지는 잊고 DB만 삭제 — 분산된 모든 곳에서 삭제해야 진정한 잊혀질 권리.
- ❌ 익명화 없이 콘텐츠 보존 — 닉네임/프로필 그대로 남으면 잊혀짐 미충족.
- ❌ 감사 로그를 평문 user_id로 영구 보관 — 가명화 토큰 + 키 폐기로 잊혀짐 충족.

## 4. 체크리스트
- [ ] 데이터 종류별 soft/hard/익명화 정책을 분류했는가
- [ ] 대량 삭제를 비동기 Saga 잡(재시도 가능)으로 실행하는가
- [ ] 민감 정보(위치·생체)는 즉시 hard delete하는가
- [ ] 토큰·세션을 함께 폐기하는가
- [ ] 외부 스토리지(S3)·분석 도구까지 삭제하는가
- [ ] 감사 로그를 가명화 + 키 폐기로 처리했는가
- [ ] 30일 유예·취소 UX를 제공하는가
- [ ] 검증 절차(무작위 표본으로 DB·S3·분석·로그 잔존 확인)를 운영하는가
