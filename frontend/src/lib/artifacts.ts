import type { ArtifactKind } from "./types";

export function artifactLabel(kind: ArtifactKind) {
  const labels: Record<ArtifactKind, string> = {
    summary: "概览",
    flashcards: "抽认卡",
    quiz: "测验",
    mindmap: "思维导图",
    qa: "问答卡片",
    reading: "拓展阅读",
    report: "报告",
    presentation: "演示文稿",
  };
  return labels[kind];
}

export function artifactIcon(kind: ArtifactKind) {
  const icons: Record<ArtifactKind, string> = {
    summary: "✦",
    flashcards: "▣",
    quiz: "▤",
    mindmap: "⌘",
    qa: "❖",
    reading: "☰",
    report: "▥",
    presentation: "▭",
  };
  return icons[kind];
}

export function studioStyle(kind: ArtifactKind) {
  const styles: Record<ArtifactKind, { bg: string; text: string }> = {
    summary: { bg: "bg-[#e7e9ff]", text: "text-[#3153a4]" },
    flashcards: { bg: "bg-[#e4f3ea]", text: "text-[#18734e]" },
    quiz: { bg: "bg-[#eef0dc]", text: "text-[#70712b]" },
    mindmap: { bg: "bg-[#f6e6fb]", text: "text-[#9a3fab]" },
    qa: { bg: "bg-[#f7e6e8]", text: "text-[#a44455]" },
    reading: { bg: "bg-[#dff2f6]", text: "text-[#247489]" },
    report: { bg: "bg-[#ebe8ff]", text: "text-[#5a4ca3]" },
    presentation: { bg: "bg-[#f1f0e6]", text: "text-[#7b641f]" },
  };
  return styles[kind];
}

export const artifactKinds: ArtifactKind[] = ["summary", "presentation", "flashcards", "mindmap", "quiz", "qa", "reading"];
