from collections.abc import Iterator
from typing import Protocol

from .config import Settings


class LLM(Protocol):
    def stream(self, system: str, user: str) -> Iterator[str]: ...


class EchoLLM:
    """Offline stand-in: answers with the top source so demos and tests run
    without an API key."""

    def stream(self, system: str, user: str) -> Iterator[str]:
        context = user.split("<sources>", 1)[-1].split("</sources>", 1)[0].strip()
        first = context.splitlines()[0] if context else "No relevant sources were found."
        yield f"Based on the documents: {first} [1]"


class OpenAILLM:
    def __init__(self, model: str, api_key: str | None):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model

    def stream(self, system: str, user: str) -> Iterator[str]:
        resp = self.client.chat.completions.create(
            model=self.model,
            stream=True,
            temperature=0.1,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        )
        for event in resp:
            delta = event.choices[0].delta.content if event.choices else None
            if delta:
                yield delta


class AnthropicLLM:
    def __init__(self, model: str, api_key: str | None):
        from anthropic import Anthropic

        self.client = Anthropic(api_key=api_key)
        self.model = model

    def stream(self, system: str, user: str) -> Iterator[str]:
        with self.client.messages.stream(
            model=self.model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            yield from stream.text_stream


def build_llm(settings: Settings) -> LLM:
    if settings.llm_provider == "echo":
        return EchoLLM()
    if settings.llm_provider == "openai":
        return OpenAILLM(settings.llm_model, settings.openai_api_key)
    if settings.llm_provider == "anthropic":
        return AnthropicLLM(settings.llm_model, settings.anthropic_api_key)
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
