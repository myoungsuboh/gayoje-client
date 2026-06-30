---
name: 文件存储 (S3 Compatible)
description: 文件上传·下载·访问控制的通用标准。涵盖对象存储·Presigned URL·恶意软件扫描·阻断公开写入·UUID 重命名。在设计文件上传/下载功能或确定存储访问权限·安全时阅读。与语言/框架无关的通用标准。关键词: s3, storage, presigned, upload, file, bucket, minio, gcs, object storage, malware scan.
rules:
  - "不将文件保存到应用服务器的本地磁盘 — 使用对象存储(S3·GCS·MinIO)。"
  - "大容量文件用 Presigned URL 让客户端直接上传到存储,绕过应用服务器。"
  - "上传的文件仅在通过病毒/恶意软件扫描后才切换为可用状态。"
  - "存储桶阻断公开写入,读取也仅在需要时允许 — 敏感文件仅通过 Presigned URL 提供。"
  - "文件名不直接使用用户输入,而重命名为 UUID/哈希以防止路径遍历攻击。"
tags:
  - "s3"
  - "storage"
  - "presigned"
  - "upload"
  - "file"
  - "bucket"
  - "minio"
  - "gcs"
  - "object storage"
  - "malware scan"
  - "object-storage"
  - "download"
  - "access-control"
  - "malware-scan"
---

# 📦 文件存储 (S3 Compatible)

> 统一文件存储·传输·访问控制方式。在创建文件上传/下载功能或确定存储安全·权限时阅读。

## 1. 核心原则
- 不将文件保存到应用服务器的本地磁盘 — 使用对象存储(S3·GCS·MinIO)。
- 大容量文件用 Presigned URL 让客户端直接上传到存储,绕过应用服务器。
- 上传的文件仅在通过病毒/恶意软件扫描后才切换为可用状态。
- 存储桶阻断公开写入,读取也仅在需要时允许 — 敏感文件仅通过 Presigned URL 提供。
- 文件名不直接使用用户输入,而重命名为 UUID/哈希以防止路径遍历攻击。

## 2. 规则

### 2-1. 禁止本地磁盘 · 使用对象存储
- 文件保存到对象存储(S3·GCS·MinIO)。应用服务器的本地磁盘存在易失·无法扩展·多实例不一致的问题,因此禁止。
- 文件本体存储在存储中,元数据(键·原始名·大小·扫描状态等)分离保存到 DB。

### 2-2. 上传流程 (直接上传 vs Presigned URL)
上传按大小分为两条路径。

**直接上传 (小容量 ≤ 5MB)** — 服务器中转。
```
Client → POST /api/files (multipart) → Server → S3 → DB (메타 저장) → URL 반환
```

**Presigned URL (大容量)** — 客户端直接 PUT 到存储。服务器仅负责 URL 签发与扫描·校验。
```
Client → POST /api/files/presign (파일명·타입·크기)
       ← Presigned PUT URL (15분 유효)
Client → PUT {presigned_url} (직접 S3 업로드)
Client → POST /api/files/confirm (upload_id)
Server → 스캔·검증 → DB 등록
```

### 2-3. 恶意软件扫描后转可用处理
- 上传后文件状态为 `pending`,需通过恶意软件扫描(ClamAV·AWS GuardDuty Malware 等)才切换为 `clean`。
- 扫描前的文件不下载·不暴露。感染(`infected`)文件隔离/删除。

### 2-4. 阻断公开写入 · 访问控制
- 通过存储桶策略阻断公开 ACL/写入 (`BlockPublicAcls: true`)。
- 下载通过 Presigned GET URL 提供 (TTL 1~24 小时,授权后签发)。
- 敏感文件(合同·身份证号等)放在单独存储桶并应用服务端加密(SSE-KMS)。

### 2-5. UUID 重命名 (防止路径遍历)
- 存储键不直接使用用户输入的文件名,而重命名为 UUID/哈希 (例: `uploads/{uuid}`)。
- 原始文件名仅保留在 DB 元数据中,与存储键分离。

### 2-6. 文件元数据 DB 模式
```sql
CREATE TABLE files (
  id UUID PRIMARY KEY,
  storage_key VARCHAR NOT NULL,  -- S3 객체 키
  original_name VARCHAR,
  content_type VARCHAR,
  size_bytes BIGINT,
  scan_status VARCHAR DEFAULT 'pending',  -- pending|clean|infected
  uploaded_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 3. 常见错误
- 保存到本地磁盘 → 实例扩展·重新部署时文件丢失。
- 将大容量通过服务器中转上传 → 浪费服务器内存·带宽。应使用 Presigned URL。
- 扫描前直接暴露文件 → 恶意软件传播风险。
- 将存储桶对公开开放 → 敏感文件泄露。
- 将用户文件名直接用作键 → 路径遍历·键冲突。

## 4. 检查清单
- [ ] 是否将文件保存到对象存储而非本地磁盘
- [ ] 是否对大容量上传使用 Presigned URL
- [ ] 是否在上传文件通过扫描后才转可用处理
- [ ] 是否阻断存储桶公开写入并仅通过 Presigned URL 提供敏感文件
- [ ] 是否将存储键重命名为 UUID/哈希

## 附录: 各技术栈示例

### Presigned URL 生成 (Python boto3)
```python
import boto3, uuid

s3 = boto3.client("s3")

def generate_upload_url(content_type: str, max_size: int = 10 * 1024 * 1024) -> dict:
    key = f"uploads/{uuid.uuid4()}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
            "ContentLength": max_size,
        },
        ExpiresIn=900,  # 15분
    )
    return {"url": url, "key": key}
```
