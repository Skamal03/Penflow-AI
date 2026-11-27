import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

MODEL = os.getenv("PENFLOW_LLM_MODEL", "openai/gpt-oss-120b")


class LLMError(Exception):
    """The LLM call failed. Never treat this as a real answer."""


def ask(messages: list[dict], max_tokens: int | None = None,
        temperature: float | None = None, reasoning_effort: str | None = None) -> str:
    """Send a chat completion. Extra knobs are optional so old callers are unchanged."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LLMError("GROQ_API_KEY is not set in the environment or .env file.")

    kwargs: dict = {}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if temperature is not None:
        kwargs["temperature"] = temperature

    try:
        client = Groq(api_key=api_key)
        if reasoning_effort:
            try:
                response = client.chat.completions.create(
                    model=MODEL, messages=messages, reasoning_effort=reasoning_effort, **kwargs)
                return response.choices[0].message.content or ""
            except Exception as e:
                # Older/other models may reject reasoning_effort: retry plain, then report.
                if "reasoning" not in str(e).lower():
                    raise
        response = client.chat.completions.create(model=MODEL, messages=messages, **kwargs)
        return response.choices[0].message.content or ""
    except LLMError:
        raise
    except Exception as e:
        raise LLMError(str(e))
