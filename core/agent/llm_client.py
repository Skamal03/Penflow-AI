import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

MODEL = os.getenv("PENFLOW_LLM_MODEL", "openai/gpt-oss-120b")


class LLMError(Exception):
    """The LLM call failed. Never treat this as a real answer."""


def ask(messages: list[dict]) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise LLMError("GROQ_API_KEY is not set in the environment or .env file.")
    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(model=MODEL, messages=messages)
        return response.choices[0].message.content or ""
    except Exception as e:
        raise LLMError(str(e))
