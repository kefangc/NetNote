from __future__ import annotations

import re
from dataclasses import dataclass

from .llm_client import get_llm_client
from .schemas import LearningProfile, Message, SourceChunk, WorkspaceState


MAX_CONTEXT_TOKENS = 12000
SUMMARY_TOKEN_THRESHOLD = 0.7
SUMMARY_MESSAGE_THRESHOLD = 6
RECENT_HISTORY_CHAR_BUDGET = 5200
SUMMARY_MAX_CHARS = 1800


@dataclass
class RuntimeContext:
    retrieval_query: str
    messages: list[dict[str, str]]


def estimate_token_count(text: str) -> int:
    chinese = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    other = max(len(text) - chinese, 0)
    return int(chinese * 1.5 + other * 0.25)


def clean_memory_text(text: str) -> str:
    cleaned = text or ""
    cleaned = re.sub(r"<think(?:ing)?>.*?(?:</think(?:ing)?>|\Z)", " ", cleaned, flags=re.S | re.I)
    cleaned = re.sub(r"<search>.*?(?:</search>|\Z)", " ", cleaned, flags=re.S | re.I)
    cleaned = re.sub(r"\n+\*\*引用\*\*\n(?:- .+\n?)+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def latest_summary(messages: list[Message]) -> Message | None:
    return next((message for message in reversed(messages) if message.role == "summary"), None)


def messages_after_latest_summary(messages: list[Message]) -> list[Message]:
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].role == "summary":
            return messages[index + 1 :]
    return messages


def select_recent_messages(messages: list[Message], max_chars: int = RECENT_HISTORY_CHAR_BUDGET) -> list[Message]:
    selected: list[Message] = []
    total = 0
    for message in reversed(messages_after_latest_summary(messages)):
        if message.role not in {"user", "assistant"}:
            continue
        content = clean_memory_text(message.content)
        if not content:
            continue
        size = len(content)
        if selected and total + size > max_chars:
            break
        selected.append(Message(id=message.id, role=message.role, content=content, citations=message.citations))
        total += size
    return list(reversed(selected))


def profile_context(profile: LearningProfile) -> str:
    return "\n".join(
        [
            f"知识基础：{profile.knowledge_base}",
            f"学习目标：{profile.learning_goal}",
            f"薄弱点：{'、'.join(profile.weak_points[:6]) or '暂无'}",
            f"兴趣方向：{'、'.join(profile.interests[:6]) or '暂无'}",
            f"学习偏好：{'、'.join(profile.preferred_resources[:5]) or '暂无'}",
            f"下一步建议：{'；'.join(profile.next_steps[:4]) or '暂无'}",
        ]
    )


def evidence_context(chunks: list[SourceChunk]) -> str:
    if not chunks:
        return "当前没有检索到直接相关的来源。可以回答一般学习问题，但必须标明“以下为通用解释”。"
    return "\n\n".join(
        f"[{index}] {chunk.source_title} / {chunk.location}\n{chunk.text[:1200]}"
        for index, chunk in enumerate(chunks, start=1)
    )


def rewrite_query(question: str, state: WorkspaceState) -> str:
    summary = latest_summary(state.messages)
    recent = select_recent_messages(state.messages, max_chars=1800)
    recent_text = "\n".join(f"{item.role}: {item.content}" for item in recent[-6:])
    summary_text = clean_memory_text(summary.content) if summary else ""

    llm = get_llm_client()
    if llm.configured:
        messages = [
            {
                "role": "system",
                "content": (
                    "你负责把学生的追问改写成可独立检索课程来源的问题。"
                    "只输出改写后的一个问题，不要解释。保留计算机网络术语。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"对话摘要：\n{summary_text or '无'}\n\n"
                    f"最近对话：\n{recent_text or '无'}\n\n"
                    f"当前问题：{question}"
                ),
            },
        ]
        try:
            rewritten = llm.chat(messages, temperature=0.0, max_tokens=180)
            if rewritten and len(rewritten.strip()) >= 4:
                return rewritten.strip().strip("。")
        except Exception:
            pass

    if recent:
        last_user = next((item.content for item in reversed(recent) if item.role == "user"), "")
        if last_user and _looks_contextual_question(question):
            return f"{last_user}；追问：{question}"
    return question


