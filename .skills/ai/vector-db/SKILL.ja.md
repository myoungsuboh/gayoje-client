---
name: ベクトル DB 選定 & 運用
description: ベクトル DB(pgvector・Chroma・Pinecone・Qdrant)を選定し、類似度検索・メタデータフィルタリング・インデックス管理でセマンティック検索システムを構築するためのガイド。新しくベクトル DB を選ぶとき、または埋め込みインデックス・フィルタ・テナント分離・モデル変更時の再構築を決めるときに読む。キーワード: pgvector, chroma, pinecone, qdrant, vector-db, hnsw, similarity-search, cosine-similarity, metadata-filter, namespace, collection.
rules:
  - "ベクトル DB はデータ規模・運用の複雑さ・既存スタックに応じて選定し、小規模(<100万ベクトル)は pgvector、大規模は Pinecone・Qdrant を優先して検討する。"
  - "メタデータフィルタリング(category・date・user_id)をベクトル検索と組み合わせ、無関係な結果を事前に除去する。"
  - "埋め込み次元(1536・3072)に合ったインデックスタイプ(HNSW・IVFFlat)を選び、データ規模の変化に応じてインデックスを再構築する。"
  - "ベクトル DB のネームスペース・コレクションでテナント(ユーザー・プロジェクト)を分離し、データの混在を防ぐ。"
  - "埋め込みモデル変更時には既存インデックス全体を再生成し、モデルバージョンをメタデータに併せて保存する。"
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

# 🧠 ベクトル DB 選定 & 運用

> データ規模・運用の複雑さに合ったベクトル DB を選び、効率的なセマンティック検索を運用する。ベクトル DB を新しく導入するとき、またはインデックス・フィルタ・再構築戦略を決めるときに読む。

## 1. 核心原則
- ベクトル DB はデータ規模・運用の複雑さ・既存スタックに応じて選定し、小規模(<100万ベクトル)は pgvector、大規模は Pinecone・Qdrant を優先して検討する。
- メタデータフィルタリング(category・date・user_id)をベクトル検索と組み合わせ、無関係な結果を事前に除去する。
- 埋め込み次元(1536・3072)に合ったインデックスタイプ(HNSW・IVFFlat)を選び、データ規模の変化に応じてインデックスを再構築する。
- ベクトル DB のネームスペース・コレクションでテナント(ユーザー・プロジェクト)を分離し、データの混在を防ぐ。
- 埋め込みモデル変更時には既存インデックス全体を再生成し、モデルバージョンをメタデータに併せて保存する。

## 2. ルール

### 2-1. ベクトル DB 比較 (規模で選定)

| DB | 適合規模 | 運用 | 特徴 |
|----|-----------|------|------|
| **pgvector** | <5M ベクトル | 自己運用 | PostgreSQL 拡張、既存 DB と統合 |
| **Chroma** | <1M ベクトル | ローカル/自己 | 開発・プロトタイプに最適、Python-native |
| **Qdrant** | 大規模 | 自己/クラウド | HNSW 最適化、フィルタ性能が優秀 |
| **Pinecone** | 大規模 | 完全マネージド | サーバーレス、運用負担なし |

### 2-2. pgvector 設定 (PostgreSQL)

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

### 2-3. Chroma (ローカル開発)

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

### 2-4. Qdrant (プロダクション)

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

### 2-5. インデックス再構築ワークフロー (モデル変更時)

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

## 3. よくある間違い
- 規模を無視した DB 選定 → 小規模なのにマネージド導入(過コスト)、大規模なのに自己運用(性能の限界)。
- メタデータフィルタなしでベクトル検索のみ → 無関係な結果が混ざる。
- 次元・規模に合わないインデックス → HNSW パラメータ・IVFFlat の未調整で検索品質・速度が低下。
- テナント未分離 → ネームスペース・コレクションなしでユーザー・プロジェクトのデータが混在する。
- モデル変更後の部分的な再埋め込み → 次元・埋め込み空間の不一致で検索が壊れる。

## 4. チェックリスト
- [ ] データ規模・運用の複雑さに合ったベクトル DB を選んだか
- [ ] メタデータフィルタリングをベクトル検索と組み合わせたか
- [ ] 埋め込み次元に合ったインデックスタイプ・パラメータを設定したか
- [ ] ネームスペース・コレクションでテナントを分離したか
- [ ] モデルバージョンをメタデータに保存し、モデル変更時に全体再構築するか
