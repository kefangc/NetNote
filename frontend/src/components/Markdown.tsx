import type { ReactNode } from "react";

type CodeFence = { lang: string; lines: string[] };

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[0-9]+\])/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (/^\[[0-9]+\]$/.test(part)) {
      return <span key={index} className="citation-chip">{part}</span>;
    }
    return part;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let list: ReactNode[] = [];
  let ordered = false;
  let codeFence: CodeFence | null = null;
  let tableRows: string[][] = [];

  function flushList() {
    if (!list.length) return;
    const Tag = ordered ? "ol" : "ul";
    nodes.push(
      <Tag key={`list-${nodes.length}`} className={ordered ? "markdown-ol" : "markdown-ul"}>
        {list}
      </Tag>,
    );
    list = [];
  }

  function isSeparatorRow(cells: string[]) {
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
  }

  function parseTableLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) {
      const looseCells = trimmed.split(/\s{2,}|\t+/).map((cell) => cell.trim()).filter(Boolean);
      return looseCells.length >= 3 ? looseCells : null;
    }
    const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const cells = normalized.split("|").map((cell) => cell.trim());
    return cells.length >= 2 ? cells : null;
  }

  function flushTable() {
    if (!tableRows.length) return;
    const rows = tableRows.filter((row) => !isSeparatorRow(row));
    const [head, ...body] = rows;
    if (head) {
      nodes.push(
        <div key={`table-${nodes.length}`} className="markdown-table-wrap">
          <table className="markdown-table">
            <thead>
              <tr>
                {head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {head.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    tableRows = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      flushList();
      flushTable();
      if (codeFence) {
        nodes.push(
          <div key={`code-${index}`} className="markdown-codeblock">
            <div className="markdown-codebar">
              <span>{codeFence.lang || "code"}</span>
              <span>复制</span>
            </div>
            <pre><code>{codeFence.lines.join("\n")}</code></pre>
          </div>,
        );
        codeFence = null;
      } else {
        codeFence = { lang: fence[1].trim(), lines: [] };
      }
      return;
    }
    if (codeFence) {
      codeFence.lines.push(line);
      return;
    }
    const tableLine = parseTableLine(line);
    if (tableLine) {
      flushList();
      tableRows.push(tableLine);
      return;
    }
    if (!trimmed) {
      flushList();
      flushTable();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      flushTable();
      const level = heading[1].length;
      const className = level === 1 ? "markdown-h1" : level === 2 ? "markdown-h2" : "markdown-h3";
      nodes.push(<div key={index} className={className}>{inline(heading[2])}</div>);
      return;
    }
    const unordered = trimmed.match(/^[-*]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^[0-9]+[.)]\s+(.*)$/);
    if (unordered || orderedMatch) {
      flushTable();
      const isOrdered = Boolean(orderedMatch);
      if (list.length && ordered !== isOrdered) flushList();
      ordered = isOrdered;
      list.push(<li key={index}>{inline((unordered || orderedMatch)?.[1] ?? "")}</li>);
      return;
    }
    flushList();
    flushTable();
    nodes.push(<p key={index}>{inline(trimmed)}</p>);
  });
  flushList();
  flushTable();
  const remainingFence = codeFence as CodeFence | null;
  if (remainingFence) {
    nodes.push(
      <div key="code-tail" className="markdown-codeblock">
        <div className="markdown-codebar">
          <span>{remainingFence.lang || "code"}</span>
          <span>复制</span>
        </div>
        <pre><code>{remainingFence.lines.join("\n")}</code></pre>
      </div>,
    );
  }

  return <div className="markdown-body">{nodes}</div>;
}
