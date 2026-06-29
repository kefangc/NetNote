"use client";

import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import PptxGenJS from "pptxgenjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CollapseButton, DetailTitle, EmptyState, ScoreRing, TokenList } from "./Common";
import { Markdown } from "./Markdown";
import { artifactIcon } from "@/lib/artifacts";
import { reviewFlashcard, submitQuiz } from "@/lib/api";
import type { Artifact, Flashcard, MindMapNode, PresentationData, PresentationSlide, Profile, QuizQuestion } from "@/lib/types";

export function ArtifactDetail({
  artifact,
  profile,
  onAsk,
  onRefresh,
  onClose,
  onCollapse,
}: {
  artifact: Artifact;
  profile?: Profile;
  onAsk: (text: string) => void;
  onRefresh: () => Promise<void>;
  onClose?: () => void;
  onCollapse?: () => void;
}) {
  if (artifact.kind === "summary") return <SummaryView artifact={artifact} profile={profile} />;
  if (artifact.kind === "flashcards") return <FlashcardsView artifact={artifact} onRefresh={onRefresh} />;
  if (artifact.kind === "quiz") return <QuizView artifact={artifact} onRefresh={onRefresh} />;
  if (artifact.kind === "mindmap") return <MindMapView artifact={artifact} onAsk={onAsk} onClose={onClose} />;
  if (artifact.kind === "qa") return <QaView artifact={artifact} onAsk={onAsk} />;
  if (artifact.kind === "reading") return <ReadingView artifact={artifact} />;
  if (artifact.kind === "presentation") return <PresentationView artifact={artifact} onClose={onClose} onCollapse={onCollapse} />;
  return <EmptyState text="暂不支持该生成物。" />;
}

