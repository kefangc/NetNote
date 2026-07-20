import type { Artifact, ArtifactKind, SourcePreview, WebCandidate, Workspace, YnuCourse } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export type LlmSettings = {
  base_url: string;
  model: string;
  api_key_set: boolean;
  configured: boolean;
};

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function getWorkspace() {
  return asJson<Workspace>(await fetch(`${API_BASE}/workspace`, { cache: "no-store" }));
}

export async function getSourcePreview(sourceId: string) {
  return asJson<SourcePreview>(await fetch(`${API_BASE}/sources/${sourceId}/preview`, { cache: "no-store" }));
}

export async function getLlmSettings() {
  return asJson<LlmSettings>(await fetch(`${API_BASE}/settings/llm`, { cache: "no-store" }));
}

export async function saveLlmSettings(settings: { base_url: string; api_key?: string; model: string }) {
  return asJson<LlmSettings>(
    await fetch(`${API_BASE}/settings/llm`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
}

export async function fetchLlmModels(settings: { base_url?: string; api_key?: string }) {
  return asJson<{ items: string[] }>(
    await fetch(`${API_BASE}/settings/llm/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  );
}

export async function uploadSource(file: File) {
  const form = new FormData();
  form.append("file", file);
  return asJson<Workspace>(await fetch(`${API_BASE}/sources/upload`, { method: "POST", body: form }));
}

export async function searchWebSource(query: string) {
  return asJson<{ items: WebCandidate[] }>(
    await fetch(`${API_BASE}/sources/search-web`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: query }),
    }),
  );
}

export async function addWebSource(candidate: WebCandidate) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/sources/add-web`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    }),
  );
}

export async function addWebSources(items: WebCandidate[]) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/sources/add-web-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
}

export async function deleteSource(sourceId: string) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/sources/${sourceId}`, {
      method: "DELETE",
    }),
  );
}

export async function loginYnuSource(credentials: { username?: string; password?: string; cookie_header?: string }) {
  return asJson<{ session_id: string; auth_url: string; message: string }>(
    await fetch(`${API_BASE}/sources/ynu/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    }),
  );
}

export async function searchYnuCourses(params: { session_id: string; query?: string; school_year?: string; semester?: string }) {
  return asJson<{ items: YnuCourse[] }>(
    await fetch(`${API_BASE}/sources/ynu/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: 1, size: 20, ...params }),
    }),
  );
}

export async function importYnuLecture(sessionId: string, course: YnuCourse) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/sources/ynu/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        course_id: course.course_id,
        record_id: course.record_id,
        school_year: course.school_year || undefined,
        semester: course.semester || undefined,
        course_name: course.course_name || undefined,
        title: course.title || course.course_name || undefined,
        teacher: course.teacher || undefined,
        week: course.week || undefined,
        section: course.section || undefined,
        url: course.url || undefined,
      }),
    }),
  );
}

export async function generateArtifact(kind: ArtifactKind, prompt?: string) {
  return asJson<Artifact>(
    await fetch(`${API_BASE}/artifacts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, prompt }),
    }),
  );
}

export async function renameArtifact(artifactId: string, title: string) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/artifacts/${artifactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

export async function deleteArtifact(artifactId: string) {
  return asJson<Workspace>(
    await fetch(`${API_BASE}/artifacts/${artifactId}`, {
      method: "DELETE",
    }),
  );
}

export async function shareArtifact(artifactId: string) {
  return asJson<{ ok: boolean; share_url: string; artifact: Artifact }>(
    await fetch(`${API_BASE}/artifacts/${artifactId}/share`, {
      method: "POST",
    }),
  );
}

export async function getSharedArtifact(artifactId: string) {
  return asJson<{ workspace_id: string; course_title: string; artifact: Artifact }>(
    await fetch(`${API_BASE}/shared/artifacts/${artifactId}`, { cache: "no-store" }),
  );
}

export async function streamChat(message: string, onChunk: (chunk: string) => void) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok || !response.body) {
    throw new Error("聊天接口失败");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    text += chunk;
    onChunk(text);
  }
  return text;
}

export async function submitQuiz(artifactId: string, answers: Record<string, string>) {
  return asJson<{ score: number; total: number; missed_topics: string[]; recommendations: string[] }>(
    await fetch(`${API_BASE}/quiz/${artifactId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact_id: artifactId, answers }),
    }),
  );
}

export async function reviewFlashcard(artifactId: string, cardId: string, result: "known" | "unknown" | "skipped") {
  return asJson<{ ok: boolean }>(
    await fetch(`${API_BASE}/flashcards/${artifactId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact_id: artifactId, card_id: cardId, result }),
    }),
  );
}
