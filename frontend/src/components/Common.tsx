import type { ReactNode } from "react";

export function PanelHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#edf0f7] px-4">
      <div>
        <h2 className="text-[17px] font-medium">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[#5f6368]">{subtitle}</p> : null}
      </div>
      {action ? <div className="text-lg text-[#5f6368]">{action}</div> : null}
    </div>
  );
}

export function CollapseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="collapse-button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <SplitPanelIcon />
    </button>
  );
}

export function SplitPanelIcon() {
  return (
    <span className="split-panel-icon" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

export function IconButton({ label, symbol, onClick }: { label: string; symbol: string; onClick: () => void }) {
  return (
    <button
      className="grid h-9 w-9 place-items-center rounded-full bg-white text-base text-[#5f6368] shadow-sm transition hover:bg-[#f8fafd]"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {symbol}
    </button>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "neutral" | "ready" | "working" }) {
  const toneClass = {
    neutral: "bg-white text-[#5f6368]",
    ready: "bg-[#e7f1ec] text-[#27614f]",
    working: "bg-[#fff3c7] text-[#856416]",
  }[tone];
  return <span className={`hidden rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex ${toneClass}`}>{label}</span>;
}

export function DetailTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f1f3f4] text-base text-[#5f6368]">{icon}</span>
      <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-[#202124]">{title}</h3>
    </div>
  );
}

export function TokenList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[#5f6368]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-[#edf0f7] bg-white px-2.5 py-1 text-xs text-[#3c4043] shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ScoreRing({ score, total }: { score: number; total: number }) {
  const percent = total ? Math.round((score / total) * 100) : 0;
  return (
    <div className="soft-card flex items-center gap-4 p-4">
      <div className="grid h-24 w-24 place-items-center rounded-full shadow-inner" style={{ background: `conic-gradient(#315482 ${percent}%, #e2ddd4 0)` }}>
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-semibold">{percent}%</div>
      </div>
      <div>
        <p className="text-2xl font-semibold">{score}/{total}</p>
        <p className="text-sm text-[#5f6368]">本轮学习表现</p>
      </div>
    </div>
  );
}

export function GeneratingCard({ label }: { label: string }) {
  return (
    <div className="mb-3 rounded-xl border border-[#c9ddd6] bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="thinking-green-dot" />
        <p className="text-sm font-semibold text-[#2a6c61]">AI 正在生成</p>
        <span className="text-xs text-[#5f6368]">{label.replace("正在生成", "")}</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="skeleton-line w-[92%]" />
        <div className="skeleton-line w-[70%]" />
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#dadce0] bg-white p-5 text-sm leading-6 text-[#5f6368]">{text}</div>;
}
