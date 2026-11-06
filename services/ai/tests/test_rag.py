import pytest
from fastapi.testclient import TestClient

from app.embeddings import HashEmbedder
from app.llm import EchoLLM
from app.rag import RagPipeline
from app.store import InMemoryStore

POLICY = """Vacation policy. Full-time employees receive 25 paid vacation days per year.

Remote work. Employees may work remotely up to three days per week with manager approval.

Expenses. Travel expenses must be submitted within 30 days with receipts."""


@pytest.fixture
def rag() -> RagPipeline:
    return RagPipeline(
        HashEmbedder(256), InMemoryStore(), EchoLLM(), chunk_size=120, chunk_overlap=0, min_score=0.05
    )


def test_retrieves_most_relevant_chunk(rag):
    rag.ingest("ws1", "handbook", POLICY)
    hits = rag.retrieve("ws1", "How many vacation days do employees get?")
    assert hits
    assert "25 paid vacation days" in hits[0].text


def test_workspaces_are_isolated(rag):
    rag.ingest("ws1", "handbook", POLICY)
    assert rag.retrieve("ws2", "vacation days") == []


def test_reingest_replaces_old_chunks(rag):
    rag.ingest("ws1", "doc", POLICY)
    rag.ingest("ws1", "doc", "Completely new content about parking spaces.")
    texts = [h.text for h in rag.retrieve("ws1", "parking spaces")]
    assert texts and all("vacation" not in t for t in texts)


def test_answer_without_sources_does_not_hallucinate(rag):
    hits, tokens = rag.answer("empty", "What is the meaning of life?")
    assert hits == []
    assert "couldn't find" in "".join(tokens)


def test_api_end_to_end(monkeypatch, rag):
    from app import main

    main.app.dependency_overrides[main.get_pipeline] = lambda: rag
    client = TestClient(main.app)

    r = client.post("/ingest", json={"workspace_id": "ws1", "document_id": "h", "text": POLICY})
    assert r.status_code == 200 and r.json()["chunks"] >= 3

    r = client.post("/query", json={"workspace_id": "ws1", "question": "remote work days per week?"})
    assert r.status_code == 200
    assert "event: sources" in r.text and "event: done" in r.text
    assert "remotely" in r.text

    assert client.delete("/documents/ws1/h").status_code == 200
    assert client.delete("/documents/ws1/h").status_code == 404
    main.app.dependency_overrides.clear()
