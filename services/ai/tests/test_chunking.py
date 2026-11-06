import pytest

from app.chunking import chunk_text


def test_short_text_is_single_chunk():
    chunks = chunk_text("Hello world.", size=100, overlap=10)
    assert [c.text for c in chunks] == ["Hello world."]


def test_chunks_respect_size_and_keep_order():
    text = "\n\n".join(f"Paragraph {i}. " + "word " * 40 for i in range(10))
    chunks = chunk_text(text, size=300, overlap=50)
    assert len(chunks) > 1
    assert all(len(c.text) <= 300 for c in chunks)
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_overlap_carries_context_between_chunks():
    text = "\n\n".join(f"Sentence number {i} is here." for i in range(30))
    chunks = chunk_text(text, size=120, overlap=30)
    for prev, nxt in zip(chunks, chunks[1:], strict=False):
        assert prev.text[-30:].strip() in nxt.text


def test_very_long_sentence_is_hard_split():
    chunks = chunk_text("x" * 1000, size=200, overlap=0)
    assert all(len(c.text) <= 200 for c in chunks)
    assert "".join(c.text for c in chunks) == "x" * 1000


def test_empty_text_yields_no_chunks():
    assert chunk_text("   \n\n  ") == []


@pytest.mark.parametrize("size,overlap", [(0, 0), (100, 100), (100, -1)])
def test_invalid_params(size, overlap):
    with pytest.raises(ValueError):
        chunk_text("abc", size=size, overlap=overlap)
