---
name: gRPC 서비스 설계
description: protobuf 계약, 스트리밍, 표준 에러 모델, 필드 호환성, 내부 서비스 간 통신 표준. gRPC 서비스를 설계하거나 proto 계약·스트리밍·호환성을 다룰 때 읽는다. 키워드: grpc, protobuf, streaming, rpc, backward-compatibility.
rules:
  - "proto 파일이 단일 계약(source of truth) — 클라이언트·서버 코드는 proto 에서 생성하고 손으로 고치지 않는다."
  - "필드 번호는 절대 재사용하지 않는다 — 필드 삭제 시 reserved 로 예약해 하위 호환을 지킨다."
  - "에러는 google.rpc.Status + 표준 코드(NOT_FOUND·INVALID_ARGUMENT·DEADLINE_EXCEEDED 등)로 표현한다."
  - "용도에 맞게 unary/스트리밍을 선택한다 — 단건은 unary, 대용량·실시간은 server/client/bidi 스트리밍."
  - "gRPC 는 내부 서비스 간 통신에 적합 — 외부 공개 API 는 게이트웨이에서 REST/GraphQL 로 노출한다."
tags:
  - "grpc"
  - "protobuf"
  - "streaming"
  - "rpc"
  - "backward-compatibility"
---

# 📡 gRPC 서비스 설계

> proto 계약·스트리밍·에러·호환성을 표준화한다. gRPC 서비스를 설계하거나 내부 서비스 간 통신을 정할 때 읽는다.

HTTP/2 기반 바이너리 RPC 로, 낮은 지연·스트리밍·강타입 계약이 강점이다. 내부 MSA 통신에 주로 쓴다.

## 1. 핵심 원칙
- proto 파일이 단일 계약(source of truth) — 클라이언트·서버 코드는 proto 에서 생성하고 손으로 고치지 않는다.
- 필드 번호는 절대 재사용하지 않는다 — 필드 삭제 시 reserved 로 예약해 하위 호환을 지킨다.
- 에러는 `google.rpc.Status` + 표준 코드(NOT_FOUND·INVALID_ARGUMENT·DEADLINE_EXCEEDED 등)로 표현한다.
- 용도에 맞게 unary/스트리밍을 선택한다 — 단건은 unary, 대용량·실시간은 server/client/bidi 스트리밍.
- gRPC 는 내부 서비스 간 통신에 적합 — 외부 공개 API 는 게이트웨이에서 REST/GraphQL 로 노출한다.

## 2. 규칙

### 2-1. 계약 우선 (proto codegen)
proto 로 메시지·서비스를 정의하고 코드를 생성한다. 변경은 proto 리뷰로 관리한다.

```proto
syntax = "proto3";
package user.v1;                 // 패키지에 버전을 박아 호환 깨짐 시 v2 로 분리

service UserService {
  rpc GetUser(GetUserRequest) returns (User);             // unary
  rpc ListUsers(ListUsersRequest) returns (stream User);   // server streaming
  rpc UploadEvents(stream Event) returns (UploadSummary);  // client streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage); // bidi
}

message GetUserRequest { string id = 1; }
message User {
  string id = 1;
  string name = 2;
  // 필드 삭제 흔적 — 번호·이름 재사용 금지
  reserved 3;
  reserved "legacy_email";
}
```
```text
// ❌ 금지 — 생성된 stub/서버 코드를 손으로 수정 (재생성 시 유실)
// ✅ 권장 — proto 만 수정하고 codegen, 생성물은 빌드 산출물로 취급
```

### 2-2. 필드 호환성 (reserved)
필드 추가는 안전(새 번호), 삭제·번호 변경은 위험 — `reserved` 로 예약한다. 필드 의미(타입)를 바꾸는 것도 breaking change다.

```proto
// ❌ 금지 — 삭제한 필드 번호를 재사용 / 타입 변경(int32 → string)
// ✅ 권장 — 삭제 시 reserved, 변경 대신 새 필드 추가
message Order {
  reserved 2, 5 to 7;
  reserved "old_status";
  string id = 1;
  OrderStatus status = 8;        // 옛 필드 대체는 새 번호로
}
```

