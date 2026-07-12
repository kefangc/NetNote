from __future__ import annotations

import os
import re
import time
import uuid
from collections import Counter
from html import unescape
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen

from .knowledge_base import HybridKnowledgeBase
from .llm_client import get_llm_client
from .schemas import (
    Artifact,
    Citation,
    Flashcard,
    LearningProfile,
    MindMapNode,
    QuizOption,
    QuizQuestion,
    SourceChunk,
    WorkspaceState,
)
from .web_ingest import WebIngestor


COMPUTER_NETWORK_SEED = """
计算机网络课程围绕网络体系结构、物理层、数据链路层、网络层、传输层、应用层和网络安全展开。
OSI 七层模型包括物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。
TCP/IP 模型通常包括网络接口层、网际层、传输层、应用层。
TCP 通过三次握手建立连接，通过四次挥手释放连接，并使用序号、确认号、重传、流量控制和拥塞控制保证可靠传输。
UDP 面向无连接，首部开销小，适合实时音视频、DNS 查询等场景。
IP 提供无连接、尽力而为的数据报投递，路由器根据目的 IP 地址和路由表转发分组。
子网划分通过网络前缀和子网掩码确定网络号、主机号、可用地址范围和广播地址。
DNS 将域名解析为 IP 地址，常见流程包括浏览器缓存、操作系统缓存、本地域名服务器、根域、顶级域和权威域名服务器查询。
HTTP 是应用层协议，HTTPS 在 HTTP 与 TCP 之间加入 TLS 以提供机密性、完整性和身份认证。
"""


STOPWORDS = {
    "的",
    "了",
    "和",
    "是",
    "在",
    "与",
    "及",
    "the",
    "and",
    "for",
    "that",
    "this",
    "from",
    "you",
    "are",
}

KNOWN_TERMS = [
    "计算机网络",
    "网络体系结构",
    "OSI",
    "TCP/IP",
    "物理层",
    "数据链路层",
    "网络层",
    "传输层",
    "应用层",
    "TCP",
    "UDP",
    "IP",
    "DNS",
    "HTTP",
    "HTTPS",
    "三次握手",
    "四次挥手",
    "拥塞控制",
    "流量控制",
    "子网划分",
    "路由表",
    "域名解析",
    "网络安全",
]


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def now_ms() -> int:
    return int(time.time() * 1000)


def tokenize(text: str) -> list[str]:
    lower = text.lower()
    words = re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]", lower)
    merged: list[str] = []
    for word in words:
        if word not in STOPWORDS:
            merged.append(word)
    for phrase in re.findall(r"[\u4e00-\u9fff]{2,}", text):
        for index in range(0, max(len(phrase) - 1, 0)):
            merged.append(phrase[index : index + 2])
    return merged


def extract_keywords(text: str, limit: int = 8) -> list[str]:
    lower = text.lower()
    terms = [term for term in KNOWN_TERMS if term.lower() in lower or term in text]
    counter = Counter(tokenize(text))
    generic = [word for word, count in counter.most_common(limit * 3) if count > 1 and len(word) > 1]
    merged: list[str] = []
    for item in terms + generic:
        if item not in merged:
            merged.append(item)
    return merged[:limit]


def summarize_chunks(chunks: list[SourceChunk], title: str = "来源") -> str:
    if not chunks:
        return f"{title} 暂无可读内容。"
    keywords = Counter()
    for chunk in chunks:
        keywords.update(chunk.keywords)
    top = "、".join(word for word, _ in keywords.most_common(8))
    first = chunks[0].text[:180].replace("\n", " ")
    return f"{title} 主要围绕 {top or '课程知识点'} 展开。代表内容：{first}..."


def generate_source_guide(chunks: list[SourceChunk], title: str = "来源") -> str:
    if not chunks:
        return f"{title} 暂无可读内容。"
    evidence = "\n\n".join(
        f"[{index}] {chunk.location}\n{chunk.text[:900]}"
        for index, chunk in enumerate(chunks[:5], start=1)
    )
    messages = [
        {
            "role": "system",
            "content": (
                "你是 NotebookLM 风格的来源指南生成器。请用中文总结单个来源，"
                "说明它讲了什么、核心问题、关键概念、对学生学习有什么用。"
                "不要写“当前知识库主要围绕”这类机械模板；不要编造来源外内容。"
                "输出 120-220 字，重要术语可用 Markdown 加粗。"
            ),
        },
        {
            "role": "user",
            "content": f"来源标题：{title}\n\n来源片段：\n{evidence}",
        },
    ]
    try:
        text = get_llm_client().chat(messages, temperature=0.2, max_tokens=420)
        if text:
            return text.strip()
    except Exception:
        pass
    return summarize_chunks(chunks, title)


class RetrievalAgent:
    def search(self, state: WorkspaceState, query: str, limit: int = 5) -> list[SourceChunk]:
        return HybridKnowledgeBase().search(state, query, limit=limit)


