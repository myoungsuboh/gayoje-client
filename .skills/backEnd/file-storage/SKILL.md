---
name: 파일 스토리지 (S3 Compatible)
description: 파일 업로드·다운로드·접근 제어의 범용 표준. 오브젝트 스토리지·Presigned URL·멀웨어 스캔·퍼블릭 쓰기 차단·UUID 재명명을 다룬다. 파일 업로드/다운로드 기능을 설계하거나 스토리지 접근 권한·보안을 정할 때 읽는다. 언어/프레임워크 무관 범용 표준. 키워드: s3, storage, presigned, upload, file, bucket, minio, gcs, object storage, malware scan.
rules:
  - "파일을 애플리케이션 서버의 로컬 디스크에 저장하지 않는다 — 오브젝트 스토리지(S3·GCS·MinIO)를 사용한다."
  - "대용량 파일은 Presigned URL로 클라이언트가 스토리지에 직접 업로드해 애플리케이션 서버를 우회한다."
  - "업로드된 파일은 바이러스/멀웨어 스캔을 통과한 뒤에만 사용 가능 상태로 전환한다."
  - "버킷은 퍼블릭 쓰기를 차단하고, 읽기도 필요한 경우에만 허용한다 — 민감 파일은 Presigned URL로만 제공한다."
  - "파일명은 사용자 입력을 그대로 쓰지 않고 UUID/해시로 재명명해 경로 탐색 공격을 막는다."
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

# 📦 파일 스토리지 (S3 Compatible)

> 파일 저장·전송·접근 제어 방식을 통일한다. 파일 업로드/다운로드 기능을 만들거나 스토리지 보안·권한을 정할 때 읽는다.

## 1. 핵심 원칙
- 파일을 애플리케이션 서버의 로컬 디스크에 저장하지 않는다 — 오브젝트 스토리지(S3·GCS·MinIO)를 사용한다.
- 대용량 파일은 Presigned URL로 클라이언트가 스토리지에 직접 업로드해 애플리케이션 서버를 우회한다.
- 업로드된 파일은 바이러스/멀웨어 스캔을 통과한 뒤에만 사용 가능 상태로 전환한다.
- 버킷은 퍼블릭 쓰기를 차단하고, 읽기도 필요한 경우에만 허용한다 — 민감 파일은 Presigned URL로만 제공한다.
- 파일명은 사용자 입력을 그대로 쓰지 않고 UUID/해시로 재명명해 경로 탐색 공격을 막는다.

## 2. 규칙

### 2-1. 로컬 디스크 금지 · 오브젝트 스토리지 사용
- 파일은 오브젝트 스토리지(S3·GCS·MinIO)에 저장한다. 애플리케이션 서버의 로컬 디스크는 휘발·확장 불가·다중 인스턴스 불일치 문제가 있어 금지한다.
- 파일 본문은 스토리지에, 메타데이터(키·원본명·크기·스캔 상태 등)는 DB에 분리 저장한다.

### 2-2. 업로드 흐름 (직접 업로드 vs Presigned URL)
업로드는 크기에 따라 두 경로로 나눈다.

**직접 업로드 (소용량 ≤ 5MB)** — 서버가 중계한다.
```
Client → POST /api/files (multipart) → Server → S3 → DB (메타 저장) → URL 반환
```

**Presigned URL (대용량)** — 클라이언트가 스토리지에 직접 PUT 한다. 서버는 URL 발급과 스캔·검증만 담당한다.
```
Client → POST /api/files/presign (파일명·타입·크기)
       ← Presigned PUT URL (15분 유효)
Client → PUT {presigned_url} (직접 S3 업로드)
Client → POST /api/files/confirm (upload_id)
Server → 스캔·검증 → DB 등록
```

### 2-3. 멀웨어 스캔 후 사용 가능 처리
- 업로드 직후 파일 상태는 `pending`이며, 멀웨어 스캔(ClamAV·AWS GuardDuty Malware 등)을 통과해야 `clean`으로 전환한다.
- 스캔 전 파일은 다운로드·노출하지 않는다. 감염(`infected`) 파일은 격리/삭제한다.

### 2-4. 퍼블릭 쓰기 차단 · 접근 제어
- 버킷 정책으로 퍼블릭 ACL/쓰기를 차단한다 (`BlockPublicAcls: true`).
- 다운로드는 Presigned GET URL로 제공한다 (TTL 1~24시간, 인가 후 발급).
- 민감 파일(계약서·주민번호 등)은 별도 버킷에 두고 서버 사이드 암호화(SSE-KMS)를 적용한다.

### 2-5. UUID 재명명 (경로 탐색 방지)
- 저장 키는 사용자 입력 파일명을 그대로 쓰지 않고 UUID/해시로 재명명한다 (예: `uploads/{uuid}`).
- 원본 파일명은 DB 메타데이터에만 보존하고, 스토리지 키와 분리한다.

### 2-6. 파일 메타 DB 스키마
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

## 3. 흔한 실수
- 로컬 디스크에 저장 → 인스턴스 확장·재배포 시 파일 유실.
- 대용량을 서버로 중계 업로드 → 서버 메모리·대역폭 낭비. Presigned URL을 써야 한다.
- 스캔 전 파일을 바로 노출 → 멀웨어 전파 위험.
- 버킷을 퍼블릭으로 열어둠 → 민감 파일 유출.
- 사용자 파일명을 키로 그대로 사용 → 경로 탐색·키 충돌.

## 4. 체크리스트
- [ ] 파일을 로컬 디스크가 아닌 오브젝트 스토리지에 저장하는가
- [ ] 대용량 업로드에 Presigned URL을 사용하는가
- [ ] 업로드 파일을 스캔 통과 후에만 사용 가능 처리하는가
- [ ] 버킷 퍼블릭 쓰기를 차단하고 민감 파일은 Presigned URL로만 제공하는가
- [ ] 저장 키를 UUID/해시로 재명명했는가

## 부록: 스택별 예시

### Presigned URL 생성 (Python boto3)
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
