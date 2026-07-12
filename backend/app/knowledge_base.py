from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

from .schemas import Source, SourceChunk, WorkspaceState


STOPWORDS = {
    "的",
    "了",
    "和",
    "是",
    "在",
    "与",
    "及",
    "吗",
    "呢",
    "the",
    "and",
    "for",
    "that",
    "this",
    "from",
    "you",
    "are",
}


LECTURE_MARKERS = {"老师", "课堂", "课程", "讲到", "提到", "录播", "转写", "上课", "第几周", "第几节"}
WEB_MARKERS = {"网络", "网页", "资料", "拓展", "搜索", "来源", "案例", "官方", "RFC", "文档"}
APPLICATION_MARKERS = {"应用", "用途", "场景", "用在", "用于", "适用", "哪里用", "主要用", "使用场景"}
TIMED_LINE_RE = re.compile(r"^\[(?P<time>\d{1,2}:\d{2}:\d{2})\]\s*(?P<text>.*)$")

PROTOCOL_ALIASES = {
    "csmacd": {
        "compact": {
            "csacd",
            "csmacd",
            "csmaacd",
            "csmcd",
            "csmmed",
            "cmcd",
            "csd",
        },
        "phrases": {
            "csma/cd",
            "csma-cd",
            "csma cd",
            "cs ma acd",
            "cs ma cd",
            "csmacd",
            "csmcd",
            "csacd",
            "载波监听",
            "载波侦听",
            "载播监听",
            "多路访问",
            "冲突检测",
            "碰撞检测",
            "共享信道",
            "随机访问",
            "二进制指数退避",
        },
        "application_phrases": {
            "应用",
            "用在",
            "用于",
            "主要是用",
            "有线局域网",
            "总线",
            "以太网",
            "共享信道",
            "广播",
            "分类",
            "三种类型",
            "多路访问协议",
        },
    }
}


@dataclass
class KnowledgeHit:
    score: float
    chunk: SourceChunk
    source: Source


def tokenize(text: str) -> list[str]:
    lower = text.lower()
    words = re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]", lower)
    tokens = [word for word in words if word not in STOPWORDS]
    compact = compact_protocol_text(text)
    for canonical, alias in PROTOCOL_ALIASES.items():
        if any(item in compact for item in alias["compact"]) or any(phrase.lower() in lower for phrase in alias["phrases"]):
            tokens.append(canonical)
            for phrase in alias["phrases"]:
                tokens.extend(simple_phrase_tokens(phrase))
    for phrase in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        for index in range(0, max(len(phrase) - 1, 0)):
            token = phrase[index : index + 2]
            if token not in STOPWORDS:
                tokens.append(token)
    return tokens


def compact_protocol_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def simple_phrase_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}", text.lower())
    return [token for token in tokens if token not in STOPWORDS]


def source_quality_weight(source: Source) -> float:
    return {
        "complete": 1.0,
        "partial": 0.88,
        "fallback": 0.62,
        "unknown": 0.78,
        "failed": 0.0,
    }.get(source.extraction_status, 0.75)