class TutorAgent:
    def retrieve(self, state: WorkspaceState, question: str) -> tuple[list[SourceChunk], list[Citation]]:
        chunks = RetrievalAgent().search(state, question, limit=4)
        source_map = {source.id: source for source in state.sources}
        citations = [self._citation_for_chunk(chunk, source_map.get(chunk.source_id)) for chunk in chunks]
        return chunks, citations

    def build_messages(self, question: str, chunks: list[SourceChunk]) -> list[dict[str, str]]:
        evidence = "\n\n".join(
            f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[: self._chunk_budget(chunk)]}"
            for index, chunk in enumerate(chunks, start=1)
        )
        evidence_text = evidence or "当前没有检索到直接相关的来源。你仍然可以正常回答用户的一般学习问题；如果使用了通用知识，请明确说明“以下为通用解释”。"
        return [
            {
                "role": "system",
                "content": (
                    "你是计算机网络课程的学习辅导智能体。允许与学生进行任何普通学习对话。"
                    "优先基于给定来源回答；有来源依据时用 [1]、[2] 标注。"
                    "如果来源不足，不要拒答，也不要要求用户先上传资料；可以给出通用解释，"
                    "但要明确说明哪些内容是通用知识。回答使用中文 Markdown。"
                ),
            },
            {
                "role": "user",
                "content": f"问题：{question}\n\n可用来源：\n{evidence_text}",
            },
        ]

    def answer(self, state: WorkspaceState, question: str) -> tuple[str, list[Citation]]:
        chunks, citations = self.retrieve(state, question)
        if not chunks:
            llm_answer = self._answer_with_llm(question, chunks)
            content = llm_answer or f"以下为通用解释：{question} 可以结合课程目标、已有知识基础和具体学习场景继续展开。"
            return content, []
        llm_answer = self._answer_with_llm(question, chunks)
        if llm_answer:
            return llm_answer, citations
        evidence = " ".join(chunk.text for chunk in chunks)
        keywords = extract_keywords(question + " " + evidence, limit=6)
        points = []
        for chunk in chunks[:3]:
            sentence = re.split(r"[。！？.!?]\s*", chunk.text.strip())[0]
            if sentence:
                points.append(sentence[:120])
        body = "\n".join(f"- {point}" for point in points)
        content = (
            f"基于已导入来源，问题可以从 {('、'.join(keywords) or '相关概念')} 入手：\n"
            f"{body}\n\n"
            "结论需要以来源为准；如果要进一步学习，可以继续生成测验或闪卡来检查掌握情况。"
        )
        return content, citations

    def _answer_with_llm(self, question: str, chunks: list[SourceChunk]) -> str | None:
        messages = self.build_messages(question, chunks)
        try:
            return get_llm_client().chat(messages, temperature=0.2, max_tokens=1600)
        except Exception:
            return None

    def _citation_for_chunk(self, chunk: SourceChunk, source) -> Citation:
        metadata = self._clean_lecture_metadata(dict(chunk.metadata or {}))
        if source and source.kind == "lecture":
            base_metadata = self._lecture_metadata_from_source(chunk, source)
            metadata = {**base_metadata, **{key: value for key, value in metadata.items() if value not in (None, "")}}
        return Citation(
            source_id=chunk.source_id,
            source_title=chunk.source_title,
            location=chunk.location,
            snippet=chunk.text[:140].replace("\n", " "),
            metadata={key: value for key, value in metadata.items() if value not in (None, "")},
        )

    def _clean_lecture_metadata(self, metadata: dict) -> dict:
        for key in ("week", "section"):
            if re.search(r"\d{1,2}:\d{2}:\d{2}", str(metadata.get(key) or "")):
                metadata[key] = ""
        return metadata

    def _lecture_metadata_from_source(self, chunk: SourceChunk, source) -> dict:
        source_meta = source.metadata or {}
        start_time, end_time = self._location_times(chunk.location)
        return {
            "kind": "lecture",
            "platform": source_meta.get("platform") or "ynu_course",
            "week": source_meta.get("week") or self._location_part(chunk.location, 0),
            "section": source_meta.get("section") or self._location_part(chunk.location, 1),
            "start_time": start_time,
            "end_time": end_time,
            "start_seconds": self._time_to_seconds(start_time),
            "end_seconds": self._time_to_seconds(end_time),
            "video_url": self._absolute_course_url(source_meta.get("video_url") or self._video_url_from_transcript_meta(source_meta)),
            "source_url": source.url or "",
        }

    def _chunk_budget(self, chunk: SourceChunk) -> int:
        return 650 if (chunk.metadata or {}).get("kind") == "lecture" or re.search(r"\d{1,2}:\d{2}:\d{2}", chunk.location) else 1200

    def _location_part(self, location: str, index: int) -> str:
        parts = [part.strip() for part in location.split("/") if part.strip()]
        value = parts[index] if len(parts) > index else ""
        return "" if re.search(r"\d{1,2}:\d{2}:\d{2}", value) else value

    def _location_times(self, location: str) -> tuple[str, str]:
        matches = re.findall(r"\d{1,2}:\d{2}:\d{2}", location)
        if len(matches) >= 2:
            return matches[0], matches[1]
        if len(matches) == 1:
            return matches[0], ""
        return "", ""

    def _time_to_seconds(self, value: str | None) -> int | None:
        if not value:
            return None
        match = re.search(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})", str(value))
        if not match:
            return None
        return int(match.group(1) or 0) * 3600 + int(match.group(2)) * 60 + int(match.group(3))

    def _video_url_from_transcript_meta(self, source_meta: dict) -> str:
        transcript = source_meta.get("transcript") if isinstance(source_meta.get("transcript"), dict) else {}
        targets = transcript.get("used_targets") or transcript.get("resolved_targets") or []
        if not isinstance(targets, list):
            return ""
        for target in targets:
            if isinstance(target, dict) and target.get("download_address"):
                return str(target.get("download_address"))
        return ""

    def _absolute_course_url(self, url: str | None) -> str:
        value = str(url or "").strip()
        if not value:
            return ""
        if value.startswith("//"):
            return f"https:{value}"
        if value.startswith("http://") or value.startswith("https://"):
            return value
        if value.startswith("/"):
            return f"https://course.ynu.edu.cn{value}"
        return value


