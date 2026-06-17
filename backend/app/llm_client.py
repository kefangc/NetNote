from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class OpenAICompatibleClient:
    def __init__(self) -> None:
        load_env_file()
        base_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "").strip()
        if base_url and not base_url.startswith(("http://", "https://")):
            base_url = f"https://{base_url}"
        self.base_url = base_url.rstrip("/")
        self.api_key = os.getenv("OPENAI_COMPATIBLE_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_COMPATIBLE_CHAT_MODEL", "gpt-5.5").strip()

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def chat(self, messages: list[dict[str, str]], temperature: float = 0.2, max_tokens: int = 1800) -> str | None:
        if not self.configured:
            return None
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc
        data = json.loads(raw)
        return data["choices"][0]["message"]["content"]

    def stream_chat(self, messages: list[dict[str, str]], temperature: float = 0.2, max_tokens: int = 1800):
        if not self.configured:
            return
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="ignore").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        payload = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    delta = payload.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise RuntimeError(f"LLM stream failed: {exc}") from exc

    def json_chat(self, messages: list[dict[str, str]], temperature: float = 0.2, max_tokens: int = 2400) -> dict[str, Any] | None:
        text = self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        if not text:
            return None
        fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
        candidate = fenced.group(1).strip() if fenced else text.strip()
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end >= start:
            candidate = candidate[start : end + 1]
        return json.loads(candidate)


def get_llm_client() -> OpenAICompatibleClient:
    return OpenAICompatibleClient()
