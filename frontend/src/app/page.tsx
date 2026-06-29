"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { SourcesPanel } from "@/components/SourcesPanel";
import { StudioPanel } from "@/components/StudioPanel";
import { IconButton, StatusPill } from "@/components/Common";
import {
  addWebSources,
  generateArtifact,
  getWorkspace,
  importYnuLecture,
  loginYnuSource,
  searchWebSource,
  searchYnuCourses,
  streamChat,
  uploadSource,
} from "@/lib/api";
import type { Artifact, ArtifactKind, Message, SourceScope, WebCandidate, Workspace, YnuCourse } from "@/lib/types";
import { artifactLabel } from "@/lib/artifacts";

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sourceScope, setSourceScope] = useState<SourceScope>("web");
  const [searchResults, setSearchResults] = useState<WebCandidate[]>([]);
  const [ynuCourses, setYnuCourses] = useState<YnuCourse[]>([]);
  const [ynuSessionId, setYnuSessionId] = useState<string | null>(null);
  const [ynuMessage, setYnuMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [studioCollapsed, setStudioCollapsed] = useState(false);
  const [openStudioArtifact, setOpenStudioArtifact] = useState<Artifact | null>(null);
  const studioWide = !studioCollapsed && openStudioArtifact?.kind === "mindmap";
  const gridColumns = studioCollapsed
    ? `${sourcesCollapsed ? "64px" : "350px"} minmax(460px, 1fr) 76px`
    : studioWide
      ? `${sourcesCollapsed ? "64px" : "330px"} minmax(360px, 1fr) minmax(560px, 42vw)`
      : `${sourcesCollapsed ? "64px" : "350px"} minmax(460px, 1fr) 350px`;

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

  async function loginYnu(credentials: { username?: string; password?: string; cookie_header?: string }) {
    setBusy("正在登录云大学堂");
    try {
      const data = await loginYnuSource(credentials);
      setYnuSessionId(data.session_id);
      setYnuMessage(data.message);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "云大学堂登录失败");
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function searchYnu() {
    if (!ynuSessionId) {
      setError("请先连接云大学堂。");
      return;
    }
    setBusy("正在搜索云大学堂课程");
    setYnuCourses([]);
    try {
      const data = await searchYnuCourses({ session_id: ynuSessionId, query: searchInput || undefined });
      setYnuCourses(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "云大学堂课程搜索失败");
    } finally {
      setBusy(null);
    }
  }

  async function importYnu(course: YnuCourse) {
    if (!ynuSessionId) {
      setError("请先连接云大学堂。");
      return;
    }
    setBusy("正在导入云大学堂转写");
    try {
      setWorkspace(await importYnuLecture(ynuSessionId, course));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "云大学堂转写导入失败");
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function addCandidates(candidates: WebCandidate[]) {
    if (!candidates.length) return;
    setBusy("正在加入网络来源");
    try {
      setWorkspace(await addWebSources(candidates));
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量加入来源失败");
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
            <Image className="h-10 w-10 shrink-0 rounded-[10px] shadow-sm" src="/brand/netnote-icon.svg" alt="NetNote" width={40} height={40} priority />
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
            gridTemplateColumns: gridColumns,
          }}
        >
          <SourcesPanel
            sources={workspace?.sources ?? []}
            sourceScope={sourceScope}
            onSourceScopeChange={(scope) => {
              setSourceScope(scope);
              setSearchResults([]);
              setYnuCourses([]);
            }}
            searchInput={searchInput}
            searchResults={searchResults}
            ynuCourses={ynuCourses}
            ynuConnected={Boolean(ynuSessionId)}
            ynuMessage={ynuMessage}
            busy={busy}
            onSearchInput={setSearchInput}
            onUpload={(file) => void upload(file)}
            onSearch={() => void search()}
            onYnuLogin={(credentials) => loginYnu(credentials)}
            onYnuSearch={() => void searchYnu()}
            onImportYnuCourse={(course) => importYnu(course)}
            onClearSearch={() => setSearchResults([])}
            onAddCandidates={(candidates) => addCandidates(candidates)}
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
            onOpenArtifactChange={setOpenStudioArtifact}
          />
        </div>
      </div>
    </main>
  );
}
