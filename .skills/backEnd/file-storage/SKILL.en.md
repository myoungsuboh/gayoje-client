---
name: File Storage (S3 Compatible)
description: A general standard for file upload, download, and access control. Covers object storage, Presigned URLs, malware scanning, blocking public writes, and UUID renaming. Read it when designing file upload/download features or deciding storage access permissions/security. A general standard independent of language/framework. Keywords: s3, storage, presigned, upload, file, bucket, minio, gcs, object storage, malware scan.
rules:
  - "Do not store files on the application server's local disk — use object storage (S3, GCS, MinIO)."
  - "For large files, use a Presigned URL so the client uploads directly to storage, bypassing the application server."
  - "Transition uploaded files to a usable state only after they pass a virus/malware scan."
  - "Block public writes on buckets and allow reads only when needed — provide sensitive files via Presigned URL only."
  - "Do not use the user's input filename as-is; rename to a UUID/hash to prevent path traversal attacks."
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

# 📦 File Storage (S3 Compatible)

> Unify the approach to file storage, transfer, and access control. Read it when building file upload/download features or deciding storage security/permissions.

## 1. Core Principles
- Do not store files on the application server's local disk — use object storage (S3, GCS, MinIO).
- For large files, use a Presigned URL so the client uploads directly to storage, bypassing the application server.
- Transition uploaded files to a usable state only after they pass a virus/malware scan.
- Block public writes on buckets and allow reads only when needed — provide sensitive files via Presigned URL only.
- Do not use the user's input filename as-is; rename to a UUID/hash to prevent path traversal attacks.

## 2. Rules

### 2-1. No Local Disk · Use Object Storage
- Store files in object storage (S3, GCS, MinIO). The application server's local disk is forbidden because of volatility, inability to scale, and inconsistency across multiple instances.
- Store file bodies in storage, and store metadata (key, original name, size, scan status, etc.) separately in the DB.

### 2-2. Upload Flow (Direct Upload vs Presigned URL)
Uploads are split into two paths by size.

**Direct upload (small ≤ 5MB)** — the server relays.
```
Client → POST /api/files (multipart) → Server → S3 → DB (store meta) → return URL
```

**Presigned URL (large)** — the client PUTs directly to storage. The server only handles URL issuance and scanning/validation.
```
Client → POST /api/files/presign (filename, type, size)
       ← Presigned PUT URL (valid 15 minutes)
Client → PUT {presigned_url} (direct S3 upload)
Client → POST /api/files/confirm (upload_id)
Server → scan/validate → register in DB
```

### 2-3. Mark as Usable After Malware Scan
- Immediately after upload, the file status is `pending`, and it transitions to `clean` only after passing a malware scan (ClamAV, AWS GuardDuty Malware, etc.).
- Do not download/expose files before scanning. Quarantine/delete infected (`infected`) files.

### 2-4. Block Public Writes · Access Control
- Block public ACL/writes via bucket policy (`BlockPublicAcls: true`).
- Provide downloads via Presigned GET URLs (TTL 1–24 hours, issued after authorization).
- Place sensitive files (contracts, national ID numbers, etc.) in a separate bucket and apply server-side encryption (SSE-KMS).

### 2-5. UUID Renaming (Path Traversal Prevention)
- Do not use the user's input filename as-is for the storage key; rename to a UUID/hash (e.g., `uploads/{uuid}`).
- Preserve the original filename only in the DB metadata, separate from the storage key.

### 2-6. File Metadata DB Schema
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

## 3. Common Mistakes
- Storing on local disk → files are lost when instances scale or are redeployed.
- Relaying large uploads through the server → wastes server memory/bandwidth. You should use a Presigned URL.
- Exposing files directly before scanning → risk of malware propagation.
- Leaving buckets open to the public → leakage of sensitive files.
- Using the user's filename directly as the key → path traversal · key collision.

## 4. Checklist
- [ ] Are files stored in object storage rather than local disk?
- [ ] Are Presigned URLs used for large uploads?
- [ ] Are uploaded files marked usable only after passing the scan?
- [ ] Are public writes on buckets blocked and sensitive files provided via Presigned URL only?
- [ ] Are storage keys renamed to a UUID/hash?

## Appendix: Per-Stack Examples

### Presigned URL Generation (Python boto3)
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
