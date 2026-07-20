from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SourceStatus = Literal[
    "queued",
    "parsing",
    "ocr",
    "chunking",
    "vectorizing",
    "ready",
    "failed",
]

ExtractionStatus = Literal["complete", "partial", "fallback", "failed", "unknown"]
ExtractionMethod = Literal[
    "jina_reader",
    "trafilatura",
    "html_fallback",
    "search_snippet",
    "ynu_transcript",
    "file",
    "seed",
    "unknown",
]


class Citation(BaseModel):
    source_id: str
    source_title: str
    location: str
    snippet: str
    metadata: dict = Field(default_factory=dict)


class SourceChunk(BaseModel):
    id: str
    source_id: str
    source_title: str
    text: str
    location: str = "全文"
    keywords: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class Source(BaseModel):
    id: str
    title: str
    kind: Literal["file", "web", "seed", "lecture"]
    status: SourceStatus = "queued"
    summary: str = ""
    path: str | None = None
    url: str | None = None
    error: str | None = None
    extraction_status: ExtractionStatus = "unknown"
    extraction_method: ExtractionMethod = "unknown"
    content_length: int = 0
    metadata: dict = Field(default_factory=dict)
    chunks: list[SourceChunk] = Field(default_factory=list)


class Message(BaseModel):
    id: str
    role: Literal["user", "assistant", "summary"]
    content: str
    citations: list[Citation] = Field(default_factory=list)


class Flashcard(BaseModel):
    id: str
    front: str
    back: str
    topic: str
    source_id: str | None = None


class QuizOption(BaseModel):
    key: str
    text: str
    explanation: str


class QuizQuestion(BaseModel):
    id: str
    stem: str
    options: list[QuizOption]
    answer: str
    topic: str
    explanation: str


class MindMapNode(BaseModel):
    id: str
    label: str
    detail: str = ""
    children: list["MindMapNode"] = Field(default_factory=list)


ArtifactKind = Literal["summary", "flashcards", "quiz", "mindmap", "qa", "reading", "report", "presentation"]


class Artifact(BaseModel):
    id: str
    kind: ArtifactKind
    title: str
    status: Literal["generating", "ready", "failed"] = "ready"
    data: dict


class LearningProfile(BaseModel):
    knowledge_base: str = "入门到进阶之间，已开始围绕计算机网络核心概念建立知识框架。"
    learning_goal: str = "系统掌握计算机网络课程并能完成测验、问答与实践复习。"
    weak_points: list[str] = Field(default_factory=lambda: ["TCP 拥塞控制", "子网划分", "DNS 解析流程"])
    preferred_resources: list[str] = Field(default_factory=lambda: ["来源问答", "闪卡", "测验"])
    accuracy_rate: float = 0.0
    learning_pace: str = "适合章节化推进，每次聚焦 2-3 个知识点。"
    error_patterns: list[str] = Field(default_factory=lambda: ["概念相近选项混淆", "协议流程顺序记忆不稳"])
    interests: list[str] = Field(default_factory=lambda: ["HTTP", "TCP/IP", "网络安全"])
    next_steps: list[str] = Field(default_factory=list)


class WorkspaceState(BaseModel):
    workspace_id: str = "computer-network"
    course_title: str = "计算机网络"
    sources: list[Source] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    profile: LearningProfile = Field(default_factory=LearningProfile)
    study_events: list[dict] = Field(default_factory=list)


MindMapNode.model_rebuild()


class ChatRequest(BaseModel):
    message: str


class GenerateArtifactRequest(BaseModel):
    kind: Literal["summary", "flashcards", "quiz", "mindmap", "qa", "reading", "presentation"]
    prompt: str | None = None


class RenameArtifactRequest(BaseModel):
    title: str


class WebSearchRequest(BaseModel):
    query: str


class AddWebSourceRequest(BaseModel):
    title: str
    url: str
    content: str
    domain: str | None = None
    source_provider: str | None = None


class AddWebSourcesRequest(BaseModel):
    items: list[AddWebSourceRequest]


class YnuLoginRequest(BaseModel):
    username: str | None = None
    password: str | None = None
    cookie_header: str | None = None


class YnuCourseListRequest(BaseModel):
    session_id: str
    query: str | None = None
    school_year: str | None = None
    semester: str | None = None
    page: int = 1
    size: int = 12


class YnuImportLectureRequest(BaseModel):
    session_id: str
    course_id: str
    record_id: str
    school_year: str | None = None
    semester: str | None = None
    course_name: str | None = None
    title: str | None = None
    teacher: str | None = None
    week: str | None = None
    section: str | None = None
    url: str | None = None


class QuizSubmitRequest(BaseModel):
    artifact_id: str
    answers: dict[str, str]


class FlashcardReviewRequest(BaseModel):
    artifact_id: str
    card_id: str
    result: Literal["known", "unknown", "skipped"]


class LlmSettingsUpdateRequest(BaseModel):
    base_url: str
    api_key: str | None = None
    model: str


class LlmModelsRequest(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
