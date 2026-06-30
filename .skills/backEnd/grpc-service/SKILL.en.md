---
name: gRPC Service Design
description: protobuf contracts, streaming, the standard error model, field compatibility, and a standard for internal service-to-service communication. Read when designing a gRPC service or dealing with proto contracts, streaming, or compatibility. Keywords: grpc, protobuf, streaming, rpc, backward-compatibility.
rules:
  - "The proto file is the single contract (source of truth) — generate client/server code from proto and do not hand-edit it."
  - "Never reuse field numbers — when deleting a field, reserve it to preserve backward compatibility."
  - "Express errors with google.rpc.Status + standard codes (NOT_FOUND, INVALID_ARGUMENT, DEADLINE_EXCEEDED, etc.)."
  - "Choose unary/streaming to fit the purpose — unary for single items, server/client/bidi streaming for large or real-time."
  - "gRPC suits internal service-to-service communication — expose external public APIs as REST/GraphQL at a gateway."
tags:
  - "grpc"
  - "protobuf"
  - "streaming"
  - "rpc"
  - "backward-compatibility"
---

# 📡 gRPC Service Design

> Standardize proto contracts, streaming, errors, and compatibility. Read when designing a gRPC service or deciding internal service-to-service communication.

An HTTP/2-based binary RPC, its strengths are low latency, streaming, and strongly typed contracts. It is mainly used for internal MSA communication.

## 1. Core Principles
- The proto file is the single contract (source of truth) — generate client/server code from proto and do not hand-edit it.
- Never reuse field numbers — when deleting a field, reserve it to preserve backward compatibility.
- Express errors with `google.rpc.Status` + standard codes (NOT_FOUND, INVALID_ARGUMENT, DEADLINE_EXCEEDED, etc.).
- Choose unary/streaming to fit the purpose — unary for single items, server/client/bidi streaming for large or real-time.
- gRPC suits internal service-to-service communication — expose external public APIs as REST/GraphQL at a gateway.

## 2. Rules

### 2-1. Contract First (proto codegen)
Define messages and services with proto and generate code. Manage changes through proto review.

```proto
syntax = "proto3";
package user.v1;                 // embed a version in the package so you can split to v2 on breaking changes

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
  // trace of a deleted field — no reuse of number/name
  reserved 3;
  reserved "legacy_email";
}
```
```text
// ❌ Forbidden — hand-editing generated stub/server code (lost on regeneration)
// ✅ Recommended — edit only proto and codegen; treat generated artifacts as build outputs
```

### 2-2. Field Compatibility (reserved)
Adding fields is safe (new number); deleting or renumbering is dangerous — reserve with `reserved`. Changing a field's meaning (type) is also a breaking change.

```proto
// ❌ Forbidden — reusing a deleted field number / changing type (int32 → string)
// ✅ Recommended — reserve on deletion, add a new field instead of changing
message Order {
  reserved 2, 5 to 7;
  reserved "old_status";
  string id = 1;
  OrderStatus status = 8;        // replace the old field with a new number
}
```

### 2-3. Error Handling
Do not throw generic exceptions; use `google.rpc.Status` + standard code + details (structured error) so the client can branch.

```text
// ❌ Forbidden — throw new RuntimeException("not found")  → the client sees only INTERNAL
// ✅ Recommended — standard code + structured details
Status.newBuilder()
  .setCode(Code.NOT_FOUND_VALUE)
  .setMessage("user not found")
  .addDetails(Any.pack(ErrorInfo.newBuilder()
      .setReason("USER_NOT_FOUND").putMetadata("id", req.getId()).build()))
  .build();
```
Key standard codes: `INVALID_ARGUMENT` (validation failure) · `NOT_FOUND` · `ALREADY_EXISTS` · `PERMISSION_DENIED` · `UNAUTHENTICATED` · `DEADLINE_EXCEEDED` · `UNAVAILABLE` (retry candidate) · `RESOURCE_EXHAUSTED` (rate limit).

### 2-4. Streaming Selection
Choose the RPC kind that fits the purpose. Receiving unbounded/large data via unary blows up memory.

| Kind | Form | Purpose |
|---|---|---|
| unary | 1 request → 1 response | single lookup/command |
| server streaming | 1 request → N responses | large lists, real-time feed/subscription |
| client streaming | N requests → 1 response | upload, batch ingest, aggregation |
| bidi streaming | N ↔ N | chat, two-way real-time sync |

### 2-5. Observability & deadline
Handle logging/auth crosscutting with trace-id propagation + interceptors, and **the client always sets a deadline**.

```text
// ✅ A call without a deadline waits forever on failure → thread/connection exhaustion
stub.withDeadlineAfter(5, TimeUnit.SECONDS).getUser(req);
// The server checks context.isCancelled() to abort cancelled work early
```

### 2-6. External Exposure
Do not expose gRPC directly as an external public API; convert it to REST/GraphQL at a gateway (gRPC-Gateway/BFF) for exposure. (Browsers cannot call gRPC directly — gRPC-Web is required.)

## 3. Common Mistakes
- ❌ Hand-editing generated stub/server code → lost on proto regeneration. Edit only proto.
- ❌ Reusing a deleted field number/name, or changing field type → decoding breaks for old clients. reserved + new field.
- ❌ Calls without a deadline → downstream failures propagate as caller-side resource exhaustion.
- ❌ Unbounded/large data via unary → memory blowup. Use streaming.
- ❌ Throwing errors as generic exceptions → the client only sees INTERNAL. Use `google.rpc.Status` standard codes.
- ❌ Exposing gRPC directly externally → convert to REST/GraphQL at a gateway.
- ❌ No version in the package (`package user;`) → cannot split on breaking changes. Embed a version like `user.v1`.

## 4. Checklist
- [ ] Did you keep proto as the single contract and generate code (no editing generated artifacts)?
- [ ] Did you reserve deleted fields with reserved (no reuse of number/name, no type change)?
- [ ] Did you express errors with `google.rpc.Status` + standard code + details?
- [ ] Did you choose unary/streaming to fit the purpose (streaming for large data)?
- [ ] Did you set a deadline on the client and propagate trace-id?
- [ ] Did you expose external public access as REST/GraphQL through a gateway?
