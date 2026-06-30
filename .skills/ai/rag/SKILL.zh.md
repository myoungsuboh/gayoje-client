---
name: RAG (检索增强生成)
description: 通过向量检索找到相关文档并注入 LLM 上下文以生成最新、领域特定答案的 RAG 架构指南。当设计 RAG 流水线或确定分块、嵌入、检索、出处处理时阅读。关键词: rag, vector-search, embedding, chunking, retrieval, openai-embeddings, pgvector, chroma, faiss, hybrid-search, bm25.
rules:
  - "分块策略(大小、重叠)要根据文档类型设置,并优先以段落、章节为单位,使上下文不在分块边界处被切断。"
  - "检索结果要用相似度分数阈值(≥0.75)过滤,使不相关的分块不污染上下文。"
  - "在 LLM 响应中包含引用(出处),使用户可以验证原文。"
  - "更换嵌入模型和分块策略时,要全量重建现有索引。"
  - "默认采用 Hybrid Search(关键词+向量),同时利用精确术语匹配和语义相似性。"
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

# 🔎 RAG (检索增强生成)

> 通过向量检索找到相关文档并注入 LLM 上下文。当设计 RAG 流水线或确定分块、嵌入、检索、出处处理时阅读。

## 1. 核心原则
- 分块策略(大小、重叠)要根据文档类型设置,并优先以段落、章节为单位,使上下文不在分块边界处被切断。
- 检索结果要用相似度分数阈值(≥0.75)过滤,使不相关的分块不污染上下文。
- 在 LLM 响应中包含引用(出处),使用户可以验证原文。
- 更换嵌入模型和分块策略时,要全量重建现有索引。
- 默认采用 Hybrid Search(关键词+向量),同时利用精确术语匹配和语义相似性。

## 2. 规则

### 2-1. RAG 流水线架构

```
문서 수집 → 청킹 → 임베딩 → 벡터 DB 저장
                                    ↓
사용자 질의 → 질의 임베딩 → 유사도 검색 → 컨텍스트 조립 → LLM → 응답 + 출처
```

### 2-2. 文档分块策略

根据文档类型设置不同的分块大小、重叠、边界分隔符。

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

### 2-3. 嵌入 & 向量存储 (pgvector)

检索时用相似度阈值过滤以排除不相关的分块。

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

### 2-4. Hybrid Search (向量 + BM25)

将关键词匹配(BM25)与语义相似性(向量)以 RRF 方式合并。

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

### 2-5. 上下文组装 & 包含出处

为上下文附上出处编号,并通过系统提示词抑制幻觉、强制标明出处。

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

## 3. 常见错误
- 分块边界从段落或函数中间切断,丢失上下文。
- 不设相似度阈值只用 top_k,导致不相关的分块污染上下文。
- 不在响应中包含出处,使用户无法验证原文。
- 更换嵌入模型、分块策略却不重建现有索引,导致检索质量下降。
- 只用向量检索,漏掉需要精确术语匹配的查询。

## 4. 检查清单
- [ ] 分块策略是否根据文档类型设置,分块边界是否未切断上下文?
- [ ] 是否用相似度阈值(≥0.75)过滤检索结果?
- [ ] 是否在 LLM 响应中包含了出处?
- [ ] 更换嵌入模型、分块策略时是否全量重建了索引?
- [ ] 是否应用了 Hybrid Search(关键词+向量)?
