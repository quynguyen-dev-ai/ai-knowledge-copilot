from collections.abc import Iterator
from dataclasses import dataclass

from .chunking import chunk_text
from .embeddings import Embedder
from .llm import LLM
from .store import SearchHit, StoredChunk, VectorStore

SYSTEM_PROMPT = """You are a precise assistant that answers questions using ONLY the provided sources.
Rules:
- Cite sources inline as [n], where n is the source number.
- If the sources do not contain the answer, say you don't know. Never invent facts.
- Answer in the same language as the question. Be concise."""


@dataclass
class IngestResult:
    document_id: str
    chunks: int


class RagPipeline:
    def __init__(
        self,
        embedder: Embedder,
        store: VectorStore,
        llm: LLM,
        chunk_size: int = 800,
        chunk_overlap: int = 120,
        top_k: int = 5,
        min_score: float = 0.2,
    ):
        self.embedder = embedder
        self.store = store
        self.llm = llm
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.top_k = top_k
        self.min_score = min_score

    def ingest(
        self, workspace_id: str, document_id: str, text: str, metadata: dict | None = None
    ) -> IngestResult:
        chunks = chunk_text(text, self.chunk_size, self.chunk_overlap)
        if not chunks:
            return IngestResult(document_id, 0)
        vectors = self.embedder.embed([c.text for c in chunks])
        # Re-ingesting a document replaces it, so stale chunks never linger.
        self.store.delete_document(workspace_id, document_id)
        self.store.upsert(
            [
                StoredChunk(document_id, workspace_id, c.index, c.text, v, metadata or {})
                for c, v in zip(chunks, vectors, strict=False)
            ]
        )
        return IngestResult(document_id, len(chunks))

    def retrieve(self, workspace_id: str, question: str) -> list[SearchHit]:
        [qvec] = self.embedder.embed([question])
        hits = self.store.search(workspace_id, qvec, self.top_k)
        return [h for h in hits if h.score >= self.min_score]

    @staticmethod
    def build_prompt(question: str, hits: list[SearchHit]) -> str:
        sources = "\n".join(f"[{i}] {h.text}" for i, h in enumerate(hits, start=1))
        return f"<sources>\n{sources}\n</sources>\n\nQuestion: {question}"

    def answer(self, workspace_id: str, question: str) -> tuple[list[SearchHit], Iterator[str]]:
        hits = self.retrieve(workspace_id, question)
        if not hits:
            return [], iter(["I couldn't find anything about that in your documents."])
        return hits, self.llm.stream(SYSTEM_PROMPT, self.build_prompt(question, hits))
