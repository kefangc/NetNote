"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArtifactDetail } from "./ArtifactViews";
import { CollapseButton, GeneratingCard, PanelHeader, SplitPanelIcon } from "./Common";
import { artifactIcon, artifactKinds, artifactLabel, studioStyle } from "@/lib/artifacts";
import type { Artifact, ArtifactKind, Profile } from "@/lib/types";

export function StudioPanel({
  artifacts,
  profile,
  busy,
  onGenerate,
  onAsk,
  onRefresh,
  collapsed,
  onCollapse,
  onExpand,
  onOpenArtifactChange,
}: {
  artifacts: Artifact[];
  profile?: Profile;
  busy: string | null;
  onGenerate: (kind: ArtifactKind, prompt?: string) => void;
  onAsk: (text: string) => void;
  onRefresh: () => Promise<void>;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onOpenArtifactChange?: (artifact: Artifact | null) => void;
}) {
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  const [customKind, setCustomKind] = useState<ArtifactKind | null>(null);
  const visibleArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.kind !== "summary" || artifact.data.manual === true),
    [artifacts],
  );
  const openArtifact = useMemo(() => visibleArtifacts.find((artifact) => artifact.id === openArtifactId), [visibleArtifacts, openArtifactId]);

  useEffect(() => {
    onOpenArtifactChange?.(openArtifact ?? null);
  }, [onOpenArtifactChange, openArtifact]);

  if (collapsed) {
    return (
      <>
        <CollapsedStudio
          artifacts={visibleArtifacts}
          onExpand={onExpand}
          onGenerate={(kind) => onGenerate(kind)}
          onCustomize={(kind) => setCustomKind(kind)}
          onOpen={(id) => {
            setOpenArtifactId(id);
            onExpand();
          }}
        />
        {customKind ? (
          <CustomGenerateDialog
            kind={customKind}
            onClose={() => setCustomKind(null)}
            onGenerate={(prompt) => {
              setCustomKind(null);
              onGenerate(customKind, prompt);
            }}
          />
        ) : null}
      </>
    );
  }

  if (openArtifact) {
    return (
      <aside className="panel flex min-h-0 flex-col studio-enter">
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#edf0f7] px-3">
          <button className="grid h-9 w-9 place-items-center rounded-full text-lg text-[#5f6368] hover:bg-[#f1f3f4]" onClick={() => setOpenArtifactId(null)} title="返回 Studio">
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-medium">{openArtifact.title}</p>
            <p className="text-xs text-[#5f6368]">{artifactLabel(openArtifact.kind)}</p>
          </div>
          <CollapseButton label="收起 Studio" onClick={onCollapse} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
          <ArtifactDetail artifact={openArtifact} profile={profile} onAsk={onAsk} onRefresh={onRefresh} onClose={() => setOpenArtifactId(null)} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel relative flex min-h-0 flex-col">
      <PanelHeader title="Studio" action={<CollapseButton label="收起 Studio" onClick={onCollapse} />} />
      <div className="border-b border-[#edf0f7] p-4">
        <div className="grid grid-cols-2 gap-3">
          {artifactKinds.map((kind) => (
            <StudioTool
              key={kind}
              kind={kind}
              onGenerate={() => onGenerate(kind)}
              onCustomize={() => setCustomKind(kind)}
            />
          ))}
        </div>
      </div>
      {customKind ? (
        <CustomGeneratePopover
          kind={customKind}
          onClose={() => setCustomKind(null)}
          onGenerate={(prompt) => {
            setCustomKind(null);
            onGenerate(customKind, prompt);
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {busy?.startsWith("正在生成") ? <GeneratingCard label={busy} /> : null}
        <div className="space-y-2">
        {visibleArtifacts.map((artifact) => (
            <ArtifactListItem key={artifact.id} artifact={artifact} onClick={() => setOpenArtifactId(artifact.id)} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function CollapsedStudio({
  artifacts,
  onExpand,
  onGenerate,
  onCustomize,
  onOpen,
}: {
  artifacts: Artifact[];
  onExpand: () => void;
  onGenerate: (kind: ArtifactKind) => void;
  onCustomize: (kind: ArtifactKind) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <aside className="collapsed-rail panel">
      <button className="collapsed-panel-button" onClick={onExpand} title="展开 Studio" aria-label="展开 Studio">
        <SplitPanelIcon />
      </button>
      <div className="rail-divider" />
      <div className="rail-stack">
        {artifactKinds.map((kind) => (
          <div key={kind} className="relative">
            <button className={`collapsed-studio-tool ${studioStyle(kind).bg} ${studioStyle(kind).text}`} onClick={() => onGenerate(kind)} title={artifactLabel(kind)}>
              {artifactIcon(kind)}
            </button>
            <button className="collapsed-plus" onClick={() => onCustomize(kind)} title={`自定义${artifactLabel(kind)}`}>＋</button>
          </div>
        ))}
      </div>
      <div className="rail-divider" />
      <div className="rail-history">
        {artifacts.slice(0, 8).map((artifact) => (
          <button key={artifact.id} className="collapsed-icon" onClick={() => onOpen(artifact.id)} title={artifact.title}>
            {artifactIcon(artifact.kind)}
          </button>
        ))}
      </div>
      <button className="collapsed-note-button" onClick={onExpand} title="添加笔记" aria-label="添加笔记">
        <span>▤</span>
        <small>＋</small>
      </button>
    </aside>
  );
}

function StudioTool({ kind, onGenerate, onCustomize }: { kind: ArtifactKind; onGenerate: () => void; onCustomize: () => void }) {
  const style = studioStyle(kind);
  return (
    <div className={`studio-tool ${style.bg}`}>
      <button type="button" className={`studio-main-button ${style.text}`} title={`生成${artifactLabel(kind)}`} onClick={onGenerate}>
        <span className="studio-tool-icon">{artifactIcon(kind)}</span>
        <span className="studio-tool-label">{artifactLabel(kind)}</span>
      </button>
      <button
        type="button"
        className="studio-arrow"
        onClick={(event) => {
          event.stopPropagation();
          onCustomize();
        }}
        title={`自定义${artifactLabel(kind)}`}
        aria-label={`自定义${artifactLabel(kind)}`}
      >
        ›
      </button>
    </div>
  );
}

function CustomGeneratePopover({
  kind,
  onClose,
  onGenerate,
}: {
  kind: ArtifactKind;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [amount, setAmount] = useState("标准（默认）");
  const [difficulty, setDifficulty] = useState("中等（默认）");

  function submit(event: FormEvent) {
    event.preventDefault();
    const options = kind === "flashcards" || kind === "quiz"
      ? `数量：${amount}；难度：${difficulty}。`
      : "";
    onGenerate([options, prompt.trim()].filter(Boolean).join("\n"));
  }

  return (
    <form className="custom-popover" onSubmit={submit}>
      <div className="custom-popover-arrow" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#202124]">自定义{artifactLabel(kind)}</p>
          <p className="mt-1 text-xs leading-5 text-[#6b7280]">基于您的来源生成，可补充主题、章节或难度要求。</p>
        </div>
        <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg text-[#5f6368] hover:bg-[#f1f3f4]" type="button" onClick={onClose}>×</button>
      </div>
      {kind === "flashcards" || kind === "quiz" ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <CompactSelect title={kind === "quiz" ? "问题数量" : "卡片数量"} value={amount} onChange={setAmount} options={["更少", "标准（默认）", "更多"]} />
          <CompactSelect title="难度" value={difficulty} onChange={setDifficulty} options={["简单", "中等（默认）", "困难"]} />
        </div>
      ) : null}
      <textarea
        className="custom-popover-textarea"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={`主题应该是什么？例如：围绕“${artifactLabel(kind)}”只生成传输层相关内容`}
        autoFocus
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="custom-popover-secondary" onClick={onClose}>取消</button>
        <button className="custom-popover-primary">生成</button>
      </div>
    </form>
  );
}

function CompactSelect({
  title,
  value,
  onChange,
  options,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-[#5f6368]">
      {title}
      <select className="custom-popover-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ArtifactListItem({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  return (
    <button className="block w-full rounded-xl border border-transparent bg-white p-3 text-left transition hover:bg-[#f8fafd]" onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">{artifactIcon(artifact.kind)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{artifact.title}</p>
          <p className="mt-1 text-xs text-[#5f6368]">{artifactLabel(artifact.kind)} / {artifact.status}</p>
        </div>
        <span className="text-lg text-[#9aa0a6]">⋮</span>
      </div>
    </button>
  );
}

function CustomGenerateDialog({
  kind,
  onClose,
  onGenerate,
}: {
  kind: ArtifactKind;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [amount, setAmount] = useState("标准（默认）");
  const [difficulty, setDifficulty] = useState("中等（默认）");
  const examples = [
    `${artifactLabel(kind)}必须仅限于当前来源中的一个特定章节`,
    `围绕我最薄弱的知识点生成${artifactLabel(kind)}`,
    `用适合考试复习的方式组织${artifactLabel(kind)}`,
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    const options = kind === "flashcards" || kind === "quiz"
      ? `数量：${amount}；难度：${difficulty}。`
      : "";
    onGenerate([options, prompt.trim()].filter(Boolean).join("\n"));
  }

  return (
    <div className="modal-backdrop">
      <form className="custom-dialog" onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-[#edf0f7] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">{artifactIcon(kind)}</span>
            <h3 className="text-xl font-medium">自定义{artifactLabel(kind)}</h3>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full text-xl text-[#5f6368] hover:bg-[#f1f3f4]" type="button" onClick={onClose}>×</button>
        </div>
        <div className="space-y-4 p-6">
          {kind === "flashcards" || kind === "quiz" ? (
            <div className="grid grid-cols-2 gap-12">
              <SegmentGroup
                title={kind === "quiz" ? "问题数量" : "卡片数量"}
                options={["更少", "标准（默认）", "更多"]}
                value={amount}
                onChange={setAmount}
              />
              <SegmentGroup
                title="难度等级"
                options={["简单", "中等（默认）", "困难"]}
                value={difficulty}
                onChange={setDifficulty}
              />
            </div>
          ) : null}
          <label className="text-sm text-[#5f6368]">主题应该是什么？</label>
          <textarea
            className="custom-textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={`示例提示\n• ${examples[0]}\n• ${examples[1]}\n• ${examples[2]}`}
            autoFocus
          />
          <div className="flex justify-end">
            <button className="rounded-full bg-[#3f5df5] px-6 py-2.5 text-sm font-semibold text-white shadow-sm">生成</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SegmentGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-[#5f6368]">{title}</p>
      <div className="flex gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`custom-segment ${value === option ? "custom-segment-active" : ""}`}
            onClick={() => onChange(option)}
          >
            {value === option ? "✓ " : ""}{option}
          </button>
        ))}
      </div>
    </div>
  );
}