### 2-3. 에러 처리
일반 예외를 던지지 말고 `google.rpc.Status` + 표준 코드 + details(구조화 에러)로 클라이언트가 분기 가능하게 한다.

```text
// ❌ 금지 — throw new RuntimeException("not found")  → 클라이언트가 INTERNAL 로만 봄
// ✅ 권장 — 표준 코드 + 구조화 details
Status.newBuilder()
  .setCode(Code.NOT_FOUND_VALUE)
  .setMessage("user not found")
  .addDetails(Any.pack(ErrorInfo.newBuilder()
      .setReason("USER_NOT_FOUND").putMetadata("id", req.getId()).build()))
  .build();
```
주요 표준 코드: `INVALID_ARGUMENT`(검증 실패) · `NOT_FOUND` · `ALREADY_EXISTS` · `PERMISSION_DENIED` · `UNAUTHENTICATED` · `DEADLINE_EXCEEDED` · `UNAVAILABLE`(재시도 후보) · `RESOURCE_EXHAUSTED`(rate limit).

### 2-4. 스트리밍 선택
용도에 맞는 RPC 종류를 고른다. 무한·대용량을 unary 로 받으면 메모리가 폭발한다.

| 종류 | 형태 | 용도 |
|---|---|---|
| unary | 1요청 → 1응답 | 단건 조회/명령 |
| server streaming | 1요청 → N응답 | 대용량 목록, 실시간 피드/구독 |
| client streaming | N요청 → 1응답 | 업로드, 배치 적재, 집계 |
| bidi streaming | N ↔ N | 채팅, 양방향 실시간 동기화 |

### 2-5. 관측성 & deadline
trace-id 전파 + 인터셉터로 로깅·인증을 횡단 처리하고, **클라이언트는 항상 deadline 을 설정**한다.

```text
// ✅ deadline 없는 호출은 장애 시 무한 대기 → 스레드·커넥션 고갈
stub.withDeadlineAfter(5, TimeUnit.SECONDS).getUser(req);
// 서버는 context.isCancelled() 확인으로 취소된 작업을 조기 중단
```

### 2-6. 외부 노출
외부 공개 API 는 gRPC 를 직접 노출하지 말고 게이트웨이(gRPC-Gateway/BFF)에서 REST/GraphQL 로 변환해 노출한다. (브라우저는 gRPC 직접 호출 불가 — gRPC-Web 필요)

## 3. 흔한 실수
- ❌ 생성된 stub/서버 코드를 손으로 수정 → proto 재생성 시 유실. proto 만 수정한다.
- ❌ 삭제한 필드 번호·이름 재사용, 또는 필드 타입 변경 → 구버전 클라이언트 디코딩이 깨진다. reserved + 새 필드.
- ❌ deadline 없는 호출 → 다운스트림 장애가 호출 측 자원 고갈로 전파.
- ❌ 무한/대용량 데이터를 unary 로 → 메모리 폭발. 스트리밍으로.
- ❌ 에러를 일반 예외로 던짐 → 클라이언트가 INTERNAL 로만 인식. `google.rpc.Status` 표준 코드로.
- ❌ 외부에 gRPC 직접 노출 → 게이트웨이에서 REST/GraphQL 로 변환.
- ❌ 패키지에 버전 없음(`package user;`) → 호환 깨짐 시 분리 불가. `user.v1` 처럼 버전을 박는다.

## 4. 체크리스트
- [ ] proto 를 단일 계약으로 두고 코드를 생성했는가 (생성물 수정 금지)
- [ ] 삭제한 필드를 reserved 로 예약했는가 (번호·이름 재사용·타입 변경 금지)
- [ ] 에러를 `google.rpc.Status` + 표준 코드 + details 로 표현했는가
- [ ] 용도에 맞는 unary/스트리밍을 선택했는가 (대용량은 스트리밍)
- [ ] 클라이언트에 deadline 을 설정하고 trace-id 를 전파했는가
- [ ] 외부 공개는 게이트웨이를 통해 REST/GraphQL 로 노출했는가
