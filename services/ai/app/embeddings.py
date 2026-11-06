import hashlib
import math
import re
from typing import Protocol

from .config import Settings


class Embedder(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashEmbedder:
    """Deterministic bag-of-words embedder (feature hashing).

    No network and no API key, so the whole pipeline runs offline in tests and
    local demos. Quality is far below a real model but good enough for keyword
    overlap retrieval.
    """

    def __init__(self, dim: int = 384):
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in re.findall(r"\w+", text.lower()):
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            vec[h % self.dim] += 1.0 if (h >> 8) & 1 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class OpenAIEmbedder:
    def __init__(self, model: str, dim: int, api_key: str | None):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 128):  # batch to respect request limits
            resp = self.client.embeddings.create(model=self.model, input=texts[i : i + 128])
            out.extend(d.embedding for d in resp.data)
        return out


def build_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "hash":
        return HashEmbedder(settings.embedding_dim)
    if settings.embedding_provider == "openai":
        return OpenAIEmbedder(settings.embedding_model, settings.embedding_dim, settings.openai_api_key)
    raise ValueError(f"Unknown embedding provider: {settings.embedding_provider}")