class ResourceAgent:
    def generate(self, state: WorkspaceState, kind: str, prompt: str | None = None) -> Artifact:
        chunks = self._source_chunks(state)
        title_map = {
            "summary": "来源概要",
            "flashcards": "计算机网络闪卡",
            "quiz": "计算机网络测验",
            "mindmap": "计算机网络思维导图",
            "qa": "问答卡片",
            "reading": "拓展阅读",
            "presentation": "计算机网络演示文稿",
        }
        llm_data = self._generate_with_llm(kind, state, chunks, prompt)
        if llm_data:
            data = llm_data
        elif kind == "summary":
            data = self._summary(state, chunks)
        elif kind == "flashcards":
            data = {"cards": [card.model_dump() for card in self._flashcards(chunks)]}
        elif kind == "quiz":
            data = {"questions": [question.model_dump() for question in self._quiz(chunks)]}
        elif kind == "mindmap":
            data = {"root": self._mindmap(chunks).model_dump()}
        elif kind == "qa":
            data = {"items": self._qa_cards(chunks)}
        elif kind == "reading":
            data = {"items": self._reading(chunks, prompt)}
        elif kind == "presentation":
            data = self._presentation(state, chunks, prompt)
        else:
            data = {"text": "未知生成类型"}
        return Artifact(id=make_id("artifact"), kind=kind, title=title_map.get(kind, "生成物"), data=data)

    def _generate_with_llm(self, kind: str, state: WorkspaceState, chunks: list[SourceChunk], prompt: str | None) -> dict | None:
        if kind == "summary":
            def source_note(source) -> str:
                fallback = source.chunks[0].text[:220] if source.chunks else "暂无摘要"
                return source.summary or fallback

            source_notes = "\n".join(
                f"- {source.title}：{source_note(source)}"
                for source in state.sources
                if source.status == "ready"
            )
            chunk_notes = "\n\n".join(
                f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[:800]}"
                for index, chunk in enumerate(chunks[:10], start=1)
            )
            evidence = f"来源摘要：\n{source_notes}\n\n代表片段：\n{chunk_notes}"
        else:
            evidence = "\n\n".join(
                f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[:1000]}"
                for index, chunk in enumerate(chunks[:8], start=1)
            )
        schema = {
            "summary": '{"overview":"对所有来源的综合总结...","key_concepts":["..."],"suggested_artifacts":["闪卡","测验","思维导图"],"sources":[{"title":"...","summary":"该来源要点..."}]}',
            "flashcards": '{"cards":[{"front":"...","back":"...","topic":"..."}]}',
            "quiz": '{"questions":[{"stem":"...","options":[{"key":"A","text":"...","explanation":"..."},{"key":"B","text":"...","explanation":"..."},{"key":"C","text":"...","explanation":"..."},{"key":"D","text":"...","explanation":"..."}],"answer":"A","topic":"...","explanation":"..."}]}',
            "mindmap": '{"root":{"label":"计算机网络","detail":"...","children":[{"label":"...","detail":"...","children":[{"label":"...","detail":"...","children":[]}]}]}}',
            "qa": '{"items":[{"question":"...","answer":"...","topic":"..."}]}',
            "reading": '{"items":[{"title":"...","location":"...","reason":"...","snippet":"..."}]}',
            "presentation": '{"title":"TCP 可靠传输机制","subtitle":"面向当前学生画像的结构化讲义","theme":"netnote-blue","slides":[{"id":"slide-1","layout":"cover","title":"TCP 可靠传输机制","subtitle":"确认、重传与滑动窗口","bullets":["学习目标 1","学习目标 2"],"notes":"讲解提示","citations":["来源标题 / 片段"]},{"id":"slide-2","layout":"bullets","title":"核心概念","bullets":["要点一","要点二","要点三"],"notes":"讲解提示","citations":["来源标题 / 片段"]}]}',
        }.get(kind)
        if not schema:
            return None
        messages = [
            {
                "role": "system",
                "content": (
                    "你是高校课程资源生成智能体。只输出合法 JSON，不要 Markdown，不要解释。"
                    "所有内容必须基于来源，可适度重写为适合学生复习的表达。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"课程：计算机网络\n生成类型：{kind}\n用户补充要求：{prompt or '无'}\n"
                    f"JSON 结构示例：{schema}\n\n来源：\n{evidence}"
                ),
            },
        ]
        try:
            raw = get_llm_client().json_chat(messages, temperature=0.25, max_tokens=2600)
        except Exception:
            return None
        if not raw:
            return None
        return self._normalize_llm_data(kind, raw, chunks)

    def _normalize_llm_data(self, kind: str, raw: dict, chunks: list[SourceChunk]) -> dict:
        if kind == "summary":
            source_summaries = [
                {
                    "title": str(item.get("title", "")),
                    "summary": str(item.get("summary", "")),
                }
                for item in raw.get("sources", [])
                if isinstance(item, dict)
            ]
            return {
                "overview": str(raw.get("overview") or summarize_chunks(chunks, "当前知识库")),
                "key_concepts": [str(item) for item in raw.get("key_concepts", [])][:12],
                "suggested_artifacts": [str(item) for item in raw.get("suggested_artifacts", [])][:8],
                "sources": source_summaries,
                "manual": True,
            }
        if kind == "flashcards":
            cards = []
            for index, card in enumerate(raw.get("cards", [])[:10]):
                cards.append(
                    {
                        "id": make_id("card"),
                        "front": str(card.get("front", "")),
                        "back": str(card.get("back", "")),
                        "topic": str(card.get("topic", f"知识点 {index + 1}")),
                        "source_id": chunks[index % len(chunks)].source_id if chunks else None,
                    }
                )
            return {"cards": cards}
        if kind == "quiz":
            questions = []
            for question in raw.get("questions", [])[:10]:
                options = question.get("options", [])
                normalized_options = []
                for key, option in zip(["A", "B", "C", "D"], options[:4]):
                    normalized_options.append(
                        {
                            "key": key,
                            "text": str(option.get("text", "")),
                            "explanation": str(option.get("explanation", "")),
                        }
                    )
                if len(normalized_options) == 4:
                    answer = str(question.get("answer", "A")).strip().upper()[:1]
                    questions.append(
                        {
                            "id": make_id("quiz"),
                            "stem": str(question.get("stem", "")),
                            "options": normalized_options,
                            "answer": answer if answer in {"A", "B", "C", "D"} else "A",
                            "topic": str(question.get("topic", "计算机网络")),
                            "explanation": str(question.get("explanation", "")),
                        }
                    )
            return {"questions": questions}
        if kind == "mindmap":
            root = raw.get("root") or {}
            return {"root": self._normalize_node(root, fallback="计算机网络")}
        if kind == "qa":
            return {
                "items": [
                    {
                        "question": str(item.get("question", "")),
                        "answer": str(item.get("answer", "")),
                        "topic": str(item.get("topic", "计算机网络")),
                    }
                    for item in raw.get("items", [])[:8]
                ]
            }
        if kind == "reading":
            return {
                "items": [
                    {
                        "title": str(item.get("title", "")),
                        "location": str(item.get("location", "")),
                        "reason": str(item.get("reason", "")),
                        "snippet": str(item.get("snippet", "")),
                    }
                    for item in raw.get("items", [])[:8]
                ]
            }
        if kind == "presentation":
            return self._normalize_presentation(raw, chunks)
        return raw

    def _normalize_presentation(self, raw: dict, chunks: list[SourceChunk]) -> dict:
        allowed_layouts = {"cover", "section", "bullets", "two-column", "timeline", "quote", "quiz", "summary"}
        slides = []
        raw_slides = raw.get("slides") if isinstance(raw.get("slides"), list) else []
        for index, slide in enumerate(raw_slides[:12]):
            if not isinstance(slide, dict):
                continue
            layout = str(slide.get("layout") or "bullets")
            if layout not in allowed_layouts:
                layout = "bullets"
            normalized = {
                "id": str(slide.get("id") or f"slide-{index + 1}"),
                "layout": layout,
                "title": str(slide.get("title") or f"第 {index + 1} 页"),
                "subtitle": str(slide.get("subtitle") or ""),
                "bullets": [str(item) for item in slide.get("bullets", []) if item][:6],
                "leftTitle": str(slide.get("leftTitle") or ""),
                "leftItems": [str(item) for item in slide.get("leftItems", []) if item][:5],
                "rightTitle": str(slide.get("rightTitle") or ""),
                "rightItems": [str(item) for item in slide.get("rightItems", []) if item][:5],
                "steps": [str(item) for item in slide.get("steps", []) if item][:6],
                "quote": str(slide.get("quote") or ""),
                "question": str(slide.get("question") or ""),
                "options": [str(item) for item in slide.get("options", []) if item][:4],
                "answer": str(slide.get("answer") or ""),
                "notes": str(slide.get("notes") or ""),
                "citations": [str(item) for item in slide.get("citations", []) if item][:4],
            }
            slides.append(normalized)
        fallback = self._presentation(None, chunks, None)
        if len(slides) < 6:
            slides.extend(fallback["slides"][len(slides):])
        return {
            "title": str(raw.get("title") or fallback["title"]),
            "subtitle": str(raw.get("subtitle") or fallback["subtitle"]),
            "theme": "netnote-blue",
            "slides": slides[:12],
        }

    def _normalize_node(self, node: dict, fallback: str) -> dict:
        label = str(node.get("label") or fallback)
        children = node.get("children") or []
        return {
            "id": make_id("node"),
            "label": label,
            "detail": str(node.get("detail") or ""),
            "children": [self._normalize_node(child, "子主题") for child in children[:8] if isinstance(child, dict)],
        }

    def _source_chunks(self, state: WorkspaceState) -> list[SourceChunk]:
        chunks: list[SourceChunk] = []
        for source in state.sources:
            if source.status != "ready":
                continue
            limit = 3 if source.kind == "lecture" else 12
            chunks.extend(source.chunks[:limit])
        return chunks[:12]

    def _summary(self, state: WorkspaceState, chunks: list[SourceChunk]) -> dict:
        keywords = Counter()
        for chunk in chunks:
            keywords.update(chunk.keywords)
        top = [word for word, _ in keywords.most_common(10)]
        ready_sources = [source for source in state.sources if source.status == "ready"]
        source_summaries = [
            {
                "title": source.title,
                "summary": source.summary or summarize_chunks(source.chunks, source.title),
                "content_length": source.content_length,
                "quality": source.extraction_status,
            }
            for source in ready_sources
        ]
        overview_lines = [
            f"当前知识库共包含 {len(ready_sources)} 个可用来源。",
            summarize_chunks(chunks, "所有来源"),
        ]
        return {
            "overview": "\n\n".join(overview_lines),
            "key_concepts": top or ["OSI 模型", "TCP", "IP", "DNS", "HTTP"],
            "suggested_artifacts": ["闪卡", "测验", "思维导图", "问答卡片", "拓展阅读"],
            "sources": source_summaries,
            "manual": True,
        }

    def _flashcards(self, chunks: list[SourceChunk]) -> list[Flashcard]:
        concepts = self._concepts(chunks)
        return [
            Flashcard(
                id=make_id("card"),
                front=f"{concept} 的核心含义是什么？",
                back=self._explain_concept(concept, chunks),
                topic=concept,
                source_id=chunks[index % len(chunks)].source_id if chunks else None,
            )
            for index, concept in enumerate(concepts[:8])
        ]

    def _quiz(self, chunks: list[SourceChunk]) -> list[QuizQuestion]:
        concepts = self._concepts(chunks)
        questions: list[QuizQuestion] = []
        for index, concept in enumerate(concepts[:8]):
            answer = ["A", "B", "C", "D"][index % 4]
            options = [
                QuizOption(key="A", text=f"{concept} 与来源中的关键机制直接相关", explanation="这是来源中可支撑的描述。"),
                QuizOption(key="B", text=f"{concept} 只存在于物理层且不影响其他层", explanation="过度绝对，网络知识通常存在跨层关联。"),
                QuizOption(key="C", text=f"{concept} 不需要任何协议或过程支持", explanation="该说法忽略了协议、状态或流程。"),
                QuizOption(key="D", text=f"{concept} 与课程资料完全无关", explanation="与已导入来源不一致。"),
            ]
            if answer != "A":
                options[0], options[["A", "B", "C", "D"].index(answer)] = options[["A", "B", "C", "D"].index(answer)], options[0]
                for key, option in zip(["A", "B", "C", "D"], options):
                    option.key = key
            questions.append(
                QuizQuestion(
                    id=make_id("quiz"),
                    stem=f"关于“{concept}”，下列哪项最符合当前来源？",
                    options=options,
                    answer=answer,
                    topic=concept,
                    explanation=self._explain_concept(concept, chunks),
                )
            )
        return questions

    def _mindmap(self, chunks: list[SourceChunk]) -> MindMapNode:
        concepts = self._concepts(chunks)
        layers = [
            ("体系结构", concepts[0:3] or ["OSI 模型", "TCP/IP 模型"]),
            ("核心协议", concepts[3:6] or ["TCP", "UDP", "IP"]),
            ("应用与安全", concepts[6:9] or ["DNS", "HTTP", "HTTPS"]),
        ]
        return MindMapNode(
            id="root",
            label="计算机网络",
            detail="围绕分层体系、协议机制、应用服务与安全能力组织知识。",
            children=[
                MindMapNode(
                    id=make_id("node"),
                    label=label,
                    detail=f"{label} 是当前学习路径中的一个主题分支。",
                    children=[
                        MindMapNode(
                            id=make_id("node"),
                            label=item,
                            detail=self._explain_concept(item, chunks)[:160],
                        )
                        for item in items
                    ],
                )
                for label, items in layers
            ],
        )

    def _qa_cards(self, chunks: list[SourceChunk]) -> list[dict]:
        return [
            {
                "question": f"为什么需要理解 {concept}？",
                "answer": self._explain_concept(concept, chunks),
                "topic": concept,
            }
            for concept in self._concepts(chunks)[:6]
        ]

    def _reading(self, chunks: list[SourceChunk], prompt: str | None) -> list[dict]:
        selected = chunks[:5]
        return [
            {
                "title": chunk.source_title,
                "location": chunk.location,
                "reason": f"适合补充 {prompt or '当前课程'} 中的 {', '.join(chunk.keywords[:3])}。",
                "snippet": chunk.text[:180],
            }
            for chunk in selected
        ]

    def _presentation(self, state: WorkspaceState | None, chunks: list[SourceChunk], prompt: str | None) -> dict:
        concepts = self._concepts(chunks)
        ready_sources = [source for source in state.sources if source.status == "ready"] if state else []
        source_names = [source.title for source in ready_sources[:4]]
        title = prompt.strip()[:36] if prompt and prompt.strip() else "计算机网络核心知识演示文稿"
        topic_a = concepts[0] if concepts else "网络体系结构"
        topic_b = concepts[1] if len(concepts) > 1 else "TCP/IP 协议"
        topic_c = concepts[2] if len(concepts) > 2 else "可靠传输"
        source_hint = "、".join(source_names) if source_names else "当前课程来源与种子知识库"
        citations = [f"{chunk.source_title} / {chunk.location}" for chunk in chunks[:3]]
        return {
            "title": title,
            "subtitle": f"基于 {source_hint} 自动生成",
            "theme": "netnote-blue",
            "slides": [
                {
                    "id": "slide-1",
                    "layout": "cover",
                    "title": title,
                    "subtitle": "个性化学习讲义 · NetNote",
                    "bullets": ["从来源材料提炼重点", "按课堂讲解节奏组织", "配合测验与思维导图复习"],
                    "notes": "封面页用于说明本次讲义主题和学习目标。",
                    "citations": citations[:1],
                },
                {
                    "id": "slide-2",
                    "layout": "section",
                    "title": "本次学习目标",
                    "subtitle": "先建立整体框架，再进入关键机制。",
                    "bullets": [f"理解 {topic_a} 的核心含义", f"区分 {topic_b} 与相关概念", f"能够解释 {topic_c} 的流程和作用"],
                    "notes": "用目标页把学生注意力聚焦到可检查的学习结果。",
                    "citations": citations[:2],
                },
                {
                    "id": "slide-3",
                    "layout": "bullets",
                    "title": "核心概念速览",
                    "bullets": [self._explain_concept(item, chunks)[:96] for item in concepts[:4]] or [
                        "计算机网络通过分层体系组织复杂通信过程。",
                        "协议规定通信双方交换数据时必须遵守的格式与规则。",
                        "可靠传输依赖序号、确认、重传和窗口等机制。",
                    ],
                    "notes": "这一页以短句解释概念，适合配合来源引用讲解。",
                    "citations": citations,
                },
                {
                    "id": "slide-4",
                    "layout": "two-column",
                    "title": "知识点对比",
                    "leftTitle": topic_a,
                    "leftItems": ["解决整体组织问题", "强调层次、接口与职责", "适合先画框架图理解"],
                    "rightTitle": topic_b,
                    "rightItems": ["解决具体通信规则问题", "强调报文、状态和过程", "适合结合例子逐步推演"],
                    "notes": "用左右对比帮助学生区分相近概念。",
                    "citations": citations[:2],
                },
                {
                    "id": "slide-5",
                    "layout": "timeline",
                    "title": "推荐学习步骤",
                    "steps": ["浏览来源概要", "标记不熟悉术语", "生成思维导图", "完成测验", "回看错题与闪卡", "继续追问薄弱点"],
                    "notes": "这一页承接系统内的学习闭环。",
                    "citations": [],
                },
                {
                    "id": "slide-6",
                    "layout": "quiz",
                    "title": "课堂检查问题",
                    "question": f"关于“{topic_c}”，下列哪种说法最符合当前来源？",
                    "options": [f"{topic_c} 需要结合协议状态和反馈机制理解", f"{topic_c} 只属于物理层问题", f"{topic_c} 与传输过程无关", f"{topic_c} 不需要任何上下文"],
                    "answer": "A",
                    "notes": "用一个选择题把讲解转化为即时检测。",
                    "citations": citations[:1],
                },
                {
                    "id": "slide-7",
                    "layout": "summary",
                    "title": "总结与下一步",
                    "bullets": [f"优先复习：{topic_a}", f"重点辨析：{topic_b}", f"继续追问：{topic_c}", "建议生成测验或闪卡巩固"],
                    "notes": "最后给出可行动的下一步建议。",
                    "citations": citations,
                },
            ],
        }

    def _concepts(self, chunks: list[SourceChunk]) -> list[str]:
        counter = Counter()
        for chunk in chunks:
            counter.update(chunk.keywords)
        concepts = [word.upper() if word in {"tcp", "udp", "ip", "dns", "http", "https", "osi"} else word for word, _ in counter.most_common(12)]
        defaults = ["OSI 模型", "TCP 三次握手", "IP 转发", "DNS 解析", "HTTP 与 HTTPS", "子网划分", "拥塞控制", "流量控制"]
        merged = []
        for item in concepts + defaults:
            if item and item not in merged:
                merged.append(item)
        return merged

    def _explain_concept(self, concept: str, chunks: list[SourceChunk]) -> str:
        for chunk in chunks:
            if concept.lower() in chunk.text.lower() or concept in chunk.keywords:
                return chunk.text[:220].replace("\n", " ")
        return f"{concept} 是计算机网络学习中的重要知识点，需要结合协议作用、运行流程、典型场景和易错点理解。"


