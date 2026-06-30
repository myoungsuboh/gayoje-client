---
name: gRPC 服务设计
description: protobuf 契约、流式、标准错误模型、字段兼容性、内部服务间通信标准。在设计 gRPC 服务或处理 proto 契约·流式·兼容性时阅读。关键词：grpc, protobuf, streaming, rpc, backward-compatibility.
rules:
  - "proto 文件是单一契约(source of truth) — 客户端·服务端代码从 proto 生成，不手工修改。"
  - "字段编号绝不复用 — 删除字段时用 reserved 预留以保持向后兼容。"
  - "错误用 google.rpc.Status + 标准码(NOT_FOUND·INVALID_ARGUMENT·DEADLINE_EXCEEDED 等)表达。"
  - "按用途选择 unary/流式 — 单条用 unary，大数据量·实时用 server/client/bidi 流式。"
  - "gRPC 适合内部服务间通信 — 外部公开 API 在网关以 REST/GraphQL 暴露。"
tags:
  - "grpc"
  - "protobuf"
  - "streaming"
  - "rpc"
  - "backward-compatibility"
---

# 📡 gRPC 服务设计

> 标准化 proto 契约·流式·错误·兼容性。在设计 gRPC 服务或确定内部服务间通信时阅读。

基于 HTTP/2 的二进制 RPC，优势是低延迟·流式·强类型契约。主要用于内部 MSA 通信。

## 1. 核心原则
- proto 文件是单一契约(source of truth) — 客户端·服务端代码从 proto 生成，不手工修改。
- 字段编号绝不复用 — 删除字段时用 reserved 预留以保持向后兼容。
- 错误用 `google.rpc.Status` + 标准码(NOT_FOUND·INVALID_ARGUMENT·DEADLINE_EXCEEDED 等)表达。
- 按用途选择 unary/流式 — 单条用 unary，大数据量·实时用 server/client/bidi 流式。
- gRPC 适合内部服务间通信 — 外部公开 API 在网关以 REST/GraphQL 暴露。

## 2. 规则

### 2-1. 契约优先 (proto codegen)
用 proto 定义消息·服务并生成代码。变更通过 proto 评审管理。

```proto
syntax = "proto3";
package user.v1;                 // 在包中嵌入版本，兼容破坏时可分离为 v2

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
  // 字段删除痕迹 — 禁止复用编号·名称
  reserved 3;
  reserved "legacy_email";
}
```
```text
// ❌ 禁止 — 手工修改生成的 stub/服务端代码 (重新生成时丢失)
// ✅ 推荐 — 只改 proto 并 codegen，生成物视为构建产物
```

### 2-2. 字段兼容性 (reserved)
添加字段安全(新编号)，删除·改编号危险 — 用 `reserved` 预留。改变字段含义(类型)也是 breaking change。

```proto
// ❌ 禁止 — 复用已删除的字段编号 / 改类型(int32 → string)
// ✅ 推荐 — 删除时 reserved，用新字段代替变更
message Order {
  reserved 2, 5 to 7;
  reserved "old_status";
  string id = 1;
  OrderStatus status = 8;        // 旧字段的替代用新编号
}
```

### 2-3. 错误处理
不要抛通用异常，用 `google.rpc.Status` + 标准码 + details(结构化错误)让客户端可分支。

```text
// ❌ 禁止 — throw new RuntimeException("not found")  → 客户端只看到 INTERNAL
// ✅ 推荐 — 标准码 + 结构化 details
Status.newBuilder()
  .setCode(Code.NOT_FOUND_VALUE)
  .setMessage("user not found")
  .addDetails(Any.pack(ErrorInfo.newBuilder()
      .setReason("USER_NOT_FOUND").putMetadata("id", req.getId()).build()))
  .build();
```
主要标准码：`INVALID_ARGUMENT`(校验失败) · `NOT_FOUND` · `ALREADY_EXISTS` · `PERMISSION_DENIED` · `UNAUTHENTICATED` · `DEADLINE_EXCEEDED` · `UNAVAILABLE`(可重试候选) · `RESOURCE_EXHAUSTED`(rate limit)。

### 2-4. 流式选择
选择符合用途的 RPC 种类。用 unary 接收无限·大数据量会导致内存爆炸。

| 种类 | 形态 | 用途 |
|---|---|---|
| unary | 1 请求 → 1 响应 | 单条查询/命令 |
| server streaming | 1 请求 → N 响应 | 大数据量列表，实时 feed/订阅 |
| client streaming | N 请求 → 1 响应 | 上传，批量载入，聚合 |
| bidi streaming | N ↔ N | 聊天，双向实时同步 |

### 2-5. 可观测性 & deadline
用 trace-id 传播 + 拦截器横切处理日志·认证，且**客户端始终设置 deadline**。

```text
// ✅ 没有 deadline 的调用在故障时无限等待 → 线程·连接耗尽
stub.withDeadlineAfter(5, TimeUnit.SECONDS).getUser(req);
// 服务端通过 context.isCancelled() 检查提前中断被取消的工作
```

### 2-6. 外部暴露
外部公开 API 不要直接暴露 gRPC，而在网关(gRPC-Gateway/BFF)转换为 REST/GraphQL 暴露。(浏览器无法直接调用 gRPC — 需要 gRPC-Web)

## 3. 常见错误
- ❌ 手工修改生成的 stub/服务端代码 → proto 重新生成时丢失。只改 proto。
- ❌ 复用已删除的字段编号·名称，或改字段类型 → 旧版本客户端解码会坏。reserved + 新字段。
- ❌ 没有 deadline 的调用 → 下游故障传播为调用方资源耗尽。
- ❌ 用 unary 传无限/大数据量 → 内存爆炸。改用流式。
- ❌ 将错误以通用异常抛出 → 客户端只识别为 INTERNAL。用 `google.rpc.Status` 标准码。
- ❌ 对外直接暴露 gRPC → 在网关转换为 REST/GraphQL。
- ❌ 包中无版本(`package user;`) → 兼容破坏时无法分离。像 `user.v1` 那样嵌入版本。

## 4. 检查清单
- [ ] 是否将 proto 作为单一契约并生成代码 (禁止修改生成物)
- [ ] 是否用 reserved 预留已删除字段 (禁止复用编号·名称·改类型)
- [ ] 是否用 `google.rpc.Status` + 标准码 + details 表达错误
- [ ] 是否选择了符合用途的 unary/流式 (大数据量用流式)
- [ ] 是否在客户端设置 deadline 并传播 trace-id
- [ ] 是否将外部公开通过网关以 REST/GraphQL 暴露
