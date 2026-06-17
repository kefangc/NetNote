"use client";

import { ChangeEvent, FormEvent, useRef } from "react";
import { useState } from "react";
import { CollapseButton, PanelHeader, SplitPanelIcon } from "./Common";
import { Markdown } from "./Markdown";
import type { Source, WebCandidate } from "@/lib/types";

export function SourcesPanel({
  sources,
  searchInput,
  searchResults,
  onSearchInput,
  onUpload,
  onSearch,
  onAddCandidate,
  onAsk,
  collapsed,
  onCollapse,
  onExpand,
}: {
  sources: Source[];
  searchInput: string;
  searchResults: WebCandidate[];
  onSearchInput: (value: string) => void;
  onUpload: (file: File) => void;
  onSearch: () => void;
  onAddCandidate: (candidate: WebCandidate) => void;
  onAsk: (message: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const openSource = sources.find((source) => source.id === openSourceId);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch();
  }

  if (collapsed) {
    return (
      <>
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.png,.jpg,.jpeg"
          onChange={upload}
        />
        <CollapsedSources
          sources={sources}
          onExpand={onExpand}
          onUpload={() => fileRef.current?.click()}
          onOpen={(id) => {
            setOpenSourceId(id);
            onExpand();
          }}
        />
      </>
    );
  }

  if (openSource) {
    return <SourceDetail source={openSource} onBack={() => setOpenSourceId(null)} onAsk={onAsk} onCollapse={onCollapse} />;
  }

  return (
    <aside className="panel flex min-h-0 flex-col">
      <PanelHeader title="来源" action={<CollapseButton label="收起来源" onClick={onCollapse} />} />
      <div className="space-y-3 border-b border-[#edf0f7] p-3">
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.png,.jpg,.jpeg"
          onChange={upload}
        />
        <button className="source-add-button" onClick={() => fileRef.current?.click()} title="导入来源">
          <span className="text-lg">＋</span>
          <span>添加来源</span>
        </button>

        <div className="web-source-card">
          <p className="text-sm font-medium text-[#3c4043]">在网络中搜索新来源</p>
          <form className="mt-4 flex items-center gap-2" onSubmit={submit}>
            <button className="mini-source-button" type="button" title="选择范围">🌐⌄</button>
            <button className="mini-source-button" type="button" title="搜索方式">⌕⌄</button>
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa0a6]"
              value={searchInput}
              onChange={(event) => onSearchInput(event.target.value)}
            />
            <button className="search-round-button" title="搜索补充来源">⌕</button>
          </form>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {searchResults.length ? (
          <div className="mb-3 rounded-xl border border-[#d9dfec] bg-[#f6f8fc] p-2">
            <div className="mb-2 px-1 text-xs font-semibold text-[#50627f]">搜索候选</div>
            <div className="space-y-2">
              {searchResults.map((item) => (
                <SearchCandidate key={item.url} item={item} onAdd={() => onAddCandidate(item)} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {sources.map((source) => (
            <SourceItem key={source.id} source={source} onClick={() => setOpenSourceId(source.id)} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function CollapsedSources({
  sources,
  onExpand,
  onUpload,
  onOpen,
}: {
  sources: Source[];
  onExpand: () => void;
  onUpload: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <aside className="collapsed-rail panel">
      <button className="collapsed-panel-button" onClick={onExpand} title="展开来源" aria-label="展开来源">
        <SplitPanelIcon />
      </button>
      <div className="rail-divider" />
      <button className="collapsed-add-button" onClick={onUpload} title="添加来源" aria-label="添加来源">＋</button>
      <div className="rail-history">
        {sources.slice(0, 8).map((source) => (
          <button key={source.id} className="collapsed-icon" onClick={() => onOpen(source.id)} title={source.title}>
            {source.kind === "web" ? "⌕" : source.kind === "seed" ? "◇" : source.title.toLowerCase().endsWith(".pdf") ? "PDF" : "▣"}
          </button>
        ))}
      </div>
    </aside>
  );
}

function SearchCandidate({ item, onAdd }: { item: WebCandidate; onAdd: () => void }) {
  return (
    <div className="rounded-lg border border-[#d8deea] bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-5">{item.title}</p>
        <button className="shrink-0 rounded-md bg-[#e8eef9] px-2 py-1 text-xs font-semibold text-[#315482]" onClick={onAdd}>
          加入
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#706b64]">{item.snippet}</p>
    </div>
  );
}

function SourceItem({ source, onClick }: { source: Source; onClick: () => void }) {
  const isReady = source.status === "ready";
  const symbol = source.kind === "web" ? "⌕" : source.kind === "seed" ? "◇" : "▣";
  return (
    <button className="group w-full rounded-xl border border-transparent bg-white p-3 text-left transition hover:bg-[#f8fafd]" onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-sm text-[#5f6368]">{symbol}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{source.title}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${isReady ? "bg-[#e7f1ec] text-[#27614f]" : "bg-[#fff3c7] text-[#856416]"}`}>
              {isReady ? "ready" : source.status}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#716a61]">{source.error || source.summary}</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#91887d]">
            <span>{source.kind}</span>
            <span>•</span>
            <span>{source.chunks.length} chunks</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function SourceDetail({ source, onBack, onAsk, onCollapse }: { source: Source; onBack: () => void; onAsk: (message: string) => void; onCollapse: () => void }) {
  const keywords = source.chunks.flatMap((chunk) => chunk.keywords).filter(Boolean);
  const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 4);
  const guideText = source.summary || "这份来源已导入知识库。系统会围绕其中的核心概念、关键流程和易错点，为你生成问答、测验、抽认卡和思维导图。";
  const content = source.chunks.map((chunk) => chunk.text).join("\n\n").trim();

  return (
    <aside className="panel flex min-h-0 flex-col source-detail-enter">
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#edf0f7] px-3">
        <button className="grid h-9 w-9 place-items-center rounded-full text-lg text-[#5f6368] hover:bg-[#f1f3f4]" onClick={onBack} title="返回来源列表">‹</button>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-medium">来源</p>
        </div>
        <CollapseButton label="收起来源" onClick={onCollapse} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-white p-6">
        <h2 className="mb-5 text-[28px] font-medium leading-tight tracking-[-0.02em]">{source.title}</h2>
        <section className="source-guide-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span>✦</span>
              来源指南
            </div>
            <span className="text-lg text-[#5f6368]">⌃</span>
          </div>
          <div className="source-guide-markdown max-h-[330px] overflow-y-auto pr-2 text-[15px] font-medium leading-8 text-[#3c4043]">
            <Markdown text={guideText} />
          </div>
          {uniqueKeywords.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {uniqueKeywords.map((keyword) => (
                <button
                  key={keyword}
                  className="rounded-full border border-[#d8deea] bg-[#f8fafd] px-4 py-2 text-sm font-semibold text-[#3c4043] transition hover:border-[#9db7d5] hover:bg-white"
                  onClick={() => onAsk(`请基于来源《${source.title}》解释“${keyword}”，并说明它和本课程学习目标的关系。`)}
                  title={`向 AI 提问：${keyword}`}
                >
                  {keyword}...
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <article className="mt-6 rounded-[18px] bg-white text-[17px] leading-8 text-[#2b2f33]">
          {content ? (
            content.split("\n\n").slice(0, 10).map((paragraph, index) => (
              <p key={index} className="mb-5">{paragraph}</p>
            ))
          ) : (
            <p>该来源暂无可预览文本。</p>
          )}
        </article>
      </div>
    </aside>
  );
}
