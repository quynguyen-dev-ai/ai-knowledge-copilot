import math
from dataclasses import dataclass
from typing import Protocol


@dataclass
class StoredChunk:
    document_id: str
    workspace_id: str
    index: int
    text: str
    embedding: list[float]
    metadata: dict


@dataclass
class SearchHit:
    document_id: str
    index: int
    text: str
    score: float
    metadata: dict


class VectorStore(Protocol):
    def upsert(self, chunks: list[StoredChunk]) -> None: ...

    def delete_document(self, workspace_id: str, document_id: str) -> int: ...

    def search(self, workspace_id: str, query: list[float], k: int) -> list[SearchHit]: ...


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


class InMemoryStore:
    """Reference implementation used in tests."""

    def __init__(self) -> None:
        self._rows: list[StoredChunk] = []

    def upsert(self, chunks: list[StoredChunk]) -> None:
        keys = {(c.workspace_id, c.document_id, c.index) for c in chunks}
        self._rows = [r for r in self._rows if (r.workspace_id, r.document_id, r.index) not in keys]
        self._rows.extend(chunks)

    def delete_document(self, workspace_id: str, document_id: str) -> int:
        before = len(self._rows)
        self._rows = [
            r for r in self._rows if not (r.workspace_id == workspace_id and r.document_id == document_id)
        ]
        return before - len(self._rows)

    def search(self, workspace_id: str, query: list[float], k: int) -> list[SearchHit]:
        scored = [
            SearchHit(r.document_id, r.index, r.text, _cosine(query, r.embedding), r.metadata)
            for r in self._rows
            if r.workspace_id == workspace_id
        ]
        return sorted(scored, key=lambda h: h.score, reverse=True)[:k]


class PgVectorStore:
    """Postgres + pgvector store. Workspaces are isolated by a WHERE clause on
    every query, and an HNSW index keeps search fast as the corpus grows."""

    def __init__(self, dsn: str, dim: int):
        import psycopg
        from pgvector.psycopg import register_vector

        self.conn = psycopg.connect(dsn, autocommit=True)
        self.conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        register_vector(self.conn)
        self.conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS chunks (
              workspace_id TEXT NOT NULL,
              document_id  TEXT NOT NULL,
              idx          INT  NOT NULL,
              text         TEXT NOT NULL,
              metadata     JSONB NOT NULL DEFAULT '{{}}',
              embedding    vector({dim}) NOT NULL,
              PRIMARY KEY (workspace_id, document_id, idx)
            )"""
        )
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw "
            "ON chunks USING hnsw (embedding vector_cosine_ops)"
        )

    def upsert(self, chunks: list[StoredChunk]) -> None:
        from psycopg.types.json import Jsonb

        with self.conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO chunks (workspace_id, document_id, idx, text, metadata, embedding)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (workspace_id, document_id, idx)
                   DO UPDATE SET text = EXCLUDED.text, metadata = EXCLUDED.metadata,
                                 embedding = EXCLUDED.embedding""",
                [
                    (c.workspace_id, c.document_id, c.index, c.text, Jsonb(c.metadata), c.embedding)
                    for c in chunks
                ],
            )

    def delete_document(self, workspace_id: str, document_id: str) -> int:
        cur = self.conn.execute(
            "DELETE FROM chunks WHERE workspace_id = %s AND document_id = %s", (workspace_id, document_id)
        )
        return cur.rowcount

    def search(self, workspace_id: str, query: list[float], k: int) -> list[SearchHit]:
        import numpy as np

        rows = self.conn.execute(
            """SELECT document_id, idx, text, metadata, 1 - (embedding <=> %s) AS score
               FROM chunks WHERE workspace_id = %s
               ORDER BY embedding <=> %s LIMIT %s""",
            (np.array(query), workspace_id, np.array(query), k),
        ).fetchall()
        return [SearchHit(r[0], r[1], r[2], float(r[4]), r[3]) for r in rows]
