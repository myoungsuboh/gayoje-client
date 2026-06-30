---
name: Vector DB Selection & Operations
description: A guide to selecting a vector DB (pgvector, Chroma, Pinecone, Qdrant) and building a semantic search system with similarity search, metadata filtering, and index management. Read this when newly choosing a vector DB, or when deciding on embedding indexes, filters, tenant isolation, and rebuilds on model change. Keywords: pgvector, chroma, pinecone, qdrant, vector-db, hnsw, similarity-search, cosine-similarity, metadata-filter, namespace, collection.
rules:
  - "Choose the vector DB based on data scale, operational complexity, and existing stack; for small scale (<1M vectors) prefer pgvector, and for large scale prefer Pinecone or Qdrant."
  - "Combine metadata filtering (category, date, user_id) with vector search to remove irrelevant results in advance."
  - "Choose an index type (HNSW, IVFFlat) suited to the embedding dimension (1536, 3072), and rebuild the index as the data scale changes."
  - "Isolate tenants (users, projects) using the vector DB's namespaces and collections to prevent data mixing."
  - "When changing the embedding model, regenerate the entire existing index and store the model version in the metadata as well."
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

# 🧠 Vector DB Selection & Operations

> Choose a vector DB that matches your data scale and operational complexity, and run efficient semantic search. Read this when newly adopting a vector DB or deciding on index, filter, and rebuild strategies.

## 1. Core Principles
- Choose the vector DB based on data scale, operational complexity, and existing stack; for small scale (<1M vectors) prefer pgvector, and for large scale prefer Pinecone or Qdrant.
- Combine metadata filtering (category, date, user_id) with vector search to remove irrelevant results in advance.
- Choose an index type (HNSW, IVFFlat) suited to the embedding dimension (1536, 3072), and rebuild the index as the data scale changes.
- Isolate tenants (users, projects) using the vector DB's namespaces and collections to prevent data mixing.
- When changing the embedding model, regenerate the entire existing index and store the model version in the metadata as well.

## 2. Rules

### 2-1. Vector DB Comparison (choose by scale)

| DB | Suitable Scale | Operations | Characteristics |
|----|-----------|------|------|
| **pgvector** | <5M vectors | Self-hosted | PostgreSQL extension, integrates with existing DB |
| **Chroma** | <1M vectors | Local/self-hosted | Optimal for dev/prototyping, Python-native |
| **Qdrant** | Large scale | Self-hosted/cloud | HNSW-optimized, excellent filter performance |
| **Pinecone** | Large scale | Fully managed | Serverless, no operational burden |

### 2-2. pgvector Setup (PostgreSQL)

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

### 2-3. Chroma (local development)

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

### 2-4. Qdrant (production)

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

### 2-5. Index Rebuild Workflow (on model change)

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

## 3. Common Mistakes
- Choosing a DB while ignoring scale → going managed when small (over-cost), or self-hosting when large (performance limits).
- Vector search only, without metadata filters → irrelevant results get mixed in.
- An index that doesn't match dimension/scale → degraded search quality and speed from untuned HNSW parameters or IVFFlat.
- No tenant isolation → user and project data get mixed without namespaces or collections.
- Partial re-embedding after a model change → search breaks due to dimension/embedding-space mismatch.

## 4. Checklist
- [ ] Did you choose a vector DB matching the data scale and operational complexity?
- [ ] Did you combine metadata filtering with vector search?
- [ ] Did you set an index type and parameters suited to the embedding dimension?
- [ ] Did you isolate tenants with namespaces or collections?
- [ ] Do you store the model version in metadata and fully rebuild on model change?
