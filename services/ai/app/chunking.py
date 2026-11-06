"""Structure-aware text chunking.

Splits on paragraph boundaries first, then sentences, and only falls back to a
hard character split for very long sentences. Consecutive chunks share an
overlap so that answers spanning a boundary can still be retrieved.
"""

import re
from dataclasses import dataclass

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str


def _split_units(text: str, max_len: int) -> list[str]:
    units: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = " ".join(para.split())
        if not para:
            continue
        if len(para) <= max_len:
            units.append(para)
            continue
        for sentence in _SENTENCE_RE.split(para):
            while len(sentence) > max_len:
                units.append(sentence[:max_len])
                sentence = sentence[max_len:]
            if sentence:
                units.append(sentence)
    return units


def chunk_text(text: str, size: int = 800, overlap: int = 120) -> list[Chunk]:
    if size <= 0:
        raise ValueError("size must be positive")
    if not 0 <= overlap < size:
        raise ValueError("overlap must be in [0, size)")

    chunks: list[Chunk] = []
    current = ""
    for unit in _split_units(text, size):
        candidate = f"{current} {unit}".strip()
        if len(candidate) <= size:
            current = candidate
            continue
        chunks.append(Chunk(len(chunks), current))
        tail = current[-overlap:] if overlap else ""
        current = f"{tail} {unit}".strip()
        if len(current) > size:
            current = unit
    if current:
        chunks.append(Chunk(len(chunks), current))
    return chunks
