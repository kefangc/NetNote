export type Citation = {
  source_id: string;
  source_title: string;
  location: string;
  snippet: string;
  metadata?: {
    kind?: string;
    platform?: string;
    week?: string;
    section?: string;
    start_time?: string;
    end_time?: string;
    start_seconds?: number;
    end_seconds?: number;
    video_url?: string;
    source_url?: string;
  };
};

export type Source = {
  id: string;
  title: string;
  kind: "file" | "web" | "seed" | "lecture";
  status: string;
  summary: string;
  url?: string;
  error?: string;
  extraction_status: "complete" | "partial" | "fallback" | "failed" | "unknown";
  extraction_method: "jina_reader" | "trafilatura" | "html_fallback" | "search_snippet" | "ynu_transcript" | "file" | "seed" | "unknown";
  content_length: number;
  metadata?: Record<string, unknown>;
  chunks: { id: string; text: string; location: string; keywords: string[]; metadata?: Record<string, unknown> }[];
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "summary";
  content: string;
  citations: Citation[];
};

export type ArtifactKind = "summary" | "flashcards" | "quiz" | "mindmap" | "qa" | "reading" | "report" | "presentation";

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

export type SourceScope = "web" | "ynu";

export type YnuCourse = {
  course_id: string;
  record_id: string;
  course_name: string;
  title: string;
  teacher: string;
  school_year: string;
  semester: string;
  week: string;
  section: string;
  url: string;
  raw?: Record<string, unknown>;
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

export type PresentationSlide = {
  id: string;
  layout: "cover" | "section" | "bullets" | "two-column" | "timeline" | "quote" | "quiz" | "summary";
  title: string;
  subtitle?: string;
  bullets?: string[];
  leftTitle?: string;
  leftItems?: string[];
  rightTitle?: string;
  rightItems?: string[];
  steps?: string[];
  quote?: string;
  question?: string;
  options?: string[];
  answer?: string;
  notes?: string;
  citations?: string[];
};

export type PresentationData = {
  title: string;
  subtitle?: string;
  theme: "netnote-blue";
  slides: PresentationSlide[];
};