class ProfileAgent:
    def update_after_chat(self, profile: LearningProfile, message: str) -> LearningProfile:
        keywords = extract_keywords(message, 5)
        for keyword in keywords:
            if keyword not in profile.interests and len(profile.interests) < 8:
                profile.interests.append(keyword)
        profile.next_steps = self.recommend(profile)
        return profile

    def update_after_quiz(self, profile: LearningProfile, correct: int, total: int, missed_topics: list[str]) -> LearningProfile:
        profile.accuracy_rate = round(correct / total, 2) if total else profile.accuracy_rate
        for topic in missed_topics:
            if topic not in profile.weak_points:
                profile.weak_points.insert(0, topic)
        profile.weak_points = profile.weak_points[:6]
        profile.next_steps = self.recommend(profile)
        return profile

    def update_after_flashcard(self, profile: LearningProfile, topic: str, result: str) -> LearningProfile:
        if result == "unknown" and topic not in profile.weak_points:
            profile.weak_points.insert(0, topic)
        if "闪卡" not in profile.preferred_resources:
            profile.preferred_resources.append("闪卡")
        profile.next_steps = self.recommend(profile)
        return profile

    def recommend(self, profile: LearningProfile) -> list[str]:
        weak = "、".join(profile.weak_points[:3]) or "核心概念"
        return [
            f"先复习薄弱点：{weak}。",
            "针对薄弱点生成 6-8 张闪卡，完成一轮会/不会标记。",
            "再做一次 8 题测验，重点查看错题解析。",
            "用思维导图展开相关分支，并点击节点向 AI 追问。",
        ]


