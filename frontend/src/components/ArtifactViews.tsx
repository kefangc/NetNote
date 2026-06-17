"use client";

import { useState } from "react";
import { DetailTitle, EmptyState, ScoreRing, TokenList } from "./Common";
import { Markdown } from "./Markdown";
import { artifactIcon } from "@/lib/artifacts";
import { reviewFlashcard, submitQuiz } from "@/lib/api";
import type { Artifact, Flashcard, MindMapNode, Profile, QuizQuestion } from "@/lib/types";

export function ArtifactDetail({
  artifact,
  profile,
  onAsk,
  onRefresh,
}: {
  artifact: Artifact;
  profile?: Profile;
  onAsk: (text: string) => void;
  onRefresh: () => Promise<void>;
}) {
  if (artifact.kind === "summary") return <SummaryView artifact={artifact} profile={profile} />;
  if (artifact.kind === "flashcards") return <FlashcardsView artifact={artifact} onRefresh={onRefresh} />;
  if (artifact.kind === "quiz") return <QuizView artifact={artifact} onRefresh={onRefresh} />;
  if (artifact.kind === "mindmap") return <MindMapView artifact={artifact} onAsk={onAsk} />;
  if (artifact.kind === "qa") return <QaView artifact={artifact} onAsk={onAsk} />;
  if (artifact.kind === "reading") return <ReadingView artifact={artifact} />;
  return <EmptyState text="暂不支持该生成物。" />;
}

function SummaryView({ artifact, profile }: { artifact: Artifact; profile?: Profile }) {
  const data = artifact.data as { overview?: string; key_concepts?: string[]; suggested_artifacts?: string[] };
  return (
    <div className="space-y-4">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      <div className="soft-card p-4">
        <Markdown text={data.overview ?? ""} />
      </div>
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

function MindMapView({ artifact, onAsk }: { artifact: Artifact; onAsk: (text: string) => void }) {
  const root = (artifact.data as { root?: MindMapNode }).root;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  if (!root) return <EmptyState text="暂无思维导图。" />;
  return (
    <div className="space-y-3">
      <DetailTitle icon={artifactIcon(artifact.kind)} title={artifact.title} />
      <div className="mindmap-canvas">
        <div className="mb-3 flex items-center justify-end gap-2">
          <span className="canvas-tool">−</span>
          <span className="canvas-tool">⛶</span>
          <span className="canvas-tool">↓</span>
        </div>
        <MindNode node={root} expanded={expanded} setExpanded={setExpanded} onAsk={onAsk} depth={0} />
      </div>
    </div>
  );
}

function MindNode({
  node,
  expanded,
  setExpanded,
  onAsk,
  depth,
}: {
  node: MindMapNode;
  expanded: Record<string, boolean>;
  setExpanded: (value: Record<string, boolean>) => void;
  onAsk: (text: string) => void;
  depth: number;
}) {
  const open = Boolean(expanded[node.id]);
  const hasChildren = Boolean(node.children?.length);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
        <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#dadce0] bg-white text-xs font-semibold text-[#5f6368]" onClick={() => setExpanded({ ...expanded, [node.id]: !open })} title={open ? "收起" : "展开"}>
          {hasChildren ? (open ? "−" : "›") : "·"}
        </button>
        <button className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold shadow-sm ${depth === 0 ? "border-[#c5cae9] bg-[#eef0ff] text-[#3153a4]" : "border-[#c7d5e7] bg-[#f6f9fd] text-[#315482]"}`} onClick={() => onAsk(`请基于来源解释思维导图节点：${node.label}`)}>
          {node.label}
        </button>
      </div>
      {open && node.detail ? <p className="ml-10 mt-1 text-xs leading-5 text-[#5f6368]">{node.detail}</p> : null}
      {open ? node.children?.map((child) => (
        <MindNode key={child.id} node={child} expanded={expanded} setExpanded={setExpanded} onAsk={onAsk} depth={depth + 1} />
      )) : null}
    </div>
  );
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