def build_runtime_context(state: WorkspaceState, question: str, chunks: list[SourceChunk], retrieval_query: str) -> RuntimeContext:
    summary = latest_summary(state.messages)
    recent = select_recent_messages(state.messages)
    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                "你是计算机网络课程的学习辅导智能体。你有三类上下文：对话摘要、最近对话、来源证据。"
                "对话摘要和最近对话只用于理解指代、学习状态和追问链；事实性解释优先依据来源证据。"
                "有来源依据时使用 [1]、[2] 标注；来源不足时不要拒答，给出通用解释并明确标明。"
                "回答使用中文 Markdown，面向学生讲清概念、过程、易错点和下一步学习建议。"
            ),
        }
    ]
    context_parts = [
        f"学习画像：\n{profile_context(state.profile)}",
        f"检索问题：{retrieval_query}",
        f"来源证据：\n{evidence_context(chunks)}",
    ]
    if summary:
        context_parts.insert(0, f"对话摘要：\n{clean_memory_text(summary.content)}")
    messages.append({"role": "system", "content": "\n\n".join(context_parts)})
    for item in recent:
        role = "assistant" if item.role == "assistant" else "user"
        messages.append({"role": role, "content": item.content})
    messages.append({"role": "user", "content": question})
    return RuntimeContext(retrieval_query=retrieval_query, messages=messages)


def should_generate_summary(messages: list[Message]) -> bool:
    recent = messages_after_latest_summary(messages)
    user_count = sum(1 for item in recent if item.role == "user")
    if user_count >= SUMMARY_MESSAGE_THRESHOLD:
        return True
    text = "\n".join(clean_memory_text(item.content) for item in recent if item.role in {"user", "assistant"})
    return estimate_token_count(text) >= int(MAX_CONTEXT_TOKENS * SUMMARY_TOKEN_THRESHOLD)


def generate_conversation_summary(messages: list[Message]) -> str | None:
    previous = latest_summary(messages)
    recent = [item for item in messages_after_latest_summary(messages) if item.role in {"user", "assistant"}]
    if not recent:
        return None
    previous_text = clean_memory_text(previous.content) if previous else ""
    recent_text = "\n".join(f"{item.role}: {clean_memory_text(item.content)}" for item in recent)
    llm = get_llm_client()
    if llm.configured:
        prompt = [
            {
                "role": "system",
                "content": (
                    "你是课程学习对话摘要器。请基于上一份摘要和最近对话，生成一份新的自包含摘要。"
                    "摘要将作为后续对话的唯一长期上下文，必须保留最新学习主题、追问链、已解释概念、"
                    "仍薄弱点、用户偏好和下一轮回答注意事项。不要编造事实。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"上一份摘要：\n{previous_text or '无'}\n\n"
                    f"最近对话：\n{recent_text}\n\n"
                    "请严格按以下结构输出：\n"
                    "【当前学习主题】\n"
                    "【用户最近问题与追问链】\n"
                    "【已解释清楚的概念】\n"
                    "【仍然薄弱或待复习点】\n"
                    "【用户偏好与学习目标】\n"
                    "【下一轮回答必须注意的上下文】"
                ),
            },
        ]
        try:
            summary = llm.chat(prompt, temperature=0.1, max_tokens=900)
            if summary:
                return summary.strip()[:SUMMARY_MAX_CHARS]
        except Exception:
            pass
    return fallback_summary(previous_text, recent)


def fallback_summary(previous_summary: str, recent: list[Message]) -> str:
    user_questions = [clean_memory_text(item.content) for item in recent if item.role == "user"]
    assistant_notes = [clean_memory_text(item.content) for item in recent if item.role == "assistant"]
    latest_question = user_questions[-1] if user_questions else "暂无"
    earlier = "；".join(user_questions[-5:])
    latest_answer = assistant_notes[-1][:420] if assistant_notes else "暂无"
    inherited = f"\n\n继承摘要：{previous_summary[:600]}" if previous_summary else ""
    return (
        "【当前学习主题】\n"
        f"围绕计算机网络课程中的问题推进，最新问题是：{latest_question}\n\n"
        "【用户最近问题与追问链】\n"
        f"{earlier or '暂无'}\n\n"
        "【已解释清楚的概念】\n"
        f"{latest_answer}\n\n"
        "【仍然薄弱或待复习点】\n"
        "需要继续根据测验、闪卡和追问识别薄弱点。\n\n"
        "【用户偏好与学习目标】\n"
        "用户希望基于来源进行连续追问，并获得适合复习的解释。\n\n"
        "【下一轮回答必须注意的上下文】\n"
        "后续回答应延续最近问题链，同时事实性内容优先使用来源证据。"
        f"{inherited}"
    )[:SUMMARY_MAX_CHARS]


def _looks_contextual_question(question: str) -> bool:
    markers = ["它", "这个", "那个", "上述", "前面", "刚才", "区别", "为什么", "怎么", "继续", "展开"]
    compact = question.strip()
    return len(compact) <= 80 and any(marker in compact for marker in markers)
