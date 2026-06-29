"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactDetail } from "./ArtifactViews";
import { CollapseButton, GeneratingCard, PanelHeader, SplitPanelIcon } from "./Common";
import { deleteArtifact, renameArtifact, shareArtifact } from "@/lib/api";
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
  const [menuArtifactId, setMenuArtifactId] = useState<string | null>(null);
  const [renamingArtifactId, setRenamingArtifactId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRenameId, setSavingRenameId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const visibleArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.kind !== "summary" || artifact.data.manual === true),
    [artifacts],
  );
  const openArtifact = useMemo(() => visibleArtifacts.find((artifact) => artifact.id === openArtifactId), [visibleArtifacts, openArtifactId]);

  useEffect(() => {
    onOpenArtifactChange?.(openArtifact ?? null);
  }, [onOpenArtifactChange, openArtifact]);

  useEffect(() => {
    if (!menuArtifactId) return;
    function closeOnBlank(event: PointerEvent) {
      const target = event.target as Element | null;
      if (target?.closest(".studio-artifact-menu, .studio-artifact-more")) return;
      setMenuArtifactId(null);
    }
    document.addEventListener("pointerdown", closeOnBlank);
    return () => document.removeEventListener("pointerdown", closeOnBlank);
  }, [menuArtifactId]);

  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  async function shareExistingArtifact(artifact: Artifact) {
    setMenuArtifactId(null);
    const result = await shareArtifact(artifact.id);
    try {
      await navigator.clipboard.writeText(result.share_url);
      setActionNotice("分享链接已复制到剪贴板");
    } catch {
      setActionNotice(`分享链接已生成：${result.share_url}`);
    }
    await onRefresh();
  }

  function startRenameArtifact(artifact: Artifact) {
    setMenuArtifactId(null);
    setRenamingArtifactId(artifact.id);
    setRenameDraft(artifact.title);
  }

  function cancelRenameArtifact() {
    setRenamingArtifactId(null);
    setRenameDraft("");
  }

  async function commitRenameArtifact(artifact: Artifact) {
    const title = renameDraft.trim();
    if (!title || title === artifact.title) {
      cancelRenameArtifact();
      return;
    }
    setSavingRenameId(artifact.id);
    try {
      await renameArtifact(artifact.id, title);
      await onRefresh();
      setActionNotice("名称已更新");
      cancelRenameArtifact();
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "重命名失败");
    } finally {
      setSavingRenameId(null);
    }
  }

  async function deleteExistingArtifact(artifact: Artifact) {
    if (!window.confirm(`删除“${artifact.title}”？`)) return;
    setMenuArtifactId(null);
    if (renamingArtifactId === artifact.id) cancelRenameArtifact();
    if (openArtifactId === artifact.id) setOpenArtifactId(null);
    await deleteArtifact(artifact.id);
    setActionNotice("资源已删除");
    await onRefresh();
  }

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
          customKind === "presentation" ? (
            <CustomPresentationDialog
              onClose={() => setCustomKind(null)}
              onGenerate={(prompt) => {
                setCustomKind(null);
                onGenerate("presentation", prompt);
              }}
            />
          ) : (
            <CustomGenerateDialog
              kind={customKind}
              onClose={() => setCustomKind(null)}
              onGenerate={(prompt) => {
                setCustomKind(null);
                onGenerate(customKind, prompt);
              }}
            />
          )
        ) : null}
      </>
    );
  }

  if (openArtifact) {
    if (openArtifact.kind === "presentation") {
      return (
        <aside className="panel flex min-h-0 flex-col studio-enter">
          <div className="min-h-0 flex-1 bg-white">
            <ArtifactDetail artifact={openArtifact} profile={profile} onAsk={onAsk} onRefresh={onRefresh} onClose={() => setOpenArtifactId(null)} onCollapse={onCollapse} />
          </div>
        </aside>
      );
    }

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
          <ArtifactDetail artifact={openArtifact} profile={profile} onAsk={onAsk} onRefresh={onRefresh} onClose={() => setOpenArtifactId(null)} onCollapse={onCollapse} />
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
        customKind === "presentation" ? (
          <CustomPresentationDialog
            onClose={() => setCustomKind(null)}
            onGenerate={(prompt) => {
              setCustomKind(null);
              onGenerate("presentation", prompt);
            }}
          />
        ) : (
          <CustomGeneratePopover
            kind={customKind}
            onClose={() => setCustomKind(null)}
            onGenerate={(prompt) => {
              setCustomKind(null);
              onGenerate(customKind, prompt);
            }}
          />
        )
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {busy?.startsWith("正在生成") ? <GeneratingCard label={busy} /> : null}
        <div className="space-y-2">
          {visibleArtifacts.map((artifact) => (
            <ArtifactListItem
              key={artifact.id}
              artifact={artifact}
              menuOpen={menuArtifactId === artifact.id}
              renaming={renamingArtifactId === artifact.id}
              renameDraft={renameDraft}
              savingRename={savingRenameId === artifact.id}
              onClick={() => setOpenArtifactId(artifact.id)}
              onToggleMenu={() => setMenuArtifactId((current) => current === artifact.id ? null : artifact.id)}
              onCloseMenu={() => setMenuArtifactId(null)}
              onShare={() => void shareExistingArtifact(artifact)}
              onRename={() => startRenameArtifact(artifact)}
              onRenameDraftChange={setRenameDraft}
              onCommitRename={() => void commitRenameArtifact(artifact)}
              onCancelRename={cancelRenameArtifact}
              onDelete={() => void deleteExistingArtifact(artifact)}
              onCustomize={() => {
                setMenuArtifactId(null);
                setCustomKind(artifact.kind);
              }}
              onPlay={() => {
                setMenuArtifactId(null);
                setOpenArtifactId(artifact.id);
              }}
            />
          ))}
        </div>
      </div>
      {actionNotice ? <div className="studio-action-toast" role="status">{actionNotice}</div> : null}
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

function CustomPresentationDialog({ onClose, onGenerate }: { onClose: () => void; onGenerate: (prompt: string) => void }) {
  const [format, setFormat] = useState<"detailed" | "slides">("detailed");
  const [language, setLanguage] = useState("中文");
  const [duration, setDuration] = useState("默认");
  const [prompt, setPrompt] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const formatLabel = format === "detailed" ? "详细演示文稿：包含全文和详情，适合独立阅读或发送" : "演示用幻灯片：简洁直观，适合现场讲解";
    onGenerate([
      `格式：${formatLabel}`,
      `语言：${language}`,
      `时长：${duration}`,
      prompt.trim() ? `补充要求：${prompt.trim()}` : "",
    ].filter(Boolean).join("\n"));
  }

  return (
    <div className="modal-backdrop">
      <form className="presentation-custom-dialog" onSubmit={submit}>
        <div className="presentation-custom-header">
          <div className="flex items-center gap-3">
            <span className="text-xl text-[#7b641f]">{artifactIcon("presentation")}</span>
            <h3>自定义演示文稿</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div className="presentation-custom-body">
          <p className="presentation-custom-label">格式</p>
          <div className="presentation-format-grid">
            <button type="button" className={`presentation-format-card ${format === "detailed" ? "presentation-format-card-active" : ""}`} onClick={() => setFormat("detailed")}>
              <span>详细演示文稿</span>
              <strong>✓</strong>
              <p>一整套包含全文和详情的演示文稿，非常适合通过邮件发送或单独阅读。</p>
            </button>
            <button type="button" className={`presentation-format-card ${format === "slides" ? "presentation-format-card-active" : ""}`} onClick={() => setFormat("slides")}>
              <span>演示用幻灯片</span>
              <strong>✓</strong>
              <p>简洁直观的幻灯片，附带要介绍的重点，为您的演讲提供全程支持。</p>
            </button>
          </div>
          <div className="presentation-custom-grid">
            <label>
              <span>选择语言</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option>中文</option>
                <option>English</option>
              </select>
            </label>
            <label>
              <span>时长</span>
              <div className="presentation-duration">
                {["短", "默认", "长"].map((item) => (
                  <button key={item} type="button" className={duration === item ? "presentation-duration-active" : ""} onClick={() => setDuration(item)}>
                    {duration === item ? "✓ " : ""}{item}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <label className="presentation-prompt">
            <span>请描述您要创建的演示文稿</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="添加一份概略提纲，或指定受众、风格和重点：“为新手用户创建一套演示文稿，采用大胆活泼的风格，注重分步说明。”"
              autoFocus
            />
          </label>
        </div>
        <div className="presentation-custom-footer">
          <button>生成</button>
        </div>
      </form>
    </div>
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

function ArtifactListItem({
  artifact,
  menuOpen,
  renaming,
  renameDraft,
  savingRename,
  onClick,
  onToggleMenu,
  onCloseMenu,
  onShare,
  onRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onDelete,
  onCustomize,
  onPlay,
}: {
  artifact: Artifact;
  menuOpen: boolean;
  renaming: boolean;
  renameDraft: string;
  savingRename: boolean;
  onClick: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onShare: () => void;
  onRename: () => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onCustomize: () => void;
  onPlay: () => void;
}) {
  const isPresentation = artifact.kind === "presentation";
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ignoreNextBlurRef = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renaming]);

  return (
    <div className={`studio-artifact-item ${renaming ? "studio-artifact-item-renaming" : ""}`}>
      {renaming ? (
        <>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">{artifactIcon(artifact.kind)}</div>
          <div className="min-w-0 flex-1">
            <input
              ref={renameInputRef}
              className="studio-artifact-rename-input"
              value={renameDraft}
              disabled={savingRename}
              aria-label={`重命名 ${artifact.title}`}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onBlur={() => {
                if (ignoreNextBlurRef.current) {
                  ignoreNextBlurRef.current = false;
                  return;
                }
                onCommitRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCommitRename();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  ignoreNextBlurRef.current = true;
                  onCancelRename();
                }
              }}
            />
            <p className="mt-1 text-xs text-[#5f6368]">{savingRename ? "正在保存..." : "回车保存，Esc 取消"}</p>
          </div>
        </>
      ) : (
        <button className="studio-artifact-open" type="button" onClick={onClick}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">{artifactIcon(artifact.kind)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{artifact.title}</p>
            <p className="mt-1 text-xs text-[#5f6368]">{artifactLabel(artifact.kind)} / {artifact.status}</p>
          </div>
        </button>
      )}
      <button
        type="button"
        className="studio-artifact-more"
        title="更多"
        aria-label={`${artifact.title} 更多操作`}
        aria-expanded={menuOpen}
        disabled={renaming || savingRename}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const menuWidth = isPresentation ? 320 : 238;
          const menuHeight = isPresentation ? 492 : 260;
          const margin = 16;
          const minTop = isPresentation ? 112 : 96;
          setMenuPosition({
            left: Math.min(Math.max(rect.right - menuWidth, margin), window.innerWidth - menuWidth - margin),
            top: Math.min(Math.max(rect.bottom - menuHeight + 8, minTop), window.innerHeight - menuHeight - margin),
          });
          onToggleMenu();
        }}
      >
        ⋮
      </button>
      {menuOpen ? (
        <div className={`studio-artifact-menu ${isPresentation ? "studio-artifact-menu-presentation" : ""}`} style={menuPosition ?? undefined}>
          <button type="button" onClick={onShare}><MenuIcon name="share" />分享</button>
          <button type="button" onClick={onRename}><MenuIcon name="rename" />重命名</button>
          {isPresentation ? (
            <>
              <button type="button" onClick={onCloseMenu}><MenuIcon name="pdf" />下载 PDF 文档 (.pdf)</button>
              <button type="button" onClick={onCloseMenu}><MenuIcon name="powerpoint" />下载 PowerPoint (.pptx)</button>
              <button type="button" onClick={onPlay}><MenuIcon name="play" />开始播放幻灯片</button>
              <button type="button" onClick={onCustomize}><MenuIcon name="modify" />修改</button>
            </>
          ) : null}
          <button type="button" onClick={onCloseMenu}><MenuIcon name="sources" />查看提示和来源</button>
          <button type="button" onClick={onDelete}><MenuIcon name="delete" />删除</button>
        </div>
      ) : null}
    </div>
  );
}