function PresentationView({ artifact, onClose, onCollapse }: { artifact: Artifact; onClose?: () => void; onCollapse?: () => void }) {
  const data = artifact.data as PresentationData;
  const slides = data.slides ?? [];
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeSlide = slides[index];

  if (!slides.length) return <EmptyState text="暂无演示文稿。" />;

  function safeFileName(extension: string) {
    const base = (data.title || artifact.title || "netnote-presentation").replace(/[\\/:*?"<>|]/g, "_");
    return `${base}.${extension}`;
  }

  async function captureSlides() {
    const nodes = exportRefs.current.slice(0, slides.length);
    const images: string[] = [];
    for (const node of nodes) {
      if (!node) continue;
      images.push(await toPng(node, {
        width: 1280,
        height: 720,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#f8f9ff",
      }));
    }
    return images;
  }

  async function downloadPdf() {
    setExporting("pdf");
    try {
      const images = await captureSlides();
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720], compress: true });
      images.forEach((image, page) => {
        if (page > 0) pdf.addPage([1280, 720], "landscape");
        pdf.addImage(image, "PNG", 0, 0, 1280, 720);
      });
      pdf.save(safeFileName("pdf"));
    } finally {
      setExporting(null);
    }
  }

  async function downloadPptx() {
    setExporting("pptx");
    try {
      const images = await captureSlides();
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "NetNote";
      pptx.subject = data.subtitle || artifact.title;
      pptx.title = data.title || artifact.title;
      images.forEach((image) => {
        const slide = pptx.addSlide();
        slide.background = { color: "F8F9FF" };
        slide.addImage({ data: image, x: 0, y: 0, w: 13.333, h: 7.5 });
      });
      await pptx.writeFile({ fileName: safeFileName("pptx") });
    } finally {
      setExporting(null);
    }
  }

  const sourceCount = Math.max(1, new Set(slides.flatMap((slide) => slide.citations ?? [])).size || 3);
  const expandedLayer = expanded ? (
    <div className="presentation-expanded-backdrop" onClick={() => setExpanded(false)}>
      <div className="presentation-expanded-panel" onClick={(event) => event.stopPropagation()}>
        <div className="presentation-expanded-header">
          <input value={data.title || artifact.title} readOnly aria-label="演示文稿标题" />
          <div className="presentation-expanded-tools">
            <button type="button" className="presentation-text-tool">✎ 修改</button>
            <button type="button" aria-label="下一页" onClick={() => setIndex((value) => Math.min(slides.length - 1, value + 1))}>▶</button>
            <button type="button" aria-label="下载 PDF" onClick={() => void downloadPdf()} disabled={Boolean(exporting)}>PDF</button>
            <button type="button" aria-label="收起预览" onClick={() => setExpanded(false)}>⤡</button>
            <button type="button" aria-label="关闭演示文稿" onClick={() => { setExpanded(false); onClose?.(); }}>×</button>
            <button type="button" aria-label="下载 PPTX" onClick={() => void downloadPptx()} disabled={Boolean(exporting)}>PPT</button>
          </div>
        </div>
        <button type="button" className="presentation-expanded-source">查看提示和 {sourceCount} 个来源</button>
        <div className="presentation-expanded-body">
          <div className="presentation-expanded-main">
            <SlideFrame slide={activeSlide} index={index} total={slides.length} title={data.title} mode="contain" />
            <div className="presentation-zoom-tools">
              <button type="button" aria-label="放大">＋</button>
              <button type="button" aria-label="缩小">−</button>
            </div>
          </div>
          <div className="presentation-expanded-thumbs">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                className={slideIndex === index ? "presentation-expanded-thumb-active" : ""}
                onClick={() => setIndex(slideIndex)}
                aria-label={`查看第 ${slideIndex + 1} 页`}
              >
                <span>{slideIndex + 1}</span>
                <SlideFrame slide={slide} index={slideIndex} total={slides.length} title={data.title} className="presentation-thumb-frame" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="presentation-detail">
      <div className="presentation-studio-heading">
        <button type="button" className="presentation-back-button" title="返回上一级" aria-label="返回上一级" onClick={onClose}>‹</button>
        <div className="presentation-heading-copy">
          <h2>{data.title || artifact.title}</h2>
          <p>演示文稿</p>
        </div>
        {onCollapse ? <CollapseButton label="关闭 Studio" onClick={onCollapse} /> : null}
      </div>
      <div className="presentation-detail-header">
        <div className="presentation-title-block">
          <div className="presentation-title-row">
            <div className="presentation-current-title">
              <span>{artifactIcon(artifact.kind)}</span>
              <h3>{data.title || artifact.title}</h3>
            </div>
            <div className="presentation-detail-actions">
              <button type="button" title="修改">✎</button>
              <button type="button" title="播放" onClick={() => setExpanded(true)}>▶</button>
              <button type="button" title={exporting === "pdf" ? "PDF 导出中" : "下载 PDF"} onClick={() => void downloadPdf()} disabled={Boolean(exporting)}>PDF</button>
              <button type="button" title="展开" aria-label="展开演示文稿" onClick={() => setExpanded(true)}>⤢</button>
              <button type="button" title={exporting === "pptx" ? "PPTX 导出中" : "下载 PPTX"} onClick={() => void downloadPptx()} disabled={Boolean(exporting)}>PPT</button>
            </div>
          </div>
          <button type="button" className="presentation-source-pill">查看提示和 {sourceCount} 个来源</button>
        </div>
      </div>

      <div className="presentation-page-scroll">
        {slides.map((slide, slideIndex) => (
          <button
            key={slide.id}
            type="button"
            className="presentation-page-card"
            onClick={() => {
              setIndex(slideIndex);
              setExpanded(true);
            }}
          >
            <SlideFrame slide={slide} index={slideIndex} total={slides.length} title={data.title} className="presentation-page-frame" />
          </button>
        ))}
      </div>

      {typeof document !== "undefined" && expandedLayer ? createPortal(expandedLayer, document.body) : null}

      <div className="presentation-export-stage" aria-hidden="true">
        {slides.map((slide, slideIndex) => (
          <div
            key={slide.id}
            ref={(node) => {
              exportRefs.current[slideIndex] = node;
            }}
            className="presentation-export-slide"
          >
            <SlideCanvas slide={slide} index={slideIndex} total={slides.length} title={data.title} exportMode />
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideFrame({
  slide,
  index,
  total,
  title,
  className = "",
  mode = "width",
  compact = false,
}: {
  slide: PresentationSlide;
  index: number;
  total: number;
  title?: string;
  className?: string;
  mode?: "width" | "contain";
  compact?: boolean;
}) {
  return (
    <div className={`presentation-slide-frame presentation-slide-frame-${mode} ${className}`}>
      <SlideCanvas slide={slide} index={index} total={total} title={title} compact={compact} />
    </div>
  );
}

function SlideCanvas({ slide, index, total, title, exportMode = false, compact = false }: { slide: PresentationSlide; index: number; total: number; title?: string; exportMode?: boolean; compact?: boolean }) {
  return (
    <section className={`presentation-slide presentation-slide-${slide.layout} ${exportMode ? "presentation-slide-export" : ""} ${compact ? "presentation-slide-compact" : ""}`}>
      <div className="presentation-bg-grid" />
      <div className="presentation-slide-header">
        <span>NetNote</span>
        <span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      </div>
      <div className="presentation-slide-body">
        <SlideBody slide={slide} deckTitle={title} />
      </div>
      <div className="presentation-slide-footer">
        <span>{title || "个性化学习讲义"}</span>
        <span>让学习更有结构</span>
      </div>
    </section>
  );
}

function SlideBody({ slide, deckTitle }: { slide: PresentationSlide; deckTitle?: string }) {
  if (slide.layout === "cover") {
    return (
      <div className="presentation-cover">
        <p className="presentation-cover-chip">AI Generated Slides</p>
        <h2>{slide.title || deckTitle}</h2>
        {slide.subtitle ? <p>{slide.subtitle}</p> : null}
        <SlideBulletList items={slide.bullets} />
      </div>
    );
  }
  if (slide.layout === "section") {
    return (
      <div className="presentation-section">
        <span>Chapter</span>
        <h2>{slide.title}</h2>
        {slide.subtitle ? <p>{slide.subtitle}</p> : null}
        <SlideBulletList items={slide.bullets} />
      </div>
    );
  }
  if (slide.layout === "two-column") {
    return (
      <div>
        <h2 className="presentation-slide-title">{slide.title}</h2>
        <div className="presentation-two-col">
          <div>
            <h3>{slide.leftTitle || "左侧观点"}</h3>
            <SlideBulletList items={slide.leftItems} />
          </div>
          <div>
            <h3>{slide.rightTitle || "右侧观点"}</h3>
            <SlideBulletList items={slide.rightItems} />
          </div>
        </div>
      </div>
    );
  }
  if (slide.layout === "timeline") {
    return (
      <div>
        <h2 className="presentation-slide-title">{slide.title}</h2>
        <div className="presentation-timeline">
          {(slide.steps ?? []).map((step, stepIndex) => (
            <div key={`${step}-${stepIndex}`}>
              <span>{stepIndex + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.layout === "quote") {
    return (
      <div className="presentation-quote">
        <blockquote>{slide.quote || slide.title}</blockquote>
        {slide.subtitle ? <p>{slide.subtitle}</p> : null}
      </div>
    );
  }
  if (slide.layout === "quiz") {
    return (
      <div>
        <h2 className="presentation-slide-title">{slide.title}</h2>
        <div className="presentation-quiz">
          <p>{slide.question || "请回答这一页的问题。"}</p>
          <div>
            {(slide.options ?? []).map((option, optionIndex) => (
              <span key={option}>{String.fromCharCode(65 + optionIndex)}. {option}</span>
            ))}
          </div>
          {slide.answer ? <small>参考答案：{slide.answer}</small> : null}
        </div>
      </div>
    );
  }
  if (slide.layout === "summary") {
    return (
      <div className="presentation-summary">
        <h2>{slide.title}</h2>
        <SlideBulletList items={slide.bullets} />
      </div>
    );
  }
  return (
    <div>
      <h2 className="presentation-slide-title">{slide.title}</h2>
      {slide.subtitle ? <p className="presentation-slide-subtitle">{slide.subtitle}</p> : null}
      <SlideBulletList items={slide.bullets} />
    </div>
  );
}

function SlideBulletList({ items }: { items?: string[] }) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="presentation-bullets">
      {list.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function SummaryView({ artifact, profile }: { artifact: Artifact; profile?: Profile }) {
  const data = artifact.data as {
    overview?: string;
    key_concepts?: string[];
    suggested_artifacts?: string[];
    sources?: { title: string; summary: string; quality?: string; content_length?: number }[];
  };
  return (
    <div className="space-y-4">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      <div className="soft-card p-4">
        <Markdown text={data.overview ?? ""} />
      </div>
      {data.sources?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#5f6368]">来源分项总结</p>
          {data.sources.map((source) => (
            <div key={source.title} className="soft-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{source.title}</p>
                {source.quality ? <span className="source-meta-chip">{source.quality}</span> : null}
              </div>
              <Markdown text={source.summary} />
            </div>
          ))}
        </div>
      ) : null}
      <TokenList title="关键概念" items={data.key_concepts ?? []} />
      <TokenList title="建议生成" items={data.suggested_artifacts ?? []} />
      {profile ? (
        <div className="soft-card p-4">
          <p className="text-sm font-semibold">学习画像</p>
          <p className="mt-2 text-xs leading-6 text-[#5f6368]">{profile.knowledge_base}</p>
          <TokenList title="薄弱点" items={profile.weak_points} />
          <TokenList title="下一步" items={profile.next_steps} />
        </div>
      ) : null}
    </div>
  );
}

function FlashcardsView({ artifact, onRefresh }: { artifact: Artifact; onRefresh: () => Promise<void> }) {
  const cards = ((artifact.data as { cards?: Flashcard[] }).cards ?? []);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ known: 0, unknown: 0, skipped: 0 });
  const card = cards[index];
  const done = index >= cards.length;

  async function mark(result: "known" | "unknown" | "skipped") {
    if (!card) return;
    setStats((current) => ({ ...current, [result]: current[result] + 1 }));
    await reviewFlashcard(artifact.id, card.id, result);
    setFlipped(false);
    setIndex((current) => current + 1);
    await onRefresh();
  }

  if (!cards.length) return <EmptyState text="暂无抽认卡。" />;
  if (done) {
    const total = stats.known + stats.unknown + stats.skipped;
    return (
      <div className="space-y-4">
        <DetailTitle icon="✓" title="抽认卡总结" />
        <ScoreRing score={stats.known} total={total || cards.length} />
        <TokenList title="结果" items={[`已掌握 ${stats.known}`, `需复习 ${stats.unknown}`, `跳过 ${stats.skipped}`]} />
        <button className="primary-action w-full justify-center" onClick={() => { setIndex(0); setStats({ known: 0, unknown: 0, skipped: 0 }); }}>
          <span>↻</span>
          <span>再练习一次</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={`${artifact.title} ${index + 1}/${cards.length}`} />
      <button className={`flashcard ${flipped ? "flashcard-answer" : ""}`} onClick={() => setFlipped((value) => !value)}>
        <span className="text-xs font-semibold uppercase text-[#5f6368]">{flipped ? "Answer" : "Question"}</span>
        <span className="mt-5 block text-[19px] font-semibold leading-8">{flipped ? card.back : card.front}</span>
        <span className="mt-6 block text-xs text-[#5f6368]">点击翻转</span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        <button className="review-button border-[#e1b4a4] bg-[#fff4ef] text-[#9b3f28]" onClick={() => void mark("unknown")}>× 不会</button>
        <button className="review-button border-[#dadce0] bg-white text-[#5f6368]" onClick={() => void mark("skipped")}>○ 跳过</button>
        <button className="review-button border-[#a9ccb8] bg-[#eef8f2] text-[#27614f]" onClick={() => void mark("known")}>✓ 会</button>
      </div>
    </div>
  );
}

function QuizView({ artifact, onRefresh }: { artifact: Artifact; onRefresh: () => Promise<void> }) {
  const questions = ((artifact.data as { questions?: QuizQuestion[] }).questions ?? []);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [report, setReport] = useState<{ score: number; total: number; missed_topics: string[]; recommendations: string[] } | null>(null);
  const question = questions[index];
  const selected = question ? answers[question.id] : undefined;

  async function finish(nextAnswers: Record<string, string>) {
    const data = await submitQuiz(artifact.id, nextAnswers);
    setReport(data);
    await onRefresh();
  }

  function choose(key: string) {
    if (!question || selected) return;
    setAnswers({ ...answers, [question.id]: key });
  }

  if (!questions.length) return <EmptyState text="暂无测验题。" />;
  if (report) {
    return (
      <div className="space-y-4">
        <DetailTitle icon="◎" title="答题报告" />
        <ScoreRing score={report.score} total={report.total} />
        <TokenList title="需继续学习" items={report.missed_topics.length ? report.missed_topics : ["本轮没有明显薄弱点"]} />
        <TokenList title="继续学习建议" items={report.recommendations} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={`测验 ${index + 1}/${questions.length}`} />
      <div className="soft-card p-4">
        <p className="text-base font-semibold leading-7">{question.stem}</p>
      </div>
      <div className="space-y-2">
        {question.options.map((option) => {
          const isSelected = selected === option.key;
          const isAnswer = question.answer === option.key;
          const revealed = Boolean(selected);
          const style = revealed && isAnswer
            ? "border-[#8cc29e] bg-[#f0f9f2]"
            : revealed && isSelected
              ? "border-[#e2ad9d] bg-[#fff2ec]"
              : "border-[#edf0f7] bg-white hover:border-[#c7d5e7]";
          return (
            <button key={option.key} className={`w-full rounded-xl border p-3 text-left text-sm transition ${style}`} onClick={() => choose(option.key)}>
              <div className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#f1f3f4] text-xs font-semibold">{option.key}</span>
                <div>
                  <p className="font-medium leading-6">{option.text}</p>
                  {revealed ? <p className="mt-2 text-xs leading-5 text-[#5f6368]">{isAnswer ? "回答正确参考：" : isSelected ? "本项不正确：" : "解析："} {option.explanation}</p> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="soft-card p-4 text-sm leading-6">
          <p className={selected === question.answer ? "font-semibold text-[#28734d]" : "font-semibold text-[#9c3d25]"}>
            {selected === question.answer ? "回答正确" : `回答错误，正确答案是 ${question.answer}`}
          </p>
          <p className="mt-1 text-[#5f6368]">{question.explanation}</p>
          <button className="mt-3 rounded-full bg-[#303134] px-4 py-2 text-sm font-semibold text-white" onClick={() => {
            if (index + 1 >= questions.length) void finish(answers);
            else setIndex((current) => current + 1);
          }}>
            {index + 1 >= questions.length ? "查看报告" : "下一题"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MindMapView({ artifact, onAsk, onClose }: { artifact: Artifact; onAsk: (text: string) => void; onClose?: () => void }) {
  const root = (artifact.data as { root?: MindMapNode }).root;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => root ? { [root.id]: true } : {});
  const [zoom, setZoom] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => root ? buildMindMapLayout(root, expanded) : { nodes: [], edges: [], width: 760, height: 520 }, [expanded, root]);
  const sourceCount = typeof artifact.data.source_count === "number" ? artifact.data.source_count : 2;

  const fitView = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const nextZoom = Math.min(
      1,
      Math.max(0.48, Math.min((scroll.clientWidth - 76) / layout.width, (scroll.clientHeight - 140) / layout.height)),
    );
    setZoom(Number(nextZoom.toFixed(2)));
    window.requestAnimationFrame(() => {
      scroll.scrollLeft = Math.max(0, (layout.width * nextZoom - scroll.clientWidth) / 2);
      scroll.scrollTop = Math.max(0, (layout.height * nextZoom - scroll.clientHeight) / 2);
    });
  }, [layout.height, layout.width]);

  useEffect(() => {
    const timer = window.setTimeout(() => fitView(), 80);
    return () => window.clearTimeout(timer);
  }, [fitView]);

  if (!root) return <EmptyState text="暂无思维导图。" />;
  const mindMapRoot = root;

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(1.4, Math.max(0.45, Number((current + delta).toFixed(2)))));
  }

  function toggleFullscreen() {
    const element = canvasRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen().catch(() => undefined);
  }

  function serialize(node: MindMapNode, depth = 0): string {
    const prefix = depth === 0 ? "# " : `${"  ".repeat(depth - 1)}- `;
    const line = `${prefix}${node.label}${node.detail ? `：${node.detail}` : ""}`;
    return [line, ...(node.children ?? []).map((child) => serialize(child, depth + 1))].join("\n");
  }

  function downloadMindMap() {
    const blob = new Blob([serialize(mindMapRoot)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.title.replace(/[\\/:*?"<>|]/g, "_")}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  function expandAll(node: MindMapNode, acc: Record<string, boolean> = {}) {
    acc[node.id] = true;
    for (const child of node.children ?? []) expandAll(child, acc);
    return acc;
  }

  return (
    <div className="space-y-3">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      <div className="mindmap-canvas" ref={canvasRef}>
        <div className="mindmap-topbar">
          <div>
            <p className="mindmap-title">{artifact.title}</p>
            <button className="mindmap-source-link" type="button" onClick={() => onAsk(`请列出支撑“${artifact.title}”思维导图的关键来源和证据片段。`)}>
              查看 {sourceCount} 个来源
            </button>
          </div>
          <div className="mindmap-header-tools">
            <button className="mindmap-icon-button" type="button" title="全屏" onClick={toggleFullscreen}>⛶</button>
            <button className="mindmap-icon-button" type="button" title="关闭" onClick={onClose}>×</button>
            <div className="mindmap-more-wrap">
              <button className="mindmap-icon-button" type="button" title="更多" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>⋮</button>
              {menuOpen ? (
                <div className="mindmap-more-menu">
                  <button type="button" onClick={() => { setExpanded(expandAll(mindMapRoot)); setMenuOpen(false); }}>展开全部</button>
                  <button type="button" onClick={() => { setExpanded({ [mindMapRoot.id]: true }); setMenuOpen(false); }}>仅显示一级</button>
                  <button type="button" onClick={() => { fitView(); setMenuOpen(false); }}>适配画布</button>
                  <button type="button" onClick={downloadMindMap}>下载 Markdown</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mindmap-scroll" ref={scrollRef}>
          <div className="mindmap-stage-shell" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
            <div className="mindmap-stage" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
              <svg className="mindmap-lines" width={layout.width} height={layout.height} aria-hidden="true">
                {layout.edges.map((edge) => (
                  <path key={`${edge.from.node.id}-${edge.to.node.id}`} d={mindMapPath(edge.from, edge.to)} className={`mindmap-line mindmap-line-${edge.to.depth}`} />
                ))}
              </svg>
              {layout.nodes.map((item) => {
                const hasChildren = Boolean(item.node.children?.length);
                const open = Boolean(expanded[item.node.id]);
                return (
                  <div
                    key={item.node.id}
                    className={`mindmap-node-wrap mindmap-depth-${Math.min(item.depth, 2)}`}
                    style={{ left: item.x, top: item.y }}
                  >
                    <button className="mindmap-node" type="button" onClick={() => onAsk(`请基于来源解释思维导图节点：${item.node.label}`)}>
                      {item.node.label}
                    </button>
                    {hasChildren ? (
                      <button
                        className="mindmap-expand"
                        type="button"
                        onClick={() => setExpanded({ ...expanded, [item.node.id]: !open })}
                        title={open ? "收起" : "展开"}
                      >
                        {open ? "‹" : "›"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mindmap-floating-tools">
          <button type="button" title="适配画布" onClick={fitView}>⌄⌃</button>
          <span>
            <button type="button" title="放大" onClick={() => changeZoom(0.12)}>＋</button>
            <button type="button" title="缩小" onClick={() => changeZoom(-0.12)}>−</button>
          </span>
          <button type="button" title="下载" onClick={downloadMindMap}>⇩</button>
        </div>
      </div>
    </div>
  );
}

type MindLayoutItem = {
  node: MindMapNode;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function buildMindMapLayout(root: MindMapNode, expanded: Record<string, boolean>) {
  const columnGap = 255;
  const rowGap = 86;
  const leftPad = 64;
  const topPad = 126;
  const nodeWidth = 230;
  const nodeHeight = 54;
  const nodes: MindLayoutItem[] = [];
  let leaf = 0;
  let maxDepth = 0;

  function visit(node: MindMapNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const children = node.children ?? [];
    const open = Boolean(expanded[node.id]);
    let y: number;
    if (children.length && open) {
      const childYs = children.map((child) => visit(child, depth + 1));
      y = childYs.reduce((total, value) => total + value, 0) / childYs.length;
    } else {
      y = leaf * rowGap;
      leaf += 1;
    }
    nodes.push({
      node,
      depth,
      x: leftPad + depth * columnGap,
      y: topPad + y,
      width: nodeWidth,
      height: nodeHeight,
    });
    return y;
  }

  visit(root, 0);
  const lookup = new Map(nodes.map((item) => [item.node.id, item]));
  const edges: { from: MindLayoutItem; to: MindLayoutItem }[] = [];
  for (const item of nodes) {
    const children = item.node.children ?? [];
    const open = Boolean(expanded[item.node.id]);
    if (!open) continue;
    for (const child of children) {
      const target = lookup.get(child.id);
      if (target) edges.push({ from: item, to: target });
    }
  }

  return {
    nodes,
    edges,
    width: leftPad * 2 + (maxDepth + 1) * columnGap + nodeWidth,
    height: Math.max(520, topPad * 2 + Math.max(leaf, 1) * rowGap),
  };
}

function mindMapPath(from: MindLayoutItem, to: MindLayoutItem) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const curve = Math.max(80, (endX - startX) * 0.55);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

function QaView({ artifact, onAsk }: { artifact: Artifact; onAsk: (text: string) => void }) {
  const items = ((artifact.data as { items?: { question: string; answer: string; topic: string }[] }).items ?? []);
  return (
    <div className="space-y-3">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      {items.map((item) => (
        <button key={item.question} className="soft-card block w-full p-4 text-left transition hover:border-[#bfd0e4]" onClick={() => onAsk(item.question)}>
          <p className="text-sm font-semibold">{item.question}</p>
          <p className="mt-2 text-xs leading-6 text-[#5f6368]">{item.answer}</p>
        </button>
      ))}
    </div>
  );
}

function ReadingView({ artifact }: { artifact: Artifact }) {
  const items = ((artifact.data as { items?: { title: string; location: string; reason: string; snippet: string }[] }).items ?? []);
  return (
    <div className="space-y-3">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      {items.map((item) => (
        <div key={`${item.title}-${item.location}`} className="soft-card p-4">
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="mt-1 text-xs text-[#5f6368]">{item.location}</p>
          <p className="mt-2 text-xs leading-5 text-[#5f6368]">{item.reason}</p>
          <p className="mt-2 rounded-lg bg-[#f8fafd] p-2 text-xs leading-5 text-[#3c4043]">{item.snippet}</p>
        </div>
      ))}
    </div>
  );
}
