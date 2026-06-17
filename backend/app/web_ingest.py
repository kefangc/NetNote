from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from html import unescape
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


@dataclass
class WebExtractionResult:
    text: str
    extraction_status: str
    extraction_method: str
    content_length: int


class WebIngestor:
    def __init__(self) -> None:
        self.max_chars = int(os.getenv("WEB_INGEST_MAX_CHARS", "30000") or "30000")
        self.timeout = int(os.getenv("WEB_INGEST_TIMEOUT_SECONDS", "20") or "20")
        self.jina_base_url = os.getenv("JINA_READER_BASE_URL", "https://r.jina.ai/").strip()

    def ingest(self, url: str, fallback_content: str = "") -> WebExtractionResult:
        candidates: list[tuple[str, str]] = []
        deadline = time.monotonic() + self.timeout
        for method, extractor in (
            ("jina_reader", self._extract_with_jina),
            ("trafilatura", self._extract_with_trafilatura),
            ("html_fallback", self._extract_with_html),
        ):
            if time.monotonic() >= deadline:
                break
            try:
                text = self._normalize(extractor(url, deadline))
            except Exception:
                text = ""
            if text:
                candidates.append((method, text))
                if len(text) >= 800:
                    return self._result(text, method)

        if candidates:
            method, text = max(candidates, key=lambda item: len(item[1]))
            return self._result(text, method)

        fallback = self._normalize(fallback_content)
        if fallback:
            return self._result(fallback, "search_snippet")

        return WebExtractionResult(
            text="",
            extraction_status="failed",
            extraction_method="search_snippet",
            content_length=0,
        )

    def _result(self, text: str, method: str) -> WebExtractionResult:
        sliced = text[: self.max_chars]
        length = len(sliced)
        if length >= 2500:
            status = "complete"
        elif length >= 800:
            status = "partial"
        else:
            status = "fallback"
        return WebExtractionResult(
            text=sliced,
            extraction_status=status,
            extraction_method=method if length >= 800 else "search_snippet" if method == "search_snippet" else method,
            content_length=length,
        )

    def _extract_with_jina(self, url: str, deadline: float) -> str:
        if not self.jina_base_url:
            return ""
        reader_url = f"{self.jina_base_url.rstrip('/')}/{quote(url, safe=':/?&=%#.-_~')}"
        return self._http_get(reader_url, max_bytes=900_000, deadline=deadline)

    def _extract_with_trafilatura(self, url: str, deadline: float) -> str:
        raw = self._http_get(url, max_bytes=1_200_000, deadline=deadline)
        if not raw:
            return ""
        try:
            import trafilatura
        except Exception:
            return ""
        return trafilatura.extract(
            raw,
            output_format="markdown",
            include_comments=False,
            include_tables=True,
            favor_precision=False,
        ) or ""

    def _extract_with_html(self, url: str, deadline: float) -> str:
        raw = self._http_get(url, max_bytes=900_000, deadline=deadline)
        if not raw:
            return ""
        raw = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>", " ", raw)
        raw = re.sub(r"(?is)<nav.*?</nav>|<footer.*?</footer>|<header.*?</header>", " ", raw)
        return self._strip_html(raw)

    def _http_get(self, url: str, max_bytes: int, deadline: float) -> str:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return ""
        timeout = max(1, min(self.timeout, int(deadline - time.monotonic())))
        req = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SoftwareCupA3/0.1)",
                "Accept": "text/markdown,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        return urlopen(req, timeout=timeout).read(max_bytes).decode("utf-8", errors="ignore")

    def _strip_html(self, value: str) -> str:
        text = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
        text = re.sub(r"</(p|div|section|article|li|h[1-6]|tr)>", "\n", text, flags=re.I)
        text = re.sub(r"<.*?>", " ", text, flags=re.S)
        return unescape(text)

    def _normalize(self, text: str) -> str:
        text = unescape(text or "")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
        compact = "\n".join(line for line in lines if line)
        return re.sub(r"\n{3,}", "\n\n", compact).strip()
