import json
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .embeddings import build_embedder
from .llm import build_llm
from .rag import RagPipeline
from .store import InMemoryStore, PgVectorStore

app = FastAPI(title="Copilot AI Service", version="1.0.0")


@lru_cache
def get_pipeline() -> RagPipeline:
    s: Settings = get_settings()
    store = InMemoryStore() if s.vector_store == "memory" else PgVectorStore(s.database_url, s.embedding_dim)
    return RagPipeline(
        build_embedder(s), store, build_llm(s), s.chunk_size, s.chunk_overlap, s.top_k, s.min_score
    )


class IngestRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    text: str
    metadata: dict = {}


class QueryRequest(BaseModel):
    workspace_id: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=4000)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ingest")
def ingest(req: IngestRequest, rag: RagPipeline = Depends(get_pipeline)) -> dict:
    result = rag.ingest(req.workspace_id, req.document_id, req.text, req.metadata)
    return {"document_id": result.document_id, "chunks": result.chunks}


@app.delete("/documents/{workspace_id}/{document_id}")
def delete_document(workspace_id: str, document_id: str, rag: RagPipeline = Depends(get_pipeline)) -> dict:
    removed = rag.store.delete_document(workspace_id, document_id)
    if removed == 0:
        raise HTTPException(404, "Document not found")
    return {"removed_chunks": removed}


@app.post("/query")
def query(req: QueryRequest, rag: RagPipeline = Depends(get_pipeline)) -> StreamingResponse:
    """Server-Sent Events: one `sources` event, then `token` events, then `done`."""
    hits, tokens = rag.answer(req.workspace_id, req.question)

    def events():
        sources = [
            {
                "n": i,
                "document_id": h.document_id,
                "chunk": h.index,
                "score": round(h.score, 3),
                "text": h.text[:300],
                "metadata": h.metadata,
            }
            for i, h in enumerate(hits, start=1)
        ]
        yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
        for token in tokens:
            yield f"event: token\ndata: {json.dumps(token)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