class SafetyAgent:
    def validate_answer(self, content: str, citations: list[Citation]) -> str:
        blocked = ["违法", "攻击脚本", "绕过认证"]
        if any(word in content for word in blocked):
            return "该问题可能涉及不安全内容，已停止生成。"
        return content


class WebSearchAgent:
    def search(self, query: str) -> list[dict]:
        real_results = self._search_searxng(query) or self._search_duckduckgo(query) or self._search_bing(query)
        if real_results:
            return real_results
        return self._curated_fallback(query)

    def _search_searxng(self, query: str) -> list[dict]:
        base_url = os.getenv("SEARXNG_BASE_URL", "").strip().rstrip("/")
        if not base_url:
            return []
        url = f"{base_url}/search?q={quote_plus(query)}&format=json&language=zh-CN"
        try:
            req = Request(url, headers={"User-Agent": "SoftwareCupA3/0.1"})
            import json

            data = json.loads(urlopen(req, timeout=3).read().decode("utf-8", errors="ignore"))
            items = data.get("results", [])[:6]
            return [
                self._candidate(item.get("title", ""), item.get("url", ""), item.get("content", ""), "searxng")
                for item in items
                if item.get("url")
            ]
        except Exception:
            return []

    def _search_duckduckgo(self, query: str) -> list[dict]:
        html = ""
        for endpoint in ("https://duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"):
            url = f"{endpoint}?q={quote_plus(query)}"
            try:
                req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
                html = urlopen(req, timeout=3).read().decode("utf-8", errors="ignore")
            except Exception:
                continue
            if "result__a" in html or "result-link" in html:
                break
        matches = re.findall(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>.*?<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            html,
            flags=re.S,
        )
        if not matches:
            matches = re.findall(
                r"<a[^>]+href=\"([^\"]+)\"[^>]+class='result-link'[^>]*>(.*?)</a>.*?<td[^>]+class='result-snippet'[^>]*>(.*?)</td>",
                html,
                flags=re.S,
            )
        results = []
        for href, title_html, snippet_html in matches[:6]:
            title = self._strip_html(title_html)
            snippet = self._strip_html(snippet_html)
            target = self._normalize_duckduckgo_url(unescape(href))
            if target:
                results.append(self._candidate(title, target, snippet, "duckduckgo"))
        return results

    def _search_bing(self, query: str) -> list[dict]:
        url = f"https://www.bing.com/search?q={quote_plus(query)}"
        try:
            req = Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
            html = urlopen(req, timeout=3).read().decode("utf-8", errors="ignore")
        except Exception:
            return []
        blocks = re.findall(r'<li class="b_algo".*?</li>', html, flags=re.S)
        results: list[dict] = []
        for block in blocks[:8]:
            link = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>\s*</h2>', block, flags=re.S)
            if not link:
                link = re.search(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, flags=re.S)
            if not link:
                continue
            snippet_match = re.search(r'<p[^>]*>(.*?)</p>', block, flags=re.S)
            target = unescape(link.group(1))
            if not target.startswith(("http://", "https://")) or "bing.com" in self._domain(target):
                continue
            title = self._strip_html(link.group(2))
            snippet = self._strip_html(snippet_match.group(1) if snippet_match else "")
            results.append(self._candidate(title, target, snippet, "bing"))
        return results[:6]

    def _curated_fallback(self, query: str) -> list[dict]:
        lower = query.lower()
        library = [
            {
                "terms": ["tcp", "拥塞控制", "congestion"],
                "title": "RFC 5681: TCP Congestion Control",
                "url": "https://www.rfc-editor.org/rfc/rfc5681",
                "snippet": "IETF RFC 5681 说明 TCP 慢启动、拥塞避免、快速重传和快速恢复等经典拥塞控制机制。",
            },
            {
                "terms": ["tcp", "拥塞控制", "cubic"],
                "title": "Wikipedia: TCP congestion control",
                "url": "https://en.wikipedia.org/wiki/TCP_congestion_control",
                "snippet": "介绍 TCP 拥塞控制的基本思想、经典算法和 CUBIC、BBR 等实现背景。",
            },
            {
                "terms": ["tcp", "三次握手", "握手"],
                "title": "Cloudflare Learning Center: What is a TCP handshake?",
                "url": "https://www.cloudflare.com/learning/ddos/glossary/tcp-ip/",
                "snippet": "Cloudflare 对 TCP/IP 与 TCP 连接建立过程提供面向学习者的解释。",
            },
            {
                "terms": ["http", "https", "应用层"],
                "title": "MDN: An overview of HTTP",
                "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview",
                "snippet": "MDN 官方文档解释 HTTP 的基本结构、请求响应模型和 Web 通信流程。",
            },
            {
                "terms": ["dns", "域名解析"],
                "title": "Cloudflare Learning Center: What is DNS?",
                "url": "https://www.cloudflare.com/learning/dns/what-is-dns/",
                "snippet": "解释 DNS 的作用、域名解析过程和递归/权威解析等概念。",
            },
            {
                "terms": ["osi", "tcp/ip", "网络体系结构", "计算机网络"],
                "title": "Wikipedia: Internet protocol suite",
                "url": "https://en.wikipedia.org/wiki/Internet_protocol_suite",
                "snippet": "介绍 TCP/IP 协议族、分层结构和与互联网通信相关的核心协议。",
            },
        ]
        selected = []
        for item in library:
            if any(term.lower() in lower or term in query for term in item["terms"]):
                selected.append(item)
        if not selected:
            selected = library[-3:]
        return [
            self._candidate(item["title"], item["url"], item["snippet"], "curated")
            for item in selected[:6]
        ]

    def _candidate(self, title: str, url: str, snippet: str, provider: str = "demo") -> dict:
        content = "\n".join(part for part in [title, snippet, url] if part)
        return {
            "title": title or url,
            "url": url,
            "snippet": snippet or content[:160],
            "content": content or snippet or title,
            "domain": self._domain(url),
            "source_provider": provider,
        }

    def fetch_page_text(self, url: str) -> str:
        return WebIngestor().ingest(url).text

    def _normalize_duckduckgo_url(self, href: str) -> str:
        if href.startswith("//duckduckgo.com/l/?"):
            parsed = urlparse("https:" + href)
            target = parse_qs(parsed.query).get("uddg", [""])[0]
            return unquote(target)
        return href

    def _strip_html(self, value: str) -> str:
        text = re.sub(r"<.*?>", "", value, flags=re.S)
        return unescape(re.sub(r"\s+", " ", text)).strip()

    def _domain(self, url: str) -> str:
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "")

    def _fetch_page_text(self, url: str) -> str:
        return WebIngestor().ingest(url).text
