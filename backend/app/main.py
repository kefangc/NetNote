from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
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
from .llm_client import get_llm_client
from .parsers import chunk_text, parse_file
from .schemas import (
    AddWebSourceRequest,
    ChatRequest,
    FlashcardReviewRequest,
    GenerateArtifactRequest,
    Message,
    QuizSubmitRequest,
    Source,
    WorkspaceState,
)
from .store import JsonStore


ROOT = Path(__file__).resolve().parents[1]
UPLOAD_DIR = ROOT / "uploads"
DATA_PATH = ROOT / "data" / "workspace.json"

app = FastAPI(title="Software Cup A3 Learning Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = JsonStore(DATA_PATH)


def refresh_stale_source_guides(state: WorkspaceState) -> WorkspaceState:
    changed = False
    for source in state.sources:
        if source.status != "ready" or not source.chunks:
            continue
        if not source.summary or "主要围绕" in source.summary or "代表内容" in source.summary:
            source.summary = generate_source_guide(source.chunks, source.title)
            changed = True
    return store.save(state) if changed else state


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
        chunks=chunks,
    )
    state.sources.append(seed)
    state.artifacts.append(ResourceAgent().generate(state, "summary"))
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


@app.get("/workspace")
def get_workspace():
    return refresh_stale_source_guides(ensure_seed())


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
        source.status = "ready"
        state.artifacts.insert(0, ResourceAgent().generate(state, "summary"))
    except Exception as exc:
        source.status = "failed"
        source.error = str(exc)
    return store.save(state)


@app.post("/sources/search-web")
def search_web(request: ChatRequest):
    return {"items": WebSearchAgent().search(request.message)}


@app.post("/sources/add-web")
def add_web_source(request: AddWebSourceRequest):
    state = ensure_seed()
    source_id = make_id("source")
    search_agent = WebSearchAgent()
    fetched = search_agent.fetch_page_text(request.url)
    content = fetched or request.content
    chunks = chunk_text(content, source_id, request.title)
    source = Source(
        id=source_id,
        title=request.title,
        kind="web",
        status="ready",
        url=request.url,
        summary=generate_source_guide(chunks, request.title),
        chunks=chunks,
    )
    state.sources.insert(0, source)
    state.artifacts.insert(0, ResourceAgent().generate(state, "summary"))
    return store.save(state)


@app.post("/chat")
def chat(request: ChatRequest):
    state = ensure_seed()
    user_message = Message(id=make_id("msg"), role="user", content=request.message)
    tutor = TutorAgent()
    chunks, citations = tutor.retrieve(state, request.message)

    def persist(answer: str) -> None:
        saved = store.load()
        assistant_message = Message(id=make_id("msg"), role="assistant", content=answer, citations=citations)
        saved.messages.extend([user_message, assistant_message])
        saved.profile = ProfileAgent().update_after_chat(saved.profile, request.message)
        saved.study_events.append({"type": "chat", "message": request.message})
        store.save(saved)

    def stream():
        answer_parts: list[str] = []
        try:
            llm = get_llm_client()
            if llm.configured:
                for chunk in llm.stream_chat(tutor.build_messages(request.message, chunks), temperature=0.2, max_tokens=1800):
                    answer_parts.append(chunk)
                    yield chunk
            else:
                raise RuntimeError("LLM is not configured")
        except Exception:
            fallback_answer, _ = tutor.answer(state, request.message)
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
    state.artifacts.insert(0, artifact)
    store.save(state)
    return artifact


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
