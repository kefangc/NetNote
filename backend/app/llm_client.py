from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONFIG_PATH = ROOT / "data" / "llm_config.json"


def load_env_file(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_base_url(value: str) -> str:
    base_url = value.strip()
    if base_url and not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    return base_url.rstrip("/")


def load_runtime_config() -> dict[str, str]:
    if not RUNTIME_CONFIG_PATH.exists():
        return {}
    try:
        data = json.loads(RUNTIME_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {key: str(value).strip() for key, value in data.items() if isinstance(value, str)}


def save_runtime_config(*, base_url: str, api_key: str, model: str) -> None:
    RUNTIME_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"base_url": normalize_base_url(base_url), "api_key": api_key.strip(), "model": model.strip()}
    temporary_path = RUNTIME_CONFIG_PATH.with_suffix(".tmp")
    temporary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary_path.replace(RUNTIME_CONFIG_PATH)


class OpenAICompatibleClient:
    def __init__(self) -> None:
        load_env_file()
        runtime_config = load_runtime_config()
        self.base_url = normalize_base_url(runtime_config.get("base_url") or os.getenv("OPENAI_COMPATIBLE_BASE_URL", ""))
        self.api_key = runtime_config.get("api_key") or os.getenv("OPENAI_COMPATIBLE_API_KEY", "").strip()
        self.model = runtime_config.get("model") or os.getenv("OPENAI_COMPATIBLE_CHAT_MODEL", "gpt-5.5").strip()

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


def fetch_models(base_url: str, api_key: str) -> list[str]:
    normalized_base_url = normalize_base_url(base_url)
    if not normalized_base_url:
        raise RuntimeError("请先填写 Base URL。")
    request = urllib.request.Request(
        f"{normalized_base_url}/models",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"模型列表请求失败（HTTP {exc.code}）。") from exc
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"模型列表请求失败：{exc}") from exc
    data = payload.get("data", []) if isinstance(payload, dict) else []
    model_ids = [str(item.get("id", "")).strip() for item in data if isinstance(item, dict)]
    return sorted({model_id for model_id in model_ids if model_id}, key=str.lower)
