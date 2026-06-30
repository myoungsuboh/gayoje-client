---
name: 벡터 DB 선택 & 운영
description: 벡터 DB(pgvector·Chroma·Pinecone·Qdrant)를 선택하고 유사도 검색·메타데이터 필터링·인덱스 관리로 의미 검색 시스템을 구축하는 가이드. 새로 벡터 DB를 고르거나, 임베딩 인덱스·필터·테넌트 격리·모델 변경 재구축을 정할 때 읽는다. 키워드: pgvector, chroma, pinecone, qdrant, vector-db, hnsw, similarity-search, cosine-similarity, metadata-filter, namespace, collection.
rules:
  - "벡터 DB는 데이터 규모·운영 복잡도·기존 스택에 따라 선택하고, 소규모(<100만 벡터)는 pgvector, 대규모는 Pinecone·Qdrant를 우선 고려한다."
  - "메타데이터 필터링(category·date·user_id)을 벡터 검색과 결합해 관련 없는 결과를 사전 제거한다."
  - "임베딩 차원(1536·3072)에 맞는 인덱스 타입(HNSW·IVFFlat)을 선택하고, 데이터 규모 변화에 따라 인덱스를 재구축한다."
  - "벡터 DB의 네임스페이스·컬렉션으로 테넌트(사용자·프로젝트)를 격리해 데이터 혼재를 방지한다."
  - "임베딩 모델 변경 시 기존 인덱스 전체를 재생성하고, 모델 버전을 메타데이터에 함께 저장한다."
tags:
  - "pgvector"
  - "chroma"
  - "pinecone"
  - "qdrant"
  - "vector-db"
  - "hnsw"
  - "similarity-search"
  - "cosine-similarity"
  - "metadata-filter"
  - "namespace"
  - "collection"
---

# 🧠 벡터 DB 선택 & 운영

> 데이터 규모·운영 복잡도에 맞는 벡터 DB를 고르고, 효율적인 의미 검색을 운영한다. 벡터 DB를 새로 도입하거나 인덱스·필터·재구축 전략을 정할 때 읽는다.

## 1. 핵심 원칙
- 벡터 DB는 데이터 규모·운영 복잡도·기존 스택에 따라 선택하고, 소규모(<100만 벡터)는 pgvector, 대규모는 Pinecone·Qdrant를 우선 고려한다.
- 메타데이터 필터링(category·date·user_id)을 벡터 검색과 결합해 관련 없는 결과를 사전 제거한다.
- 임베딩 차원(1536·3072)에 맞는 인덱스 타입(HNSW·IVFFlat)을 선택하고, 데이터 규모 변화에 따라 인덱스를 재구축한다.
- 벡터 DB의 네임스페이스·컬렉션으로 테넌트(사용자·프로젝트)를 격리해 데이터 혼재를 방지한다.
- 임베딩 모델 변경 시 기존 인덱스 전체를 재생성하고, 모델 버전을 메타데이터에 함께 저장한다.

## 2. 규칙

### 2-1. 벡터 DB 비교 (규모로 선택)

| DB | 적합 규모 | 운영 | 특징 |
|----|-----------|------|------|
| **pgvector** | <5M 벡터 | 자체 운영 | PostgreSQL 확장, 기존 DB 통합 |
| **Chroma** | <1M 벡터 | 로컬/자체 | 개발·프로토타입 최적, Python-native |
| **Qdrant** | 대규모 | 자체/클라우드 | HNSW 최적화, 필터 성능 우수 |
| **Pinecone** | 대규모 | 완전 관리형 | 서버리스, 운영 부담 없음 |

### 2-2. pgvector 설정 (PostgreSQL)

