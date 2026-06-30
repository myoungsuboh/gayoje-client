---
name: 個人情報削除 & 忘れられる権利 (Privacy Data Deletion)
description: ユーザーがアカウント/データの削除を要求したときに、soft delete・hard delete・cascade・監査ログの匿名化・位置/メールのマスキングを一貫して処理する標準。GDPR Art.17・韓国個人情報保護法第36条・PIPL対応や、退会/削除フローを設計するときに読む。キーワード: GDPR, anonymize, personalData, softDelete, hardDelete。
rules:
  - "削除要求は soft delete（状態変更）と hard delete（永久削除）に分類して処理する。"
  - "大量削除は非同期 Saga ジョブで段階的に実行する（一部失敗時に再試行可能）。"
  - "監査ログは削除する代わりに識別子を匿名化（仮名化）して保存する。"
  - "位置座標はマスキングし、メールはハッシュ/仮名に置換する。"
  - "削除要求後に30日の猶予期間を設け、復旧可能にする。"
  - "分散したすべての場所（DB・外部ストレージ・分析ツール）から削除してこそ真の忘れられる権利である。"
tags:
  - "GDPR"
  - "anonymize"
  - "personalData"
  - "softDelete"
  - "hardDelete"
  - "잊혀질 권리"
  - "데이터 이동권"
---

# 🗑️ 個人情報削除 & 忘れられる権利

> GDPR Article 17、韓国個人情報保護法第36条、中国 PIPL 第47条はいずれも「ユーザーが要求すれば合理的な期間内に削除する」ことを明示している。ユーザーデータを扱うサービスで退会・削除フローを設計するときに読む。
>
> 関連スキル:
> - 認証/セキュリティ: [security-backend](../../security/security-backend/SKILL.md)
> - トークン破棄: [jwt-refresh-rotation](../../security/jwt-refresh-rotation/SKILL.md)
> - DB共通規約: db-common-conventions
> - ロギング保存: [logging-observability](../logging-observability/SKILL.md)

## 1. 基本原則
- 削除要求は soft delete（状態変更）と hard delete（永久削除）に分類して処理する。
- 大量削除は非同期 Saga ジョブで段階的に実行する（一部失敗時に再試行可能）。
- 監査ログは削除する代わりに識別子を匿名化（仮名化）して保存する。
- 位置座標はマスキングし、メールはハッシュ/仮名に置換する。
- 削除要求後に30日の猶予期間を設け、復旧可能にする。
- 分散したすべての場所（DB・外部ストレージ・分析ツール）から削除してこそ真の忘れられる権利である。

## 2. ルール

### 2-1. Soft Delete vs Hard Delete — 分類
| データ種類 | ポリシー | 理由 |
|---|---|---|
| **ユーザープロフィール** | soft → 30日後 hard | 誤操作の復旧余地 + 法定保存 |
| **機微情報（位置座標、ヘルスデータ、生体情報）** | **即時 hard** | GDPR 勧告 — 機微カテゴリ |
| **決済記録** | 匿名化後に保存 | 税務/会計法上 5〜7年の保存義務 |
| **ユーザーコンテンツ（投稿、コメント）** | 匿名化後に保存 | 他ユーザーの可視性 + サービスの整合性 |
| **監査ログ（セキュリティイベント）** | 匿名化後に保存 | セキュリティ事故の追跡 |

### 2-2. ユーザーデータ削除 API
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

### 2-3. 非同期削除ジョブ (Saga パターン)
複数のドメインに散らばったデータを順番に削除する。一部失敗時に再試行可能でなければならない。
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

各ドメインが自分の責任の `DataDeletionHandler` を実装する — 機微情報は hard delete、コンテンツは匿名化:
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

### 2-4. 匿名化パターン
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
> 外部キーを NULL にできるよう、`ON DELETE SET NULL` または nullable FK の設計があらかじめ入っていなければならない。

### 2-5. 監査ログの匿名化 (仮名化 + キー破棄)
セキュリティ事故の追跡は必要だが、識別情報は除かなければならない。
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
ログ自体は残るが、どのユーザーの行為だったかを識別不可能にする → 「忘れられること」を満たす。

### 2-6. 位置座標のマスキング
位置は最も機微なデータ。運用ログ・分析ログでは常にマスキングする。
```java
public static double maskCoordinate(double coord) {
    // 소수 2자리까지만 (~1km 정밀도)
    return Math.round(coord * 100.0) / 100.0;
}
```
マスキング後のログ例: `lat=37.56, lng=126.97` — 都市レベルの識別のみ可能、個人の位置は露出しない。

### 2-7. データエクスポート (Article 20 — データポータビリティの権利)
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
エクスポートするデータ: プロフィール、ランニング記録、フレンド一覧、投稿、同意履歴。パスワード・トークンは絶対に含めない。

### 2-8. 30日の猶予期間 UX
```vue
<v-banner v-if="account.pendingDeletion" color="warning" icon="mdi-account-clock">
  계정 삭제 예약됨 — {{ daysRemaining }}일 후 완전 삭제됩니다.
  <template #actions>
    <v-btn variant="text" @click="cancelDeletion">취소</v-btn>
  </template>
</v-banner>
```
30日間、ログイン時に (a) 削除予約の事実を案内し、(b) キャンセルオプションを提供する。キャンセルすると `deletion_requests.status = CANCELLED`。

### 2-9. 外部システムの同期
S3/Cloudinary のような外部ストレージのユーザーリソースも一緒に削除する。
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
分析ツール（Mixpanel/Amplitude）にも GDPR 削除 API を呼び出す:
```java
amplitudeClient.deleteUser(userId);
mixpanelClient.deleteProfile(userId);
```

### 2-10. 同意（削除）履歴の保存
削除処理の履歴自体は別テーブルに匿名化後に保存する（法的立証が必要）。
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
「YYYY年MM月DD日、匿名ユーザー abc123 が削除要求を完了」という形で残る。

## 3. よくある誤り（絶対にやってはいけないこと）
- ❌ 削除要求後もデータを保管し続ける — 30日の猶予後に必ず除去する。
- ❌ 位置座標を soft delete のみ — 機微情報は即時 hard delete する。
- ❌ トークンを破棄せずアカウントだけ削除 — 破棄されたトークンで一瞬でもアクセス可能であってはならない。
- ❌ 分析ツール・外部ストレージを忘れて DB だけ削除 — 分散したすべての場所から削除してこそ真の忘れられる権利。
- ❌ 匿名化なしでコンテンツを保存 — ニックネーム/プロフィールがそのまま残ると忘れられることを満たさない。
- ❌ 監査ログを平文の user_id で永久保管 — 仮名化トークン + キー破棄で忘れられることを満たす。

## 4. チェックリスト
- [ ] データ種類別に soft/hard/匿名化のポリシーを分類したか
- [ ] 大量削除を非同期 Saga ジョブ（再試行可能）で実行するか
- [ ] 機微情報（位置・生体）は即時 hard delete するか
- [ ] トークン・セッションを併せて破棄するか
- [ ] 外部ストレージ（S3）・分析ツールまで削除するか
- [ ] 監査ログを仮名化 + キー破棄で処理したか
- [ ] 30日の猶予・キャンセル UX を提供するか
- [ ] 検証手順（無作為標本で DB・S3・分析・ログの残存を確認）を運用するか