function MenuIcon({ name }: { name: "share" | "rename" | "pdf" | "powerpoint" | "play" | "modify" | "sources" | "delete" }) {
  if (name === "pdf" || name === "powerpoint") {
    return (
      <span className="studio-artifact-menu-file-icon" aria-hidden="true">
        {name === "pdf" ? "PDF" : "P"}
      </span>
    );
  }

  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.2,
  };

  return (
    <span className="studio-artifact-menu-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {name === "share" ? (
          <>
            <circle cx="18" cy="5" r="2.6" {...common} />
            <circle cx="6" cy="12" r="2.6" {...common} />
            <circle cx="18" cy="19" r="2.6" {...common} />
            <path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6" {...common} />
          </>
        ) : null}
        {name === "rename" ? (
          <>
            <path d="M4 20h4.4L19.2 9.2a2.4 2.4 0 0 0-3.4-3.4L5 16.6 4 20Z" {...common} />
            <path d="m14.5 7.1 2.4 2.4" {...common} />
          </>
        ) : null}
        {name === "play" ? <path d="M8 5.5v13l10-6.5-10-6.5Z" {...common} /> : null}
        {name === "modify" ? (
          <>
            <path d="M4 20h4.1L19 9.1a2.2 2.2 0 0 0-3.1-3.1L5 16.9 4 20Z" {...common} />
            <path d="m14.2 7.7 2.1 2.1M6.7 5.2l.7-1.7.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7ZM17.8 15.1l.6-1.4.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" {...common} />
          </>
        ) : null}
        {name === "sources" ? (
          <>
            <path d="M12 22a9 9 0 1 1 9-9" {...common} />
            <path d="M12 8v5l3 2M18.8 17.2v4M16.8 19.2h4" {...common} />
            <path d="M18.4 4.5l1.1-2.2 1.1 2.2 2.2 1.1-2.2 1.1-1.1 2.2-1.1-2.2-2.2-1.1 2.2-1.1Z" {...common} />
          </>
        ) : null}
        {name === "delete" ? (
          <>
            <path d="M5 7h14M10 11v6M14 11v6M7 7l1 14h8l1-14M9 7V4h6v3" {...common} />
          </>
        ) : null}
      </svg>
    </span>
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