```sql
-- 확장 설치
CREATE EXTENSION IF NOT EXISTS vector;

-- 테이블 생성 (text-embedding-3-small: 1536 차원)
CREATE TABLE document_embeddings (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    embedding   vector(1536),
    doc_id      VARCHAR(255),
    category    VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    model_version VARCHAR(50)  -- 임베딩 모델 버전 추적
);

-- HNSW 인덱스 (코사인 유사도)
CREATE INDEX ON document_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ✅ 권장 — 메타데이터 필터를 먼저 적용해 관련 없는 결과를 사전 제거
SELECT content, doc_id,
       1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
FROM document_embeddings
WHERE category = 'technical'          -- 메타데이터 필터 먼저 (인덱스 활용)
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

### 2-3. Chroma (로컬 개발)

```python
import chromadb
from chromadb.utils import embedding_functions

# 로컬 영구 저장
client = chromadb.PersistentClient(path="./chroma_db")

openai_ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small",
)

# ✅ 권장 — 컬렉션으로 테넌트(프로젝트) 격리
collection = client.get_or_create_collection(
    name=f"project_{project_id}",
    embedding_function=openai_ef,
    metadata={"hnsw:space": "cosine"},
)

# 문서 삽입
collection.add(
    ids=[f"chunk-{i}" for i in range(len(chunks))],
    documents=chunks,
    metadatas=[{"doc_id": doc_id, "chunk_index": i, "model": "text-embedding-3-small"}
               for i in range(len(chunks))],
)

# 메타데이터 필터 검색
results = collection.query(
    query_texts=["FastAPI 인증 미들웨어"],
    n_results=5,
    where={"doc_id": {"$in": allowed_doc_ids}},  # 접근 제어
)
```

### 2-4. Qdrant (프로덕션)

```python
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
)

client = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"])

# 컬렉션 생성
client.recreate_collection(
    collection_name="documents",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

# 벡터 삽입
points = [
    PointStruct(
        id=i,
        vector=embed_text(chunk),
        payload={"content": chunk, "doc_id": doc_id, "category": category},
    )
    for i, chunk in enumerate(chunks)
]
client.upsert(collection_name="documents", points=points)

# 필터링 검색
results = client.search(
    collection_name="documents",
    query_vector=embed_text(query),
    limit=5,
    query_filter=Filter(
        must=[FieldCondition(key="category", match=MatchValue(value="api-docs"))]
    ),
)
```

### 2-5. 인덱스 재구축 워크플로우 (모델 변경 시)

```python
def rebuild_index_on_model_change(new_model: str, collection_name: str):
    """임베딩 모델 변경 시 전체 재구축"""
    docs = fetch_all_documents_from_db()

    # 1. 새 컬렉션 생성 (블루-그린 방식)
    tmp_collection = f"{collection_name}_rebuild"
    create_collection(tmp_collection)

    # 2. 새 모델로 재임베딩
    for batch in chunked(docs, size=100):
        embeddings = embed_batch([d.content for d in batch], model=new_model)
        insert_batch(tmp_collection, batch, embeddings, model_version=new_model)

    # 3. 원자적 교체
    client.delete_collection(collection_name)
    client.rename_collection(tmp_collection, collection_name)
    logger.info(f"인덱스 재구축 완료: {len(docs)}개 문서, 모델={new_model}")
```

## 3. 흔한 실수
- 규모를 무시한 DB 선택 → 소규모인데 관리형 도입(과비용), 대규모인데 자체 운영(성능 한계).
- 메타데이터 필터 없이 벡터 검색만 → 관련 없는 결과가 섞인다.
- 차원·규모에 안 맞는 인덱스 → HNSW 파라미터·IVFFlat 미조정으로 검색 품질·속도 저하.
- 테넌트 미격리 → 네임스페이스·컬렉션 없이 사용자·프로젝트 데이터가 혼재된다.
- 모델 변경 후 부분 재임베딩 → 차원·임베딩 공간 불일치로 검색이 깨진다.

## 4. 체크리스트
- [ ] 데이터 규모·운영 복잡도에 맞는 벡터 DB를 골랐는가
- [ ] 메타데이터 필터링을 벡터 검색과 결합했는가
- [ ] 임베딩 차원에 맞는 인덱스 타입·파라미터를 설정했는가
- [ ] 네임스페이스·컬렉션으로 테넌트를 격리했는가
- [ ] 모델 버전을 메타데이터에 저장하고, 모델 변경 시 전체 재구축하는가
