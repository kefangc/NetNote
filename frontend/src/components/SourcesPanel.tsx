"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { CollapseButton, PanelHeader, SplitPanelIcon } from "./Common";
import { Markdown } from "./Markdown";
import type { Source, WebCandidate } from "@/lib/types";

export function SourcesPanel({
  sources,
  searchInput,
  searchResults,
  busy,
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
  busy: string | null;
  onSearchInput: (value: string) => void;
  onUpload: (file: File) => void;
  onSearch: () => void;
  onAddCandidate: (candidate: WebCandidate) => Promise<void> | void;
  onAsk: (message: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string> | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<Record<string, "adding" | "added" | "failed">>({});
  const [researchStep, setResearchStep] = useState(0);
  const openSource = sources.find((source) => source.id === openSourceId);
  const isSearching = busy === "正在搜索补充来源";
  const isAdding = busy === "正在加入网络来源";
  const hasCompletedResearch = searchResults.length > 0 && !isSearching;
  const visibleResearchStep = isSearching || isAdding ? Math.max(researchStep, 1) : 0;
  const addableResults = searchResults.filter((item) => candidateStatus[item.url] !== "added");
  const selectedCount = selectedUrls
    ? addableResults.filter((item) => selectedUrls.has(item.url)).length
    : addableResults.length;
  const allSelected = searchResults.length > 0 && selectedCount === searchResults.length;
  const resultStats = useMemo(() => summarizeSearchResults(searchResults), [searchResults]);

  useEffect(() => {
    if (!isSearching && !isAdding) {
      return;
    }
    const maxStep = isAdding ? 5 : 4;
    const timer = window.setInterval(() => {
      setResearchStep((current) => Math.min(current + 1, maxStep));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [isAdding, isSearching, searchResults.length]);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setCandidateStatus({});
    setSelectedUrls(null);
    setResearchStep(1);
    onSearch();
  }

  function toggleCandidate(url: string) {
    setSelectedUrls((current) => {
      const next = new Set(current ?? searchResults.map((item) => item.url));
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    setSelectedUrls((current) => (current ? null : new Set()));
  }

  async function addSelected() {
    const selected = selectedUrls ? addableResults.filter((item) => selectedUrls.has(item.url)) : addableResults;
    for (const item of selected) {
      await addCandidate(item);
    }
  }

  async function addCandidate(item: WebCandidate) {
    setCandidateStatus((current) => ({ ...current, [item.url]: "adding" }));
    try {
      await onAddCandidate(item);
      setCandidateStatus((current) => ({ ...current, [item.url]: "added" }));
    } catch {
      setCandidateStatus((current) => ({ ...current, [item.url]: "failed" }));
    }
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
          <form className="web-search-form" onSubmit={submit}>
            <button className="mini-source-button" type="button" title="选择范围">🌐 Web⌄</button>
            <button className="mini-source-button" type="button" title="搜索方式">⌕ Fast Research⌄</button>
            <input
              className="web-search-input"
              value={searchInput}
              onChange={(event) => onSearchInput(event.target.value)}
              placeholder="输入关键词、问题或知识点"
            />
            <button className="search-round-button" title="搜索补充来源" aria-label="搜索补充来源">⌕</button>
          </form>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isSearching || isAdding ? (
          <ResearchProgressCard step={visibleResearchStep} isAdding={isAdding} />
        ) : null}

        {hasCompletedResearch ? (
          <ResearchCompleteCard
            query={searchInput}
            total={searchResults.length}
            domains={resultStats.domains}
            pdfCount={resultStats.pdfCount}
            selectedCount={selectedCount}
            onAdd={() => void addSelected()}
            disabled={!selectedCount}
          />
        ) : null}

        {searchResults.length ? (
          <div className="search-results-panel">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#202124]">搜索候选来源</p>
                <p className="text-xs text-[#6f7785]">勾选后加入当前课程知识库</p>
              </div>
              <button className="search-select-all" onClick={toggleAll}>
                全选 <span className={allSelected ? "checked-box checked-box-on" : "checked-box"}>✓</span>
              </button>
            </div>
            <div className="space-y-2">
              {searchResults.map((item) => (
                <SearchCandidate
                  key={item.url}
                  item={item}
                  status={candidateStatus[item.url]}
                  selected={selectedUrls ? selectedUrls.has(item.url) : true}
                  onToggle={() => toggleCandidate(item.url)}
                  onAdd={() => void addCandidate(item)}
                />
              ))}
            </div>
            <button className="add-selected-source" onClick={() => void addSelected()} disabled={!selectedCount}>
              加入所选来源
            </button>
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

function SearchCandidate({
  item,
  status,
  selected,
  onToggle,
  onAdd,
}: {
  item: WebCandidate;
  status?: "adding" | "added" | "failed";
  selected: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  const disabled = status === "adding" || status === "added";
  return (
    <div className={`search-candidate ${status === "added" ? "search-candidate-added" : ""}`}>
      <button className="search-candidate-check" onClick={onToggle} disabled={disabled} aria-label={`选择 ${item.title}`}>
        <span className={selected ? "checked-box checked-box-on" : "checked-box"}>✓</span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="candidate-domain">{item.domain || new URL(item.url).hostname}</span>
          <span className="candidate-provider">{item.source_provider || "web"}</span>
          {status ? <span className={`candidate-status candidate-status-${status}`}>{statusLabel(status)}</span> : null}
        </div>
        <p className="line-clamp-2 text-sm font-semibold leading-5 text-[#202124]">{item.title}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6f7785]">{item.snippet}</p>
        <p className="mt-1 truncate text-[11px] text-[#8a94a6]">{item.url}</p>
      </div>
      <div className="flex shrink-0 items-start">
        <button className="single-add-source" onClick={onAdd} disabled={disabled}>
          {status === "adding" ? "加入中" : status === "added" ? "已加入" : "加入"}
        </button>
      </div>
    </div>
  );
}

function ResearchProgressCard({ step, isAdding }: { step: number; isAdding: boolean }) {
  const current = Math.max(1, Math.min(step, 5));
  const text = isAdding
    ? current >= 5 ? "正在导入来源..." : `已完成第 ${Math.min(current, 4)} 步/共 5 步`
    : [
        "正在规划...请留在此页面",
        "已完成第 1 步/共 5 步",
        "已完成第 2 步/共 5 步",
        "正在研究网站...",
        "正在整理候选来源...",
      ][current - 1];
  return (
    <div className="research-progress-card">
      <span className="research-spinner" />
      <p>{text}</p>
      <span className="research-stop-button">■</span>
    </div>
  );
}

function ResearchCompleteCard({
  query,
  total,
  domains,
  pdfCount,
  selectedCount,
  onAdd,
  disabled,
}: {
  query: string;
  total: number;
  domains: string[];
  pdfCount: number;
  selectedCount: number;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <section className="research-complete-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="research-complete-icon">⌕</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-6">Deep Research 深度研究已完成！</p>
            <p className="line-clamp-2 text-xs leading-5 text-[#5f6368]">{query || "网络来源发现"}</p>
          </div>
        </div>
        <button className="research-look-button" type="button">查看</button>
      </div>
      <div className="research-complete-inner">
        <div className="space-y-3">
          {pdfCount ? (
            <div className="research-summary-row">
              <span className="research-file-icon research-file-pdf">PDF</span>
              <div>
                <p className="font-semibold">发现 {pdfCount} 个 PDF 来源</p>
                <p className="text-xs text-[#5f6368]">可加入知识库后生成引用和摘要</p>
              </div>
            </div>
          ) : null}
          <div className="research-summary-row">
            <span className="research-file-icon research-file-web">▣</span>
            <div>
              <p className="font-semibold">{total} 个热门来源</p>
              <p className="line-clamp-2 text-xs text-[#5f6368]">{domains.slice(0, 4).join("、") || "来自网络搜索候选"}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[#5f6368]">
            <button className="research-feedback-button" type="button">👍</button>
            <button className="research-feedback-button" type="button">👎</button>
          </div>
          <button className="research-import-button" onClick={onAdd} disabled={disabled}>
            ＋ 导入{selectedCount ? ` ${selectedCount}` : ""}
          </button>
        </div>
      </div>
    </section>
  );
}

function summarizeSearchResults(items: WebCandidate[]) {
  const domains = Array.from(new Set(items.map((item) => item.domain || safeDomain(item.url)).filter(Boolean)));
  const pdfCount = items.filter((item) => item.url.toLowerCase().includes(".pdf") || item.title.toLowerCase().includes(".pdf")).length;
  return { domains, pdfCount };
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

function statusLabel(status: "adding" | "added" | "failed") {
  return {
    adding: "加入中",
    added: "已加入",
    failed: "失败",
  }[status];
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <QualityPill source={source} />
            {source.kind === "web" && source.content_length ? <span className="source-meta-chip">{source.content_length} 字</span> : null}
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
  const [expanded, setExpanded] = useState(false);
  const keywords = source.chunks.flatMap((chunk) => chunk.keywords).filter(Boolean);
  const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 4);
  const guideText = source.summary || "这份来源已导入知识库。系统会围绕其中的核心概念、关键流程和易错点，为你生成问答、测验、抽认卡和思维导图。";
  const visibleChunks = expanded ? source.chunks : source.chunks.slice(0, 6);

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
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <QualityPill source={source} />
          <span className="source-meta-chip">{source.extraction_method}</span>
          <span className="source-meta-chip">{source.content_length || source.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)} 字</span>
          <span className="source-meta-chip">{source.chunks.length} chunks</span>
          {source.url ? (
            <a className="source-open-link" href={source.url} target="_blank" rel="noreferrer">
              打开原网页
            </a>
          ) : null}
        </div>
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
        <article className="mt-6 space-y-3 rounded-[18px] bg-white text-[15px] leading-7 text-[#2b2f33]">
          {visibleChunks.length ? (
            visibleChunks.map((chunk) => (
              <section key={chunk.id} className="source-chunk-card">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[#5f6368]">{chunk.location}</span>
                  {chunk.keywords.length ? <span className="truncate text-[11px] text-[#8a94a6]">{chunk.keywords.slice(0, 4).join(" / ")}</span> : null}
                </div>
                <p className="whitespace-pre-wrap">{chunk.text}</p>
              </section>
            ))
          ) : (
            <p>该来源暂无可预览文本。</p>
          )}
          {source.chunks.length > 6 ? (
            <button className="source-expand-button" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "收起" : `展开全部 ${source.chunks.length} 个片段`}
            </button>
          ) : null}
        </article>
      </div>
    </aside>
  );
}

function QualityPill({ source }: { source: Source }) {
  const status = source.extraction_status || "unknown";
  const label = {
    complete: "完整正文",
    partial: "部分正文",
    fallback: "摘要兜底",
    failed: "抓取失败",
    unknown: source.kind === "file" ? "文件来源" : source.kind === "seed" ? "种子来源" : "未知质量",
  }[status];
  return <span className={`quality-pill quality-${status}`}>{label}</span>;
}
