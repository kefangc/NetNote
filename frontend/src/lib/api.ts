import type { Artifact, ArtifactKind, WebCandidate, Workspace } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function getWorkspace() {
  return asJson<Workspace>(await fetch(`${API_BASE}/workspace`, { cache: "no-store" }));
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
