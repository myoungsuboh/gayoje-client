---
name: RAG (検索拡張生成)
description: ベクトル検索で関連文書を見つけてLLMコンテキストに注入し、最新・ドメイン特化の回答を生成するRAGアーキテクチャガイド。RAGパイプラインを設計したり、チャンキング・埋め込み・検索・出典処理を定める際に読む。キーワード: rag, vector-search, embedding, chunking, retrieval, openai-embeddings, pgvector, chroma, faiss, hybrid-search, bm25.
rules:
  - "チャンキング戦略(サイズ・オーバーラップ)は文書タイプに合わせて設定し、チャンク境界で文脈が途切れないよう段落・セクション単位を優先する。"
  - "検索結果は類似度スコアの閾値(≥0.75)でフィルタリングし、関連のないチャンクがコンテキストを汚染しないようにする。"
  - "引用(出典)をLLM応答に含め、ユーザーが原文を検証できるようにする。"
  - "埋め込みモデルとチャンキング戦略を変更する際は既存のインデックスを全体再構築する。"
  - "Hybrid Search(キーワード+ベクトル)を既定で採用し、正確な用語マッチと意味的類似性を併用する。"
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

# 🔎 RAG (検索拡張生成)

> ベクトル検索で関連文書を見つけてLLMコンテキストに注入する。RAGパイプラインを設計したり、チャンキング・埋め込み・検索・出典処理を定める際に読む。

## 1. 核心原則
- チャンキング戦略(サイズ・オーバーラップ)は文書タイプに合わせて設定し、チャンク境界で文脈が途切れないよう段落・セクション単位を優先する。
- 検索結果は類似度スコアの閾値(≥0.75)でフィルタリングし、関連のないチャンクがコンテキストを汚染しないようにする。
- 引用(出典)をLLM応答に含め、ユーザーが原文を検証できるようにする。
- 埋め込みモデルとチャンキング戦略を変更する際は既存のインデックスを全体再構築する。
- Hybrid Search(キーワード+ベクトル)を既定で採用し、正確な用語マッチと意味的類似性を併用する。

## 2. ルール

### 2-1. RAGパイプラインアーキテクチャ

```
문서 수집 → 청킹 → 임베딩 → 벡터 DB 저장
                                    ↓
사용자 질의 → 질의 임베딩 → 유사도 검색 → 컨텍스트 조립 → LLM → 응답 + 출처
```

### 2-2. 文書チャンキング戦略

文書タイプに合わせてチャンクサイズ・オーバーラップ・境界区切り文字を変えて設定する。

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

### 2-3. 埋め込み & ベクトル保存 (pgvector)

検索時に類似度閾値でフィルタリングして関連のないチャンクを除外する。

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

### 2-4. Hybrid Search (ベクトル + BM25)

キーワードマッチ(BM25)と意味的類似性(ベクトル)をRRF方式で合算する。

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

### 2-5. コンテキスト組み立て & 出典の包含

コンテキストに出典番号を付け、システムプロンプトでハルシネーションを抑制し出典明示を強制する。

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

## 3. よくあるミス
- チャンク境界が段落・関数の途中を切り、文脈が失われる。
- 類似度閾値なしにtop_kだけを使い、関連のないチャンクがコンテキストを汚染する。
- 出典を応答に含めず、ユーザーが原文を検証できない。
- 埋め込みモデル・チャンキング戦略を変えても既存インデックスを再構築せず、検索品質が低下する。
- ベクトル検索だけを使い、正確な用語マッチが必要な質問を取りこぼす。

## 4. チェックリスト
- [ ] チャンキング戦略を文書タイプに合わせて設定し、チャンク境界が文脈を切っていないか
- [ ] 検索結果を類似度閾値(≥0.75)でフィルタリングしているか
- [ ] LLM応答に出典を含めたか
- [ ] 埋め込みモデル・チャンキング戦略の変更時にインデックスを全体再構築したか
- [ ] Hybrid Search(キーワード+ベクトル)を適用したか
