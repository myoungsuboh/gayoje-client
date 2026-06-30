---
name: 向量数据库选型 & 运维
description: 选择向量数据库(pgvector·Chroma·Pinecone·Qdrant)并通过相似度检索、元数据过滤、索引管理构建语义检索系统的指南。当新选择向量数据库，或确定嵌入索引、过滤、租户隔离、模型变更重建时阅读。关键词: pgvector, chroma, pinecone, qdrant, vector-db, hnsw, similarity-search, cosine-similarity, metadata-filter, namespace, collection.
rules:
  - "根据数据规模·运维复杂度·现有技术栈选择向量数据库，小规模(<100万向量)优先 pgvector，大规模优先考虑 Pinecone·Qdrant。"
  - "将元数据过滤(category·date·user_id)与向量检索结合，预先剔除无关结果。"
  - "选择与嵌入维度(1536·3072)匹配的索引类型(HNSW·IVFFlat)，并随数据规模变化重建索引。"
  - "用向量数据库的命名空间·集合隔离租户(用户·项目)，防止数据混杂。"
  - "更换嵌入模型时重新生成整个现有索引，并将模型版本一并存入元数据。"
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

# 🧠 向量数据库选型 & 运维

> 选择与数据规模·运维复杂度匹配的向量数据库，并高效运维语义检索。当新引入向量数据库或确定索引·过滤·重建策略时阅读。

## 1. 核心原则
- 根据数据规模·运维复杂度·现有技术栈选择向量数据库，小规模(<100万向量)优先 pgvector，大规模优先考虑 Pinecone·Qdrant。
- 将元数据过滤(category·date·user_id)与向量检索结合，预先剔除无关结果。
- 选择与嵌入维度(1536·3072)匹配的索引类型(HNSW·IVFFlat)，并随数据规模变化重建索引。
- 用向量数据库的命名空间·集合隔离租户(用户·项目)，防止数据混杂。
- 更换嵌入模型时重新生成整个现有索引，并将模型版本一并存入元数据。

## 2. 规则

### 2-1. 向量数据库对比 (按规模选择)

| DB | 适合规模 | 运维 | 特点 |
|----|-----------|------|------|
| **pgvector** | <5M 向量 | 自托管 | PostgreSQL 扩展，与现有 DB 集成 |
| **Chroma** | <1M 向量 | 本地/自托管 | 最适合开发·原型，Python-native |
| **Qdrant** | 大规模 | 自托管/云 | HNSW 优化，过滤性能优秀 |
| **Pinecone** | 大规模 | 完全托管 | 无服务器，无运维负担 |

### 2-2. pgvector 设置 (PostgreSQL)

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

### 2-3. Chroma (本地开发)

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

### 2-4. Qdrant (生产)

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

### 2-5. 索引重建工作流 (模型变更时)

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

## 3. 常见错误
- 忽视规模选 DB → 小规模却用托管(成本过高)，大规模却自托管(性能受限)。
- 只做向量检索而无元数据过滤 → 混入无关结果。
- 与维度·规模不匹配的索引 → HNSW 参数·IVFFlat 未调优导致检索质量·速度下降。
- 未隔离租户 → 没有命名空间·集合，用户·项目数据混杂。
- 模型变更后部分重新嵌入 → 维度·嵌入空间不一致导致检索失效。

## 4. 检查清单
- [ ] 是否选择了与数据规模·运维复杂度匹配的向量数据库
- [ ] 是否将元数据过滤与向量检索结合
- [ ] 是否设置了与嵌入维度匹配的索引类型·参数
- [ ] 是否用命名空间·集合隔离租户
- [ ] 是否将模型版本存入元数据，并在模型变更时整体重建
