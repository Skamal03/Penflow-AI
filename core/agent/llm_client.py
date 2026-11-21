import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


def ask(messages: list[dict]) -> str:
    try:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return "Error: GROQ_API_KEY is not set in the environment or .env file."
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        return f"Error: {e}"

