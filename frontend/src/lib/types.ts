export type Citation = {
  source_id: string;
  source_title: string;
  location: string;
  snippet: string;
};

export type Source = {
  id: string;
  title: string;
  kind: "file" | "web" | "seed";
  status: string;
  summary: string;
  url?: string;
  error?: string;
  extraction_status: "complete" | "partial" | "fallback" | "failed" | "unknown";
  extraction_method: "jina_reader" | "trafilatura" | "html_fallback" | "search_snippet" | "file" | "seed" | "unknown";
  content_length: number;
  chunks: { id: string; text: string; location: string; keywords: string[] }[];
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

export type ArtifactKind = "summary" | "flashcards" | "quiz" | "mindmap" | "qa" | "reading" | "report";

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  title: string;
  status: "generating" | "ready" | "failed";
  data: Record<string, unknown>;
};

export type Profile = {
  knowledge_base: string;
  learning_goal: string;
  weak_points: string[];
  preferred_resources: string[];
  accuracy_rate: number;
  learning_pace: string;
  error_patterns: string[];
  interests: string[];
  next_steps: string[];
};

export type Workspace = {
  course_title: string;
  sources: Source[];
  messages: Message[];
  artifacts: Artifact[];
  profile: Profile;
};

export type WebCandidate = {
  title: string;
  url: string;
  snippet: string;
  content: string;
  domain: string;
  source_provider: string;
};

export type QuizQuestion = {
  id: string;
  stem: string;
  options: { key: string; text: string; explanation: string }[];
  answer: string;
  topic: string;
  explanation: string;
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  topic: string;
};

export type MindMapNode = {
  id: string;
  label: string;
  detail: string;
  children: MindMapNode[];
};
