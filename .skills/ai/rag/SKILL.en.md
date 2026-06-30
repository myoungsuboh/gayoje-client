---
name: RAG (Retrieval-Augmented Generation)
description: A guide to RAG architecture that finds relevant documents via vector search and injects them into the LLM context to generate up-to-date, domain-specific answers. Read this when designing a RAG pipeline or deciding on chunking, embedding, retrieval, and source handling. Keywords: rag, vector-search, embedding, chunking, retrieval, openai-embeddings, pgvector, chroma, faiss, hybrid-search, bm25.
rules:
  - "Set the chunking strategy (size, overlap) to fit the document type, and prefer paragraph/section boundaries so context isn't cut off at chunk edges."
  - "Filter retrieval results by a similarity-score threshold (≥0.75) so irrelevant chunks don't pollute the context."
  - "Include citations (sources) in the LLM response so the user can verify the original text."
  - "Fully rebuild the existing index when the embedding model or chunking strategy changes."
  - "Adopt Hybrid Search (keyword + vector) by default to leverage both exact term matching and semantic similarity."
tags:
  - "rag"
  - "vector-search"
  - "embedding"
  - "chunking"
  - "retrieval"
  - "openai-embeddings"
  - "pgvector"
  - "chroma"
  - "faiss"
  - "hybrid-search"
  - "bm25"
---

# 🔎 RAG (Retrieval-Augmented Generation)

> Find relevant documents via vector search and inject them into the LLM context. Read this when designing a RAG pipeline or deciding on chunking, embedding, retrieval, and source handling.

## 1. Core Principles
- Set the chunking strategy (size, overlap) to fit the document type, and prefer paragraph/section boundaries so context isn't cut off at chunk edges.
- Filter retrieval results by a similarity-score threshold (≥0.75) so irrelevant chunks don't pollute the context.
- Include citations (sources) in the LLM response so the user can verify the original text.
- Fully rebuild the existing index when the embedding model or chunking strategy changes.
- Adopt Hybrid Search (keyword + vector) by default to leverage both exact term matching and semantic similarity.

## 2. Rules

### 2-1. RAG pipeline architecture

```
문서 수집 → 청킹 → 임베딩 → 벡터 DB 저장
                                    ↓
사용자 질의 → 질의 임베딩 → 유사도 검색 → 컨텍스트 조립 → LLM → 응답 + 출처
```

### 2-2. Document chunking strategy

Set chunk size, overlap, and boundary separators differently to fit the document type.

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

def chunk_document(text: str, doc_type: str) -> list[str]:
    if doc_type == "code":
        # ✅ 코드: 함수/클래스 경계 유지
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1500,
            chunk_overlap=200,
            separators=["\nclass ", "\ndef ", "\n\n", "\n"],
        )
    else:
        # ✅ 일반 문서: 문단 경계 우선
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=["\n\n", "\n", ". ", " "],
        )
    return splitter.split_text(text)
```

### 2-3. Embedding & vector storage (pgvector)

Filter by a similarity threshold at retrieval time to exclude irrelevant chunks.

```python
import openai
import psycopg2

def embed_text(text: str) -> list[float]:
    response = openai.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding

def store_chunks(chunks: list[str], doc_id: str, conn):
    with conn.cursor() as cur:
        for i, chunk in enumerate(chunks):
            embedding = embed_text(chunk)
            cur.execute(
                """INSERT INTO document_chunks
                   (doc_id, chunk_index, content, embedding)
                   VALUES (%s, %s, %s, %s)""",
                (doc_id, i, chunk, embedding),
            )
    conn.commit()

def search_similar(query: str, conn, top_k: int = 5, threshold: float = 0.75):
    query_embedding = embed_text(query)
    with conn.cursor() as cur:
        cur.execute(
            """SELECT content, doc_id, 1 - (embedding <=> %s::vector) AS score
               FROM document_chunks
               WHERE 1 - (embedding <=> %s::vector) >= %s
               ORDER BY score DESC
               LIMIT %s""",
            (query_embedding, query_embedding, threshold, top_k),
        )
        rows = cur.fetchall()
        # 튜플 → dict 매핑 (호출부가 r["content"]/r["doc_id"]/r["score"]로 접근)
        return [{"content": r[0], "doc_id": r[1], "score": r[2]} for r in rows]
```

### 2-4. Hybrid Search (vector + BM25)

Combine keyword matching (BM25) and semantic similarity (vector) using the RRF method.

```python
from rank_bm25 import BM25Okapi

class HybridRetriever:
    def __init__(self, chunks: list[str], conn):
        self.chunks = chunks
        self.conn = conn          # 벡터 검색용 DB 커넥션 (search에서 사용)
        tokenized = [c.lower().split() for c in chunks]
        self.bm25 = BM25Okapi(tokenized)

    def search(self, query: str, top_k: int = 5) -> list[str]:
        # BM25 키워드 점수
        bm25_scores = self.bm25.get_scores(query.lower().split())

        # 벡터 유사도 점수 (별도 조회)
        vector_results = search_similar(query, conn=self.conn, top_k=top_k * 2)
        vector_scores = {r["content"]: r["score"] for r in vector_results}

        # 점수 정규화 후 합산 (RRF 방식)
        combined = {}
        for i, chunk in enumerate(self.chunks):
            bm25_rank = sorted(range(len(bm25_scores)), key=lambda x: -bm25_scores[x]).index(i) + 1
            vec_rank = vector_scores.get(chunk, 0)
            combined[chunk] = 1 / (60 + bm25_rank) + vec_rank
        return sorted(combined, key=combined.get, reverse=True)[:top_k]
```

### 2-5. Context assembly & including sources

Attach source numbers to the context, and use the system prompt to suppress hallucination and enforce citing sources.

```python
def build_rag_prompt(query: str, retrieved: list[dict]) -> list[dict]:
    context_parts = []
    for i, chunk in enumerate(retrieved, 1):
        context_parts.append(f"[출처 {i}: {chunk['doc_id']}]\n{chunk['content']}")

    context = "\n\n---\n\n".join(context_parts)

    return [
        {"role": "system", "content": (
            "아래 컨텍스트를 기반으로 질문에 답하세요. "
            "컨텍스트에 없는 내용은 '모르겠습니다'라고 답하세요. "
            "답변 끝에 사용한 출처 번호를 명시하세요."
        )},
        {"role": "user", "content": f"컨텍스트:\n{context}\n\n질문: {query}"},
    ]
```

## 3. Common Mistakes
- Chunk boundaries cut through the middle of a paragraph or function, losing context.
- Using only top_k without a similarity threshold, so irrelevant chunks pollute the context.
- Not including sources in the response, so the user can't verify the original text.
- Changing the embedding model or chunking strategy without rebuilding the existing index, degrading retrieval quality.
- Using only vector search and missing queries that need exact term matching.

## 4. Checklist
- [ ] Is the chunking strategy set to fit the document type, and do chunk boundaries not cut off context?
- [ ] Do you filter retrieval results by a similarity threshold (≥0.75)?
- [ ] Did you include sources in the LLM response?
- [ ] Did you fully rebuild the index when the embedding model or chunking strategy changed?
- [ ] Did you apply Hybrid Search (keyword + vector)?
