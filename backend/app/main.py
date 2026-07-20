from __future__ import annotations

import logging
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .agents import (
    COMPUTER_NETWORK_SEED,
    ProfileAgent,
    ResourceAgent,
    SafetyAgent,
    TutorAgent,
    WebSearchAgent,
    generate_source_guide,
    make_id,
)
from .llm_client import fetch_models, get_llm_client, normalize_base_url, save_runtime_config
from .memory import (
    build_runtime_context,
    generate_conversation_summary,
    rewrite_query,
    should_generate_summary,
)
from .parsers import chunk_text, parse_file
from .schemas import (
    AddWebSourceRequest,
    AddWebSourcesRequest,
    ChatRequest,
    FlashcardReviewRequest,
    GenerateArtifactRequest,
    LlmModelsRequest,
    LlmSettingsUpdateRequest,
    Message,
    QuizSubmitRequest,
    RenameArtifactRequest,
    Source,
    WorkspaceState,
    YnuCourseListRequest,
    YnuImportLectureRequest,
    YnuLoginRequest,
)
from .store import JsonStore
from .web_ingest import WebIngestor
from .ynu_ingest import YNU_AUTH_URL, YnuAuthError, YnuClient, build_source_from_lecture, new_session_id


ROOT = Path(__file__).resolve().parents[1]
UPLOAD_DIR = ROOT / "uploads"
DATA_PATH = ROOT / "data" / "workspace.json"
LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("software_cup_backend")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.FileHandler(LOG_DIR / "app.log", encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)