class HybridKnowledgeBase:
    """JSON-backed hybrid retrieval layer.

    This is the runtime-compatible step before PostgreSQL + pgvector. It keeps
    the agent API stable while adding source metadata weighting, keyword/full
    text recall, lightweight reranking, and context compression.
    """

    def search(self, state: WorkspaceState, query: str, limit: int = 5) -> list[SourceChunk]:
        query_tokens = Counter(tokenize(query))
        if not query_tokens:
            return []

        hits: list[KnowledgeHit] = []
        for source in state.sources:
            if source.status != "ready":
                continue
            quality = source_quality_weight(source)
            if quality <= 0:
                continue
            for chunk in source.chunks:
                score = self._score_chunk(query, query_tokens, source, chunk) * quality
                if score > 0:
                    localized = self.localize_lecture_chunk(chunk, query, query_tokens) if source.kind == "lecture" else chunk
                    compressed = self.compress_chunk(localized, query_tokens)
                    hits.append(KnowledgeHit(score=score, chunk=compressed, source=source))

        hits.sort(key=lambda item: item.score, reverse=True)
        deduped = self._dedupe(hits)
        filtered = self._filter_high_confidence(query, deduped)
        return [hit.chunk for hit in filtered[:limit]]

    def _score_chunk(self, query: str, query_tokens: Counter[str], source: Source, chunk: SourceChunk) -> float:
        chunk_text = f"{chunk.source_title} {chunk.location} {' '.join(chunk.keywords)} {chunk.text}"
        chunk_tokens = Counter(tokenize(chunk_text))
        common = set(query_tokens) & set(chunk_tokens)
        if not common:
            return 0.0

        lexical = sum(query_tokens[token] * chunk_tokens[token] for token in common)
        lexical /= math.sqrt(sum(value * value for value in chunk_tokens.values()) or 1)

        exact_bonus = 0.0
        for keyword in self._query_phrases(query):
            if keyword and keyword in chunk_text:
                exact_bonus += 0.32
        exact_bonus = min(exact_bonus, 1.2)

        metadata_bonus = self._metadata_bonus(query, source, chunk)
        keyword_bonus = min(len(set(chunk.keywords) & set(query_tokens)) * 0.08, 0.32)
        concept_bonus = self._concept_bonus(query, source, chunk_text)
        score = lexical + exact_bonus + metadata_bonus + keyword_bonus + concept_bonus
        if self._query_concepts(query) and concept_bonus <= 0:
            score *= 0.16
        return score

    def _metadata_bonus(self, query: str, source: Source, chunk: SourceChunk) -> float:
        bonus = 0.0
        if source.kind == "lecture" and any(marker in query for marker in LECTURE_MARKERS):
            bonus += 0.42
        if source.kind == "web" and any(marker.lower() in query.lower() for marker in WEB_MARKERS):
            bonus += 0.18
        metadata_text = " ".join(str(value) for value in (chunk.metadata or {}).values() if value)
        if metadata_text and any(token in metadata_text for token in self._query_phrases(query)):
            bonus += 0.2
        return bonus

    def _query_phrases(self, query: str) -> list[str]:
        phrases = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z0-9][a-zA-Z0-9 /.+#-]{1,}", query)
        cleaned = [re.sub(r"\s+", " ", item).strip() for item in phrases]
        return [item for item in cleaned if len(item) >= 2][:12]

    def _query_concepts(self, query: str) -> set[str]:
        lower = query.lower()
        compact = compact_protocol_text(query)
        concepts: set[str] = set()
        for canonical, alias in PROTOCOL_ALIASES.items():
            if any(item in compact for item in alias["compact"]) or any(phrase.lower() in lower for phrase in alias["phrases"]):
                concepts.add(canonical)
        return concepts

    def _concept_bonus(self, query: str, source: Source, chunk_text: str) -> float:
        concepts = self._query_concepts(query)
        if not concepts:
            return 0.0
        lower_chunk = chunk_text.lower()
        compact_chunk = compact_protocol_text(chunk_text)
        lower_query = query.lower()
        wants_application = any(marker in query for marker in APPLICATION_MARKERS) or "where" in lower_query or "application" in lower_query
        bonus = 0.0
        for concept in concepts:
            alias = PROTOCOL_ALIASES[concept]
            compact_hit = any(item in compact_chunk for item in alias["compact"])
            phrase_hit = any(phrase.lower() in lower_chunk for phrase in alias["phrases"])
            if compact_hit or phrase_hit:
                bonus += 4.0
                topic_density = sum(1 for phrase in alias["phrases"] if phrase.lower() in lower_chunk)
                bonus += min(topic_density * 0.18, 1.2)
                if source.kind == "lecture":
                    bonus += 0.45
                if wants_application:
                    app_hits = sum(1 for phrase in alias["application_phrases"] if phrase.lower() in lower_chunk)
                    bonus += min(app_hits * 0.38, 2.4)
                    if "三种类型" in lower_chunk or ("信道划分" in lower_chunk and "随机访问" in lower_chunk):
                        bonus += 2.2
                    if "轮流" in lower_chunk and ("令牌" in lower_chunk or "蓝牙" in lower_chunk or "环形" in lower_chunk):
                        bonus -= 2.2
        return bonus

    def _dedupe(self, hits: list[KnowledgeHit]) -> list[KnowledgeHit]:
        result: list[KnowledgeHit] = []
        seen: set[tuple[str, str]] = set()
        for hit in hits:
            key = (hit.chunk.source_id, hit.chunk.location)
            if key in seen:
                continue
            seen.add(key)
            result.append(hit)
        return result

    def _filter_high_confidence(self, query: str, hits: list[KnowledgeHit]) -> list[KnowledgeHit]:
        if not hits or not self._query_concepts(query):
            return hits
        top = hits[0]
        if top.score < 5:
            return hits
        if any(marker in query for marker in ("什么时候", "哪一段", "哪节", "第几", "时间", "讲到", "提到")):
            return hits[:1]
        top_meta = top.chunk.metadata or {}
        top_content_id = str(top_meta.get("content_id") or "")
        cutoff = top.score - 0.9
        filtered: list[KnowledgeHit] = []
        for hit in hits:
            metadata = hit.chunk.metadata or {}
            same_record = top_content_id and str(metadata.get("content_id") or "") == top_content_id
            if hit.score >= cutoff or (same_record and hit.score >= top.score - 2.6):
                filtered.append(hit)
        return filtered or hits[:1]

    def localize_lecture_chunk(self, chunk: SourceChunk, query: str, query_tokens: Counter[str]) -> SourceChunk:
        lines = self._timed_lines(chunk.text)
        if len(lines) < 2:
            return chunk

        scored: list[tuple[float, int]] = []
        for index, (_, text, raw) in enumerate(lines):
            score = self._score_timestamp_line(query, query_tokens, text)
            if score > 0:
                scored.append((score, index))
        if not scored:
            return chunk

        best_score, best_index = max(scored, key=lambda item: item[0])
        threshold = max(best_score * 0.45, 1.0)
        relevant = [index for score, index in scored if score >= threshold]
        start_index = max(min(relevant + [best_index]) - 1, 0)
        end_index = min(max(relevant + [best_index]) + 1, len(lines) - 1)

        # Keep a compact evidence window so the citation opens close to the
        # exact explanation, while still preserving enough adjacent context.
        while end_index - start_index > 8:
            if best_index - start_index > end_index - best_index:
                start_index += 1
            else:
                end_index -= 1

        selected = lines[start_index : end_index + 1]
        start_time = selected[0][0]
        end_time = self._line_end_time(lines, end_index)
        week, section = self._lecture_location_prefix(chunk.location)
        location_parts = [part for part in (week, section, " - ".join(part for part in (start_time, end_time) if part)) if part]
        metadata = dict(chunk.metadata or {})
        metadata.update(
            {
                "start_time": start_time,
                "end_time": end_time,
                "start_seconds": self._time_to_seconds(start_time),
                "end_seconds": self._time_to_seconds(end_time),
                "localized": True,
                "parent_location": chunk.location,
            }
        )
        return chunk.model_copy(
            update={
                "text": "\n".join(raw for _, _, raw in selected).strip(),
                "location": " / ".join(location_parts) or chunk.location,
                "metadata": metadata,
            }
        )

    def _score_timestamp_line(self, query: str, query_tokens: Counter[str], text: str) -> float:
        line_tokens = Counter(tokenize(text))
        common = set(query_tokens) & set(line_tokens)
        score = sum(query_tokens[token] * line_tokens[token] for token in common)
        lower = text.lower()
        compact = compact_protocol_text(text)
        for concept in self._query_concepts(query):
            alias = PROTOCOL_ALIASES[concept]
            if any(item in compact for item in alias["compact"]) or any(phrase.lower() in lower for phrase in alias["phrases"]):
                score += 5.0
            if any(marker in query for marker in APPLICATION_MARKERS):
                score += sum(1.2 for phrase in alias["application_phrases"] if phrase.lower() in lower)
        return score

    def _timed_lines(self, text: str) -> list[tuple[str, str, str]]:
        result: list[tuple[str, str, str]] = []
        for raw in text.splitlines():
            match = TIMED_LINE_RE.match(raw.strip())
            if not match:
                continue
            line_text = match.group("text").strip()
            if line_text:
                result.append((match.group("time"), line_text, raw.strip()))
        return result

    def _line_end_time(self, lines: list[tuple[str, str, str]], index: int) -> str:
        if index + 1 < len(lines):
            return lines[index + 1][0]
        return lines[index][0]

    def _lecture_location_prefix(self, location: str) -> tuple[str, str]:
        parts = [part.strip() for part in location.split("/") if part.strip()]
        week = parts[0] if len(parts) >= 3 and not re.search(r"\d{1,2}:\d{2}:\d{2}", parts[0]) else ""
        section = parts[1] if len(parts) >= 3 and not re.search(r"\d{1,2}:\d{2}:\d{2}", parts[1]) else ""
        return week, section

    def _time_to_seconds(self, value: str | None) -> int | None:
        if not value:
            return None
        match = re.search(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})", str(value))
        if not match:
            return None
        return int(match.group(1) or 0) * 3600 + int(match.group(2)) * 60 + int(match.group(3))

    def compress_chunk(self, chunk: SourceChunk, query_tokens: Counter[str]) -> SourceChunk:
        budget = 720 if (chunk.metadata or {}).get("kind") == "lecture" else 1050
        if len(chunk.text) <= budget:
            return chunk
        sentences = self._sentences(chunk.text)
        scored: list[tuple[float, int, str]] = []
        for index, sentence in enumerate(sentences):
            sentence_tokens = Counter(tokenize(sentence))
            common = set(query_tokens) & set(sentence_tokens)
            score = sum(query_tokens[token] * sentence_tokens[token] for token in common)
            if score > 0:
                scored.append((score, index, sentence))
        if not scored:
            text = chunk.text[:budget]
        else:
            selected = sorted(scored, key=lambda item: item[0], reverse=True)[:5]
            selected.sort(key=lambda item: item[1])
            text = "\n".join(item[2] for item in selected)
            if len(text) > budget:
                text = text[:budget]
        return chunk.model_copy(update={"text": text.strip()})

    def _sentences(self, text: str) -> list[str]:
        parts = re.split(r"(?<=[。！？!?])\s*|\n+", text)
        return [part.strip() for part in parts if part.strip()]
