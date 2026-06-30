---
name: RAG (검색 증강 생성)
description: 벡터 검색으로 관련 문서를 찾아 LLM 컨텍스트에 주입해 최신·도메인 특화 답변을 생성하는 RAG 아키텍처 가이드. RAG 파이프라인을 설계하거나 청킹·임베딩·검색·출처 처리를 정할 때 읽는다. 키워드: rag, vector-search, embedding, chunking, retrieval, openai-embeddings, pgvector, chroma, faiss, hybrid-search, bm25.
rules:
  - "청킹 전략(크기·오버랩)은 문서 유형에 맞게 설정하고, 청크 경계에서 맥락이 끊기지 않도록 문단·섹션 단위를 우선한다."
  - "검색 결과는 유사도 점수 임계값(≥0.75)으로 필터링하고, 관련 없는 청크가 컨텍스트를 오염시키지 않게 한다."
  - "인용(출처)을 LLM 응답에 포함시켜 사용자가 원문을 검증할 수 있게 한다."
  - "임베딩 모델과 청킹 전략 변경 시 기존 인덱스를 전체 재구축한다."
  - "Hybrid Search(키워드+벡터)를 기본으로 채택해 정확한 용어 매칭과 의미 유사성을 함께 활용한다."
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

# 🔎 RAG (검색 증강 생성)

> 벡터 검색으로 관련 문서를 찾아 LLM 컨텍스트에 주입한다. RAG 파이프라인을 설계하거나 청킹·임베딩·검색·출처 처리를 정할 때 읽는다.

## 1. 핵심 원칙
- 청킹 전략(크기·오버랩)은 문서 유형에 맞게 설정하고, 청크 경계에서 맥락이 끊기지 않도록 문단·섹션 단위를 우선한다.
- 검색 결과는 유사도 점수 임계값(≥0.75)으로 필터링하고, 관련 없는 청크가 컨텍스트를 오염시키지 않게 한다.
- 인용(출처)을 LLM 응답에 포함시켜 사용자가 원문을 검증할 수 있게 한다.
- 임베딩 모델과 청킹 전략 변경 시 기존 인덱스를 전체 재구축한다.
- Hybrid Search(키워드+벡터)를 기본으로 채택해 정확한 용어 매칭과 의미 유사성을 함께 활용한다.

## 2. 규칙

### 2-1. RAG 파이프라인 아키텍처

```
문서 수집 → 청킹 → 임베딩 → 벡터 DB 저장
                                    ↓
사용자 질의 → 질의 임베딩 → 유사도 검색 → 컨텍스트 조립 → LLM → 응답 + 출처
```

### 2-2. 문서 청킹 전략

문서 유형에 맞춰 청크 크기·오버랩·경계 구분자를 다르게 설정한다.

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

### 2-3. 임베딩 & 벡터 저장 (pgvector)

검색 시 유사도 임계값으로 필터링해 관련 없는 청크를 배제한다.

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

### 2-4. Hybrid Search (벡터 + BM25)

키워드 매칭(BM25)과 의미 유사성(벡터)을 RRF 방식으로 합산한다.

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

### 2-5. 컨텍스트 조립 & 출처 포함

컨텍스트에 출처 번호를 붙이고, 시스템 프롬프트로 환각을 억제하며 출처 명시를 강제한다.

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

## 3. 흔한 실수
- 청크 경계가 문단·함수 중간을 끊어 맥락이 손실됨.
- 유사도 임계값 없이 top_k만 사용해 관련 없는 청크가 컨텍스트를 오염시킴.
- 출처를 응답에 포함하지 않아 사용자가 원문을 검증하지 못함.
- 임베딩 모델·청킹 전략을 바꾸고 기존 인덱스를 재구축하지 않아 검색 품질이 저하됨.
- 벡터 검색만 사용해 정확한 용어 매칭이 필요한 질의를 놓침.

## 4. 체크리스트
- [ ] 청킹 전략을 문서 유형에 맞게 설정하고 청크 경계가 맥락을 끊지 않는가
- [ ] 검색 결과를 유사도 임계값(≥0.75)으로 필터링하는가
- [ ] LLM 응답에 출처를 포함했는가
- [ ] 임베딩 모델·청킹 전략 변경 시 인덱스를 전체 재구축했는가
- [ ] Hybrid Search(키워드+벡터)를 적용했는가
