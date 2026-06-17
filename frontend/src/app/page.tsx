"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { SourcesPanel } from "@/components/SourcesPanel";
import { StudioPanel } from "@/components/StudioPanel";
import { IconButton, StatusPill } from "@/components/Common";
import {
  addWebSource,
  generateArtifact,
  getWorkspace,
  searchWebSource,
  streamChat,
  uploadSource,
} from "@/lib/api";
import type { ArtifactKind, Message, WebCandidate, Workspace } from "@/lib/types";
import { artifactLabel } from "@/lib/artifacts";

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<WebCandidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [studioCollapsed, setStudioCollapsed] = useState(false);

  async function refresh() {
    try {
      const data = await getWorkspace();
      setWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法连接后端");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  async function upload(file: File) {
    setBusy("正在导入来源");
    try {
      setWorkspace(await uploadSource(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "来源上传失败");
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    if (!searchInput.trim()) return;
    setBusy("正在搜索补充来源");
    setSearchResults([]);
    try {
      const data = await searchWebSource(searchInput);
      setSearchResults(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setBusy(null);
    }
  }

  async function addCandidate(candidate: WebCandidate) {
    setBusy("正在加入网络来源");
    try {
      setWorkspace(await addWebSource(candidate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入来源失败");
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage(content?: string) {
    const message = (content ?? chatInput).trim();
    if (!message) return;
    setChatInput("");
    setStreamingAnswer("");
    setBusy("AI 正在基于来源回答");
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: message,
      citations: [],
    };
    setWorkspace((current) => current ? { ...current, messages: [...current.messages, optimistic] } : current);
    try {
      await streamChat(message, setStreamingAnswer);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "聊天失败");
    } finally {
      setStreamingAnswer("");
      setBusy(null);
    }
  }

  async function generate(kind: ArtifactKind, prompt?: string) {
    setBusy(`正在生成 ${artifactLabel(kind)}`);
    try {
      await generateArtifact(kind, prompt || undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#eef0ff] text-[#202124]">
      <div className="flex h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#111] text-[17px] font-semibold text-white shadow-sm">AI</div>
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-medium tracking-[-0.01em]">{workspace?.course_title ?? "计算机网络"}</h1>
              <p className="mt-0.5 text-xs text-[#5f6368]">个性化资源生成与学习多智能体系统</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="hidden h-9 items-center gap-2 rounded-full bg-[#111] px-4 text-sm font-medium text-white shadow-sm sm:flex">
              <span className="text-lg leading-none">＋</span>
              新建笔记本
            </button>
            <button className="top-button">分享</button>
            <button className="top-button">设置</button>
            <StatusPill tone={busy ? "working" : "ready"} label={busy ?? "已保存"} />
            <IconButton label="刷新" symbol="↻" onClick={() => void refresh()} />
          </div>
        </header>

        {error ? (
          <div className="shrink-0 border-b border-[#e8b8a9] bg-[#fff1ec] px-5 py-2 text-sm text-[#8b2d16]">{error}</div>
        ) : null}

        <div
          className="grid min-h-0 flex-1 gap-4 px-4 pb-4"
          style={{
            gridTemplateColumns: `${sourcesCollapsed ? "64px" : "350px"} minmax(460px, 1fr) ${studioCollapsed ? "76px" : "350px"}`,
          }}
        >
          <SourcesPanel
            sources={workspace?.sources ?? []}
            searchInput={searchInput}
            searchResults={searchResults}
            busy={busy}
            onSearchInput={setSearchInput}
            onUpload={(file) => void upload(file)}
            onSearch={() => void search()}
            onClearSearch={() => setSearchResults([])}
            onAddCandidate={(candidate) => addCandidate(candidate)}
            onAsk={(message) => void sendMessage(message)}
            collapsed={sourcesCollapsed}
            onCollapse={() => setSourcesCollapsed(true)}
            onExpand={() => setSourcesCollapsed(false)}
          />
          <ChatPanel
            messages={workspace?.messages ?? []}
            input={chatInput}
            streamingAnswer={streamingAnswer}
            isThinking={busy === "AI 正在基于来源回答" && !streamingAnswer}
            onInput={setChatInput}
            onSend={(message) => void sendMessage(message)}
          />
          <StudioPanel
            artifacts={workspace?.artifacts ?? []}
            profile={workspace?.profile}
            busy={busy}
            onGenerate={(kind, prompt) => void generate(kind, prompt)}
            onAsk={(text) => void sendMessage(text)}
            onRefresh={refresh}
            collapsed={studioCollapsed}
            onCollapse={() => setStudioCollapsed(true)}
            onExpand={() => setStudioCollapsed(false)}
          />
        </div>
      </div>
    </main>
  );
}
