---
name: ファイルストレージ (S3 Compatible)
description: ファイルのアップロード・ダウンロード・アクセス制御の汎用標準。オブジェクトストレージ・Presigned URL・マルウェアスキャン・パブリック書き込み遮断・UUID リネームを扱う。ファイルアップロード/ダウンロード機能を設計したり、ストレージのアクセス権限・セキュリティを定めるときに読む。言語/フレームワーク非依存の汎用標準。キーワード: s3, storage, presigned, upload, file, bucket, minio, gcs, object storage, malware scan.
rules:
  - "ファイルをアプリケーションサーバーのローカルディスクに保存しない — オブジェクトストレージ(S3・GCS・MinIO)を使用する。"
  - "大容量ファイルは Presigned URL でクライアントがストレージに直接アップロードし、アプリケーションサーバーを迂回する。"
  - "アップロードされたファイルはウイルス/マルウェアスキャンを通過した後にのみ使用可能状態に切り替える。"
  - "バケットはパブリック書き込みを遮断し、読み取りも必要な場合にのみ許可する — 機密ファイルは Presigned URL でのみ提供する。"
  - "ファイル名はユーザー入力をそのまま使わず UUID/ハッシュにリネームし、パストラバーサル攻撃を防ぐ。"
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

# 📦 ファイルストレージ (S3 Compatible)

> ファイルの保存・転送・アクセス制御の方式を統一する。ファイルアップロード/ダウンロード機能を作ったり、ストレージのセキュリティ・権限を定めるときに読む。

## 1. 中核原則
- ファイルをアプリケーションサーバーのローカルディスクに保存しない — オブジェクトストレージ(S3・GCS・MinIO)を使用する。
- 大容量ファイルは Presigned URL でクライアントがストレージに直接アップロードし、アプリケーションサーバーを迂回する。
- アップロードされたファイルはウイルス/マルウェアスキャンを通過した後にのみ使用可能状態に切り替える。
- バケットはパブリック書き込みを遮断し、読み取りも必要な場合にのみ許可する — 機密ファイルは Presigned URL でのみ提供する。
- ファイル名はユーザー入力をそのまま使わず UUID/ハッシュにリネームし、パストラバーサル攻撃を防ぐ。

## 2. ルール

### 2-1. ローカルディスク禁止 · オブジェクトストレージ使用
- ファイルはオブジェクトストレージ(S3・GCS・MinIO)に保存する。アプリケーションサーバーのローカルディスクは揮発・拡張不可・複数インスタンスの不整合の問題があるため禁止する。
- ファイル本体はストレージに、メタデータ(キー・元名・サイズ・スキャン状態など)は DB に分離して保存する。

### 2-2. アップロードフロー (直接アップロード vs Presigned URL)
アップロードはサイズに応じて二つの経路に分ける。

**直接アップロード (小容量 ≤ 5MB)** — サーバーが中継する。
```
Client → POST /api/files (multipart) → Server → S3 → DB (메타 저장) → URL 반환
```

**Presigned URL (大容量)** — クライアントがストレージに直接 PUT する。サーバーは URL 発行とスキャン・検証のみを担う。
```
Client → POST /api/files/presign (파일명·타입·크기)
       ← Presigned PUT URL (15분 유효)
Client → PUT {presigned_url} (직접 S3 업로드)
Client → POST /api/files/confirm (upload_id)
Server → 스캔·검증 → DB 등록
```

### 2-3. マルウェアスキャン後に使用可能処理
- アップロード直後のファイル状態は `pending` であり、マルウェアスキャン(ClamAV・AWS GuardDuty Malware など)を通過してこそ `clean` に切り替わる。
- スキャン前のファイルはダウンロード・公開しない。感染(`infected`)ファイルは隔離/削除する。

### 2-4. パブリック書き込み遮断 · アクセス制御
- バケットポリシーでパブリック ACL/書き込みを遮断する (`BlockPublicAcls: true`)。
- ダウンロードは Presigned GET URL で提供する (TTL 1〜24 時間、認可後に発行)。
- 機密ファイル(契約書・住民番号など)は別のバケットに置き、サーバーサイド暗号化(SSE-KMS)を適用する。

### 2-5. UUID リネーム (パストラバーサル防止)
- 保存キーはユーザー入力のファイル名をそのまま使わず UUID/ハッシュにリネームする (例: `uploads/{uuid}`)。
- 元のファイル名は DB メタデータにのみ保存し、ストレージキーと分離する。

### 2-6. ファイルメタ DB スキーマ
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

## 3. よくある間違い
- ローカルディスクに保存 → インスタンス拡張・再デプロイ時にファイル喪失。
- 大容量をサーバー経由で中継アップロード → サーバーのメモリ・帯域の浪費。Presigned URL を使うべき。
- スキャン前のファイルをすぐ公開 → マルウェア伝播のリスク。
- バケットをパブリックに開けておく → 機密ファイルの流出。
- ユーザーのファイル名をキーにそのまま使用 → パストラバーサル · キー衝突。

## 4. チェックリスト
- [ ] ファイルをローカルディスクではなくオブジェクトストレージに保存するか
- [ ] 大容量アップロードに Presigned URL を使用するか
- [ ] アップロードファイルをスキャン通過後にのみ使用可能処理するか
- [ ] バケットのパブリック書き込みを遮断し、機密ファイルは Presigned URL でのみ提供するか
- [ ] 保存キーを UUID/ハッシュにリネームしたか

## 付録: スタック別の例

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
