"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef } from "react";
import { IconButton } from "./Common";
import { Markdown } from "./Markdown";
import type { Message } from "@/lib/types";

export function ChatPanel({
  messages,
  input,
  streamingAnswer,
  isThinking,
  onInput,
  onSend,
}: {
  messages: Message[];
  input: string;
  streamingAnswer: string;
  isThinking: boolean;
  onInput: (value: string) => void;
  onSend: (message?: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = messages.filter((message) => message.role !== "summary");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleMessages.length, streamingAnswer, isThinking]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  return (
    <section className="panel chat-stage min-h-0">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[#edf0f7] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[17px] font-medium">聊天</h2>
            <div className="flex gap-1.5">
              <IconButton label="展开" symbol="⛶" onClick={() => undefined} />
              <IconButton label="更多" symbol="⋮" onClick={() => undefined} />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {visibleMessages.length ? (
            <div className="space-y-4">
              {visibleMessages.map((message) => <ChatBubble key={message.id} message={message} />)}
            </div>
          ) : (
            <WelcomeChat onAsk={onSend} />
          )}

          {isThinking ? <ThinkingCard /> : null}

          {streamingAnswer ? (
            <div className="mt-4 max-w-[820px] rounded-2xl border border-[#d9e3de] bg-white p-4 text-sm leading-7 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#2a6c61]">
                <span className="typing-dot" />
                AI 正在生成
              </div>
              <Markdown text={streamingAnswer} />
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form className="shrink-0 bg-white px-4 pb-4 pt-2" onSubmit={submit}>
          <div className="composer">
            <input
              className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#9a9287]"
              value={input}
              onChange={(event) => onInput(event.target.value)}
              placeholder="基于来源提问，或从右侧卡片/思维导图继续追问"
            />
            <button className="send-button" title="发送问题">↑</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ThinkingCard() {
  return (
    <div className="mt-4 flex max-w-[820px] items-center gap-3 rounded-2xl border border-[#d9e3de] bg-white p-4 shadow-sm">
      <Image className="thinking-logo" src="/brand/netnote-icon.svg" alt="NetNote" width={34} height={34} />
      <div className="thinking-text">Thinking</div>
    </div>
  );
}

function WelcomeChat({ onAsk }: { onAsk: (text: string) => void }) {
  const prompts = ["解释 TCP 三次握手", "生成 DNS 流程复习提纲", "我应该先复习哪些薄弱点？"];
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-[#111] text-2xl font-semibold text-white shadow-sm">AI</div>
      <h3 className="text-2xl font-medium">开始和你的课程来源对话</h3>
      <p className="mt-3 max-w-xl text-sm leading-7 text-[#5f6368]">
        上传课件、论文、题库或使用网络补充来源，然后让系统基于证据回答、生成测验、抽认卡和思维导图。
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-[#dadce0] bg-white px-4 py-2 text-sm font-medium text-[#3c4043] transition hover:bg-[#f8fafd]"
            onClick={() => onAsk(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[820px] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm ${isUser ? "bg-[#303134] text-white" : "border border-[#edf0f7] bg-white text-[#202124]"}`}>
        <Markdown text={message.content} />
        {message.citations.length ? (
          <div className="mt-3 space-y-1 border-t border-[#edf0f7] pt-2 text-xs text-[#5f6368]">
            {message.citations.map((citation, index) => (
              <p key={`${citation.source_id}-${citation.location}`} className="rounded-md bg-[#f1f3ff] px-2 py-1">
                [{index + 1}] {citation.source_title} / {citation.location}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
