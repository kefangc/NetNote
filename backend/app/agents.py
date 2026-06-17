from __future__ import annotations

import math
import os
import re
import time
import uuid
from collections import Counter
from html import unescape
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.request import Request, urlopen

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
        lower_query = query.lower()
        has_domain_signal = any(term.lower() in lower_query for term in KNOWN_TERMS)
        if not has_domain_signal:
            source_terms = {
                keyword.lower()
                for source in state.sources
                for chunk in source.chunks
                for keyword in chunk.keywords
                if len(keyword) >= 2
            }
            has_domain_signal = any(term in lower_query for term in source_terms)
        if not has_domain_signal:
            return []
        query_tokens = Counter(tokenize(query))
        if not query_tokens:
            return []
        scored: list[tuple[float, SourceChunk]] = []
        for source in state.sources:
            if source.status != "ready":
                continue
            for chunk in source.chunks:
                chunk_tokens = Counter(tokenize(chunk.text + " " + " ".join(chunk.keywords)))
                common = set(query_tokens) & set(chunk_tokens)
                if not common:
                    continue
                score = sum(query_tokens[t] * chunk_tokens[t] for t in common)
                score /= math.sqrt(sum(v * v for v in chunk_tokens.values()) or 1)
                scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for score, chunk in scored[:limit] if score > 0]


class TutorAgent:
    def retrieve(self, state: WorkspaceState, question: str) -> tuple[list[SourceChunk], list[Citation]]:
        chunks = RetrievalAgent().search(state, question, limit=4)
        citations = [
            Citation(
                source_id=chunk.source_id,
                source_title=chunk.source_title,
                location=chunk.location,
                snippet=chunk.text[:140].replace("\n", " "),
            )
            for chunk in chunks
        ]
        return chunks, citations

    def build_messages(self, question: str, chunks: list[SourceChunk]) -> list[dict[str, str]]:
        evidence = "\n\n".join(
            f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[:1200]}"
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
        }
        llm_data = self._generate_with_llm(kind, chunks, prompt)
        if llm_data:
            data = llm_data
        elif kind == "summary":
            data = self._summary(chunks)
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
        else:
            data = {"text": "未知生成类型"}
        return Artifact(id=make_id("artifact"), kind=kind, title=title_map.get(kind, "生成物"), data=data)

    def _generate_with_llm(self, kind: str, chunks: list[SourceChunk], prompt: str | None) -> dict | None:
        evidence = "\n\n".join(
            f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[:1000]}"
            for index, chunk in enumerate(chunks[:8], start=1)
        )
        schema = {
            "summary": '{"overview":"...","key_concepts":["..."],"suggested_artifacts":["闪卡","测验","思维导图"]}',
            "flashcards": '{"cards":[{"front":"...","back":"...","topic":"..."}]}',
            "quiz": '{"questions":[{"stem":"...","options":[{"key":"A","text":"...","explanation":"..."},{"key":"B","text":"...","explanation":"..."},{"key":"C","text":"...","explanation":"..."},{"key":"D","text":"...","explanation":"..."}],"answer":"A","topic":"...","explanation":"..."}]}',
            "mindmap": '{"root":{"label":"计算机网络","detail":"...","children":[{"label":"...","detail":"...","children":[{"label":"...","detail":"...","children":[]}]}]}}',
            "qa": '{"items":[{"question":"...","answer":"...","topic":"..."}]}',
            "reading": '{"items":[{"title":"...","location":"...","reason":"...","snippet":"..."}]}',
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
            return {
                "overview": str(raw.get("overview") or summarize_chunks(chunks, "当前知识库")),
                "key_concepts": [str(item) for item in raw.get("key_concepts", [])][:12],
                "suggested_artifacts": [str(item) for item in raw.get("suggested_artifacts", [])][:8],
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
        return raw

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
        chunks = [chunk for source in state.sources if source.status == "ready" for chunk in source.chunks]
        return chunks[:12]

    def _summary(self, chunks: list[SourceChunk]) -> dict:
        keywords = Counter()
        for chunk in chunks:
            keywords.update(chunk.keywords)
        top = [word for word, _ in keywords.most_common(10)]
        return {
            "overview": summarize_chunks(chunks, "当前知识库"),
            "key_concepts": top or ["OSI 模型", "TCP", "IP", "DNS", "HTTP"],
            "suggested_artifacts": ["闪卡", "测验", "思维导图", "问答卡片", "拓展阅读"],
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
        real_results = self._search_searxng(query) or self._search_duckduckgo(query)
        if real_results:
            return real_results
        topics = extract_keywords(query, 5) or ["计算机网络", "TCP", "DNS"]
        return [
            {
                "title": f"{topic} 学习补充资料",
                "url": f"https://example.edu.cn/computer-network/{index + 1}",
                "snippet": f"围绕 {topic} 的定义、协议流程、常见题型和易错点整理。",
                "content": (
                    f"{topic} 是计算机网络课程的重要主题。学习时应关注基本概念、协议流程、"
                    "典型应用场景、常见误区以及与其他网络层次的关系。"
                ),
            }
            for index, topic in enumerate(topics[:5])
        ]

    def _search_searxng(self, query: str) -> list[dict]:
        base_url = os.getenv("SEARXNG_BASE_URL", "").strip().rstrip("/")
        if not base_url:
            return []
        url = f"{base_url}/search?q={quote_plus(query)}&format=json&language=zh-CN"
        try:
            req = Request(url, headers={"User-Agent": "SoftwareCupA3/0.1"})
            import json

            data = json.loads(urlopen(req, timeout=12).read().decode("utf-8", errors="ignore"))
            items = data.get("results", [])[:6]
            return [self._candidate(item.get("title", ""), item.get("url", ""), item.get("content", "")) for item in items if item.get("url")]
        except Exception:
            return []

    def _search_duckduckgo(self, query: str) -> list[dict]:
        html = ""
        for endpoint in ("https://duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"):
            url = f"{endpoint}?q={quote_plus(query)}"
            try:
                req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
                html = urlopen(req, timeout=12).read().decode("utf-8", errors="ignore")
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
                results.append(self._candidate(title, target, snippet))
        return results

    def _candidate(self, title: str, url: str, snippet: str) -> dict:
        content = "\n".join(part for part in [title, snippet, url] if part)
        return {
            "title": title or url,
            "url": url,
            "snippet": snippet or content[:160],
            "content": content or snippet or title,
        }

    def fetch_page_text(self, url: str) -> str:
        return self._fetch_page_text(url)

    def _normalize_duckduckgo_url(self, href: str) -> str:
        if href.startswith("//duckduckgo.com/l/?"):
            parsed = urlparse("https:" + href)
            target = parse_qs(parsed.query).get("uddg", [""])[0]
            return unquote(target)
        return href

    def _strip_html(self, value: str) -> str:
        text = re.sub(r"<.*?>", "", value, flags=re.S)
        return unescape(re.sub(r"\s+", " ", text)).strip()

    def _fetch_page_text(self, url: str) -> str:
        try:
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urlopen(req, timeout=8).read(400_000).decode("utf-8", errors="ignore")
            raw = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>", " ", raw)
            text = self._strip_html(raw)
            return text[:5000]
        except Exception:
            return ""
