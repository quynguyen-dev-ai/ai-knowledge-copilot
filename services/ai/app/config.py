from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://copilot:copilot@localhost:5432/copilot"
    vector_store: str = "pgvector"  # "pgvector" | "memory"

    embedding_provider: str = "openai"  # "openai" | "hash" (offline, for tests/demo)
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    llm_provider: str = "openai"  # "openai" | "anthropic" | "echo" (offline)
    llm_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None

    chunk_size: int = 800
    chunk_overlap: int = 120
    top_k: int = 5
    min_score: float = 0.2


@lru_cache
def get_settings() -> Settings:
    return Settings()
