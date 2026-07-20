"use client";

export type AgentActivityMode = "chat" | "resource";
export type AgentActivityPhase = "supervisor" | "profile" | "retrieval" | "generation" | "review";

const activityCopy: Record<AgentActivityMode, Record<AgentActivityPhase, string>> = {
  chat: {
    supervisor: "Supervisor 正在分析任务",
    profile: "画像 Agent 正在读取学习画像",
    retrieval: "检索 Agent 正在查找课程证据",
    generation: "辅导 Agent 正在组织回答",
    review: "检查 Agent 正在核验内容",
  },
  resource: {
    supervisor: "Supervisor 正在分析任务",
    profile: "画像 Agent 正在读取学习画像",
    retrieval: "检索 Agent 正在查找课程证据",
    generation: "资源 Agent 正在生成学习资源",
    review: "检查 Agent 正在核验内容",
  },
};

export function AgentActivityIsland({
  mode,
  phase,
}: {
  mode: AgentActivityMode;
  phase: AgentActivityPhase;
}) {
  const text = activityCopy[mode][phase];

  return (
    <div className="agent-island" role="status" aria-live="polite" data-testid="agent-activity-island">
      <span className="agent-island-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span key={text} className="agent-island-text">{text}</span>
      <span className="agent-island-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