app = FastAPI(title="Software Cup A3 Learning Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_PREVIEW_CHUNKS = 3
WORKSPACE_PREVIEW_CHARS = 480

store = JsonStore(DATA_PATH)
ynu_sessions: dict[str, YnuClient] = {}


def source_keywords(source: Source, limit: int = 8) -> list[str]:
    seen: set[str] = set()
    keywords: list[str] = []
    for chunk in source.chunks:
        for keyword in chunk.keywords:
            normalized = keyword.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                keywords.append(normalized)
                if len(keywords) >= limit:
                    return keywords
    return keywords


def compact_source(source: Source) -> dict:
    return {
        "id": source.id,
        "title": source.title,
        "kind": source.kind,
        "status": source.status,
        "summary": source.summary,
        "url": source.url,
        "error": source.error,
        "extraction_status": source.extraction_status,
        "extraction_method": source.extraction_method,
        "content_length": source.content_length,
        "chunk_count": len(source.chunks),
        "keywords": source_keywords(source),
    }


def workspace_response(state: WorkspaceState) -> dict:
    """Return only UI metadata; original chunks remain in the server-side knowledge base."""
    return {
        "workspace_id": state.workspace_id,
        "course_title": state.course_title,
        "sources": [compact_source(source) for source in state.sources],
        "messages": [message.model_dump() for message in state.messages],
        "artifacts": [artifact.model_dump() for artifact in state.artifacts],
        "profile": state.profile.model_dump(),
    }


def refresh_stale_source_guides(state: WorkspaceState) -> WorkspaceState:
    changed = False
    for source in state.sources:
        if source.status != "ready" or not source.chunks:
            continue
        if not source.content_length:
            source.content_length = sum(len(chunk.text) for chunk in source.chunks)
            changed = True
        if source.kind == "file" and source.extraction_method == "unknown":
            source.extraction_method = "file"
            source.extraction_status = "complete" if source.content_length >= 800 else "partial"
            changed = True
        if source.kind == "seed" and source.extraction_method == "unknown":
            source.extraction_method = "seed"
            source.extraction_status = "complete"
            changed = True
        if source.kind == "lecture" and source.extraction_method == "unknown":
            source.extraction_method = "ynu_transcript"
            source.extraction_status = "complete" if source.content_length >= 800 else "partial"
            changed = True
        if source.kind == "lecture":
            if not source.metadata.get("video_url"):
                video_url = first_lecture_video_url(source.metadata)
                if video_url:
                    source.metadata["video_url"] = video_url
                    changed = True
            for chunk in source.chunks:
                if (chunk.metadata or {}).get("kind") == "lecture":
                    for key in ("week", "section"):
                        if lecture_timeish(str(chunk.metadata.get(key) or "")):
                            chunk.metadata[key] = ""
                            changed = True
                    if source.metadata.get("video_url") and not chunk.metadata.get("video_url"):
                        chunk.metadata["video_url"] = source.metadata.get("video_url")
                        changed = True
                    continue
                start_time, end_time = lecture_location_times(chunk.location)
                chunk.metadata = {
                    "kind": "lecture",
                    "platform": source.metadata.get("platform") or "ynu_course",
                    "week": source.metadata.get("week") or "",
                    "section": source.metadata.get("section") or "",
                    "start_time": start_time,
                    "end_time": end_time,
                    "start_seconds": lecture_time_to_seconds(start_time),
                    "end_seconds": lecture_time_to_seconds(end_time),
                    "video_url": source.metadata.get("video_url") or "",
                    "source_url": source.url or "",
                }
                changed = True
        if not source.summary or "主要围绕" in source.summary or "代表内容" in source.summary:
            source.summary = generate_source_guide(source.chunks, source.title)
            changed = True
    return store.save(state) if changed else state


def first_lecture_video_url(metadata: dict) -> str:
    transcript = metadata.get("transcript") if isinstance(metadata.get("transcript"), dict) else {}
    targets = transcript.get("used_targets") or transcript.get("resolved_targets") or []
    if not isinstance(targets, list):
        return ""
    for target in targets:
        if not isinstance(target, dict):
            continue
        url = str(target.get("download_address") or "").strip()
        if url:
            if url.startswith("//"):
                return f"https:{url}"
            if url.startswith("http://") or url.startswith("https://"):
                return url
            if url.startswith("/"):
                return f"https://course.ynu.edu.cn{url}"
            return url
    return ""


def lecture_location_times(location: str) -> tuple[str, str]:
    import re

    matches = re.findall(r"\d{1,2}:\d{2}:\d{2}", location)
    if len(matches) >= 2:
        return matches[0], matches[1]
    if len(matches) == 1:
        return matches[0], ""
    return "", ""


def lecture_timeish(value: str) -> bool:
    import re

    return bool(re.search(r"\d{1,2}:\d{2}:\d{2}", value))


def lecture_time_to_seconds(value: str | None) -> int | None:
    import re

    if not value:
        return None
    match = re.search(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{2})", str(value))
    if not match:
        return None
    return int(match.group(1) or 0) * 3600 + int(match.group(2)) * 60 + int(match.group(3))


def ensure_seed() -> WorkspaceState:
    state = store.load()
    if state.sources:
        return state
    source_id = make_id("source")
    chunks = chunk_text(COMPUTER_NETWORK_SEED, source_id, "计算机网络种子知识库")
    seed = Source(
        id=source_id,
        title="计算机网络种子知识库",
        kind="seed",
        status="ready",
        summary=generate_source_guide(chunks, "计算机网络种子知识库"),
        extraction_status="complete",
        extraction_method="seed",
        content_length=len(COMPUTER_NETWORK_SEED.strip()),
        chunks=chunks,
    )
    state.sources.append(seed)
    state.profile.next_steps = ProfileAgent().recommend(state.profile)
    return store.save(state)


@app.on_event("startup")
def startup() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ensure_seed()


@app.get("/health")
def health():
    llm = get_llm_client()
    return {"ok": True, "ai_configured": llm.configured, "model": llm.model if llm.configured else None}


@app.get("/settings/llm")
def get_llm_settings():
    llm = get_llm_client()
    return {
        "base_url": llm.base_url,
        "model": llm.model,
        "api_key_set": bool(llm.api_key),
        "configured": llm.configured,
    }


@app.put("/settings/llm")
def update_llm_settings(request: LlmSettingsUpdateRequest):
    current = get_llm_client()
    base_url = normalize_base_url(request.base_url)
    model = request.model.strip()
    api_key = request.api_key.strip() if request.api_key else current.api_key
    if not base_url:
        raise HTTPException(status_code=422, detail="Base URL 不能为空。")
    if not model:
        raise HTTPException(status_code=422, detail="模型不能为空。")
    save_runtime_config(base_url=base_url, api_key=api_key, model=model)
    return get_llm_settings()


@app.post("/settings/llm/models")
def list_llm_models(request: LlmModelsRequest):
    current = get_llm_client()
    base_url = normalize_base_url(request.base_url or current.base_url)
    api_key = request.api_key.strip() if request.api_key else current.api_key
    try:
        items = fetch_models(base_url, api_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"items": items}


@app.get("/workspace")
def get_workspace():
    return workspace_response(refresh_stale_source_guides(ensure_seed()))


@app.get("/sources/{source_id}/preview")
def get_source_preview(source_id: str):
    state = ensure_seed()
    source = next((item for item in state.sources if item.id == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    items = []
    for chunk in source.chunks[:WORKSPACE_PREVIEW_CHUNKS]:
        text = chunk.text.strip()
        if len(text) > WORKSPACE_PREVIEW_CHARS:
            text = f"{text[:WORKSPACE_PREVIEW_CHARS].rstrip()}…"
        items.append(
            {
                "id": chunk.id,
                "location": chunk.location,
                "keywords": chunk.keywords[:4],
                "text": text,
            }
        )
    return {"source_id": source.id, "chunk_count": len(source.chunks), "keywords": source_keywords(source), "items": items}


@app.post("/sources/upload")
async def upload_source(file: UploadFile = File(...)):
    state = ensure_seed()
    source_id = make_id("source")
    target = UPLOAD_DIR / f"{source_id}_{file.filename}"
    with target.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)

    source = Source(id=source_id, title=file.filename, kind="file", status="parsing", path=str(target))
    state.sources.insert(0, source)
    store.save(state)

    try:
        text = parse_file(target, file.filename)
        source.status = "chunking"
        source.chunks = chunk_text(text, source.id, source.title)
        source.status = "vectorizing"
        source.summary = generate_source_guide(source.chunks, source.title)
        source.extraction_status = "complete" if len(text) >= 800 else "partial"
        source.extraction_method = "file"
        source.content_length = len(text)
        source.status = "ready"
    except Exception as exc:
        source.status = "failed"
        source.error = str(exc)
    return workspace_response(store.save(state))


@app.post("/sources/search-web")
def search_web(request: ChatRequest):
    return {"items": WebSearchAgent().search(request.message)}


@app.post("/sources/add-web")
def add_web_source(request: AddWebSourceRequest):
    state = ensure_seed()
    source = build_web_source(request)
    state.sources.insert(0, source)
    return workspace_response(store.save(state))


@app.post("/sources/add-web-batch")
def add_web_sources(request: AddWebSourcesRequest):
    if not request.items:
        return workspace_response(ensure_seed())
    items = request.items[:8]
    max_workers = min(3, len(items))
    sources: list[Source] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(build_web_source, item) for item in items]
        for future in as_completed(futures):
            sources.append(future.result())
    state = ensure_seed()
    existing_urls = {source.url for source in state.sources if source.url}
    for source in reversed(sources):
        if source.url and source.url in existing_urls:
            continue
        state.sources.insert(0, source)
        if source.url:
            existing_urls.add(source.url)
    return workspace_response(store.save(state))


@app.delete("/sources/{source_id}")
def delete_source(source_id: str):
    state = ensure_seed()
    source = next((item for item in state.sources if item.id == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    state.sources = [item for item in state.sources if item.id != source_id]
    if source.path:
        try:
            source_path = Path(source.path).resolve()
            upload_root = UPLOAD_DIR.resolve()
            if source_path.is_file() and upload_root in source_path.parents:
                source_path.unlink()
        except OSError:
            pass
    state.study_events.append({"type": "source_delete", "source_id": source_id, "title": source.title})
    return workspace_response(store.save(state))


@app.post("/sources/ynu/login")
def login_ynu(request: YnuLoginRequest):
    if request.cookie_header and request.cookie_header.strip():
        client = YnuClient(cookie_header=request.cookie_header)
        session_id = new_session_id()
        ynu_sessions[session_id] = client
        logger.info("YNU cookie login succeeded session_id=%s", session_id)
        return {"session_id": session_id, "auth_url": YNU_AUTH_URL, "message": "已使用 Cookie 连接云大学堂"}
    if not request.username or not request.password:
        raise HTTPException(status_code=400, detail="请输入统一认证用户名和密码，或提供 course.ynu.edu.cn Cookie。")
    client = YnuClient()
    try:
        client.login(request.username, request.password)
    except YnuAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"云大学堂登录失败：{exc}") from exc
    session_id = new_session_id()
    ynu_sessions[session_id] = client
    logger.info("YNU password login succeeded session_id=%s username=%s", session_id, request.username)
    return {"session_id": session_id, "auth_url": YNU_AUTH_URL, "message": "云大学堂已连接"}


@app.post("/sources/ynu/courses")
def list_ynu_courses(request: YnuCourseListRequest):
    client = ynu_sessions.get(request.session_id)
    if not client:
        logger.warning("YNU course list failed: invalid session_id=%s query=%s", request.session_id, request.query)
        raise HTTPException(status_code=401, detail="云大学堂会话已失效，请重新登录。")
    try:
        courses = client.list_courses(
            query=request.query,
            school_year=request.school_year,
            semester=request.semester,
            page=request.page,
            size=request.size,
        )
        logger.info("YNU course list query=%s returned=%s session_id=%s", request.query, len(courses), request.session_id)
    except Exception as exc:
        logger.exception("YNU course list failed session_id=%s query=%s", request.session_id, request.query)
        raise HTTPException(status_code=502, detail=f"云大学堂课程列表获取失败：{exc}") from exc
    return {"items": courses}


@app.post("/sources/ynu/import")
def import_ynu_lecture(request: YnuImportLectureRequest):
    client = ynu_sessions.get(request.session_id)
    if not client:
        logger.warning(
            "YNU import failed: invalid session_id=%s course_id=%s record_id=%s title=%s",
            request.session_id,
            request.course_id,
            request.record_id,
            request.title or request.course_name,
        )
        raise HTTPException(status_code=401, detail="云大学堂会话已失效，请重新登录。")
    if not request.course_id or not request.record_id:
        raise HTTPException(status_code=400, detail="缺少课程 ID 或录播 ID。")
    state = ensure_seed()
    existing_source = next(
        (
            source
            for source in state.sources
            if source.kind == "lecture"
            and source.metadata.get("platform") == "ynu_course"
            and source.metadata.get("record_id") == request.record_id
        ),
        None,
    )
    if existing_source and existing_source.metadata.get("transcript_chunk_version") == 2:
        logger.info("YNU import skipped existing source record_id=%s title=%s", request.record_id, existing_source.title)
        return workspace_response(state)
    try:
        logger.info(
            "YNU import started course_id=%s record_id=%s title=%s week=%s section=%s",
            request.course_id,
            request.record_id,
            request.title or request.course_name,
            request.week,
            request.section,
        )
        source = build_source_from_lecture(client, request)
    except Exception as exc:
        logger.exception(
            "YNU import failed course_id=%s record_id=%s title=%s week=%s section=%s",
            request.course_id,
            request.record_id,
            request.title or request.course_name,
            request.week,
            request.section,
        )
        raise HTTPException(status_code=502, detail=f"云大学堂转写导入失败：{exc}") from exc
    if existing_source:
        state.sources = [item for item in state.sources if item.id != existing_source.id]
    state.sources.insert(0, source)
    state.study_events.append(
        {
            "type": "ynu_lecture_import",
            "course_id": request.course_id,
            "record_id": request.record_id,
            "title": source.title,
        }
    )
    logger.info(
        "YNU import succeeded source_id=%s title=%s chunks=%s content_length=%s",
        source.id,
        source.title,
        len(source.chunks),
        source.content_length,
    )
    return workspace_response(store.save(state))


def build_web_source(request: AddWebSourceRequest) -> Source:
    source_id = make_id("source")
    try:
        extraction = WebIngestor().ingest(request.url, request.content)
        content = extraction.text or request.content
        chunks = chunk_text(content, source_id, request.title)
        return Source(
            id=source_id,
            title=request.title,
            kind="web",
            status="ready",
            url=request.url,
            summary=generate_source_guide(chunks, request.title),
            extraction_status=extraction.extraction_status,
            extraction_method=extraction.extraction_method,
            content_length=extraction.content_length or len(content),
            chunks=chunks,
        )
    except Exception as exc:
        chunks = chunk_text(request.content or request.title, source_id, request.title)
        return Source(
            id=source_id,
            title=request.title,
            kind="web",
            status="ready" if chunks else "failed",
            url=request.url,
            summary=generate_source_guide(chunks, request.title) if chunks else request.content,
            error=str(exc),
            extraction_status="fallback" if chunks else "failed",
            extraction_method="search_snippet" if chunks else "unknown",
            content_length=sum(len(chunk.text) for chunk in chunks),
            chunks=chunks,
        )


@app.post("/chat")
def chat(request: ChatRequest):
    state = ensure_seed()
    user_message = Message(id=make_id("msg"), role="user", content=request.message)
    tutor = TutorAgent()
    retrieval_query = rewrite_query(request.message, state)
    chunks, citations = tutor.retrieve(state, retrieval_query)
    runtime_context = build_runtime_context(state, request.message, chunks, retrieval_query)

    def persist(answer: str) -> None:
        saved = store.load()
        assistant_message = Message(id=make_id("msg"), role="assistant", content=answer, citations=citations)
        saved.messages.extend([user_message, assistant_message])
        saved.profile = ProfileAgent().update_after_chat(saved.profile, request.message)
        saved.study_events.append({"type": "chat", "message": request.message, "retrieval_query": retrieval_query})
        if should_generate_summary(saved.messages):
            summary = generate_conversation_summary(saved.messages)
            if summary:
                saved.messages.append(Message(id=make_id("msg"), role="summary", content=summary))
                saved.study_events.append({"type": "conversation_summary", "message_count": len(saved.messages)})
        store.save(saved)

    def stream():
        answer_parts: list[str] = []
        try:
            llm = get_llm_client()
            if llm.configured:
                for chunk in llm.stream_chat(runtime_context.messages, temperature=0.2, max_tokens=1800):
                    answer_parts.append(chunk)
                    yield chunk
            else:
                raise RuntimeError("LLM is not configured")
        except Exception:
            fallback_answer, _ = tutor.answer(state, retrieval_query)
            fallback_answer = SafetyAgent().validate_answer(fallback_answer, citations)
            answer_parts = [fallback_answer]
            yield fallback_answer

        answer = SafetyAgent().validate_answer("".join(answer_parts), citations)
        if citations:
            citations_text = "\n\n**引用**\n" + "\n".join(
                f"- [{index}] {citation.source_title} / {citation.location}"
                for index, citation in enumerate(citations, start=1)
            )
            yield citations_text
            answer += citations_text
        persist(answer)

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")


@app.post("/artifacts/generate")
def generate_artifact(request: GenerateArtifactRequest):
    state = ensure_seed()
    artifact = ResourceAgent().generate(state, request.kind, request.prompt)
    if request.kind == "summary":
        artifact.data["manual"] = True
    state.artifacts.insert(0, artifact)
    store.save(state)
    return artifact


@app.patch("/artifacts/{artifact_id}")
def rename_artifact(artifact_id: str, request: RenameArtifactRequest):
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Artifact title cannot be empty")
    state = ensure_seed()
    artifact = next((item for item in state.artifacts if item.id == artifact_id), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    artifact.title = title
    if artifact.kind == "presentation":
        artifact.data["title"] = title
    state.study_events.append({"type": "artifact_rename", "artifact_id": artifact_id, "title": title})
    return workspace_response(store.save(state))


@app.delete("/artifacts/{artifact_id}")
def delete_artifact(artifact_id: str):
    state = ensure_seed()
    original_count = len(state.artifacts)
    state.artifacts = [artifact for artifact in state.artifacts if artifact.id != artifact_id]
    if len(state.artifacts) == original_count:
        raise HTTPException(status_code=404, detail="Artifact not found")
    state.study_events.append({"type": "artifact_delete", "artifact_id": artifact_id})
    return workspace_response(store.save(state))


@app.post("/artifacts/{artifact_id}/share")
def share_artifact(artifact_id: str, request: Request):
    state = ensure_seed()
    artifact = next((item for item in state.artifacts if item.id == artifact_id), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    origin = request.headers.get("origin")
    share_url = (
        f"{origin.rstrip('/')}/share/artifacts/{artifact_id}"
        if origin
        else str(request.url_for("get_shared_artifact", artifact_id=artifact_id))
    )
    artifact.data["share_url"] = share_url
    state.study_events.append({"type": "artifact_share", "artifact_id": artifact_id, "share_url": share_url})
    store.save(state)
    return {"ok": True, "share_url": share_url, "artifact": artifact}


@app.get("/shared/artifacts/{artifact_id}")
def get_shared_artifact(artifact_id: str):
    state = ensure_seed()
    artifact = next((item for item in state.artifacts if item.id == artifact_id), None)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"workspace_id": state.workspace_id, "course_title": state.course_title, "artifact": artifact}


@app.post("/quiz/{artifact_id}/submit")
def submit_quiz(artifact_id: str, request: QuizSubmitRequest):
    state = ensure_seed()
    artifact = next((item for item in state.artifacts if item.id == artifact_id), None)
    if not artifact or artifact.kind != "quiz":
        raise HTTPException(status_code=404, detail="Quiz artifact not found")
    questions = artifact.data.get("questions", [])
    correct = 0
    missed_topics: list[str] = []
    details = []
    for question in questions:
        selected = request.answers.get(question["id"])
        is_correct = selected == question["answer"]
        correct += 1 if is_correct else 0
        if not is_correct:
            missed_topics.append(question["topic"])
        details.append(
            {
                "question_id": question["id"],
                "selected": selected,
                "answer": question["answer"],
                "correct": is_correct,
                "topic": question["topic"],
                "explanation": question["explanation"],
            }
        )
    report = {
        "score": correct,
        "total": len(questions),
        "accuracy": round(correct / len(questions), 2) if questions else 0,
        "missed_topics": missed_topics,
        "details": details,
        "recommendations": ProfileAgent().recommend(state.profile),
    }
    state.profile = ProfileAgent().update_after_quiz(state.profile, correct, len(questions), missed_topics)
    state.study_events.append({"type": "quiz", "artifact_id": artifact_id, "report": report})
    store.save(state)
    return report


@app.post("/flashcards/{artifact_id}/review")
def review_flashcard(artifact_id: str, request: FlashcardReviewRequest):
    state = ensure_seed()
    artifact = next((item for item in state.artifacts if item.id == artifact_id), None)
    if not artifact or artifact.kind != "flashcards":
        raise HTTPException(status_code=404, detail="Flashcard artifact not found")
    card = next((item for item in artifact.data.get("cards", []) if item["id"] == request.card_id), None)
    topic = card["topic"] if card else "未知主题"
    state.profile = ProfileAgent().update_after_flashcard(state.profile, topic, request.result)
    state.study_events.append(
        {"type": "flashcard", "artifact_id": artifact_id, "card_id": request.card_id, "result": request.result}
    )
    store.save(state)
    return {"ok": True, "profile": state.profile}


@app.get("/profile")
def get_profile():
    return ensure_seed().profile
