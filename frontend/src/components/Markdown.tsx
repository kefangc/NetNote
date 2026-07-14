import type { ReactNode } from "react";
import katex from "katex";

type CodeFence = { lang: string; lines: string[] };
type MathFence = { delimiter: "$$" | "\\["; lines: string[] };

function math(latex: string, displayMode: boolean, key: string | number) {
  const html = katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
    trust: false,
  });

  return (
    <span
      key={key}
      className={displayMode ? "markdown-math markdown-math-display" : "markdown-math"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function inline(text: string): ReactNode[] {
  const parts = text.split(
    /(\\\((?:\\.|[^\\\n])*?\\\)|(?<!\\)\$(?!\$)(?=\S)(?:\\.|[^$\\\n])*?(?<!\s)(?<!\\)\$|\*\*[^*]+\*\*|`[^`]+`|\[[0-9]+\])/g,
  );
  return parts.map((part, index) => {
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      return math(part.slice(2, -2), false, index);
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return math(part.slice(1, -1), false, index);
    }
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

function isBareFormula(text: string) {
  return (
    /^[\sA-Za-z0-9_{}^+\-*/=<>≤≥(),.\\]+$/.test(text) &&
    /(?:=|≤|≥|<|>|\\(?:le|ge|neq|approx|sim))/.test(text)
  );
}

function normalizeLatex(latex: string) {
  return latex.replace(/\s+/g, "").replace(/\\(?:displaystyle|left|right)/g, "");
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let list: ReactNode[] = [];
  let ordered = false;
  let codeFence: CodeFence | null = null;
  let mathFence: MathFence | null = null;
  let tableRows: string[][] = [];
  let canSkipFormulaEcho = false;
  let lastDisplayMath = "";

  function pushDisplayMath(latex: string, key: string | number) {
    nodes.push(math(latex, true, key));
    canSkipFormulaEcho = true;
    lastDisplayMath = normalizeLatex(latex);
  }

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

  lines.forEach((rawLine, index) => {
    // Model answers sometimes put display-math delimiters inside a blockquote.
    // Treat the quote marker as Markdown structure instead of formula content.
    const line = rawLine.replace(/^\s*>\s?/, "");
    const trimmed = line.trim();
    if (codeFence) {
      const closingFence = trimmed.match(/^```(.*)$/);
      if (closingFence) {
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
        codeFence.lines.push(line);
      }
      return;
    }
    if (mathFence) {
      const closingDelimiter = mathFence.delimiter === "$$" ? "$$" : "\\]";
      if (trimmed === closingDelimiter) {
        pushDisplayMath(mathFence.lines.join("\n"), `math-${index}`);
        mathFence = null;
      } else {
        mathFence.lines.push(line);
      }
      return;
    }
    const fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      flushList();
      flushTable();
      codeFence = { lang: fence[1].trim(), lines: [] };
      canSkipFormulaEcho = false;
      return;
    }
    const standaloneInlineMath = trimmed.match(/^\\\(\s*(.+?)\s*\\\)$/) || trimmed.match(/^\$(?!\$)\s*(.+?)\s*\$$/);
    if (canSkipFormulaEcho && standaloneInlineMath && normalizeLatex(standaloneInlineMath[1]) === lastDisplayMath) {
      canSkipFormulaEcho = false;
      return;
    }
    const inlineDisplayMath = trimmed.match(/^\$\$\s*(.+?)\s*\$\$$/) || trimmed.match(/^\\\[\s*(.+?)\s*\\\]$/);
    if (inlineDisplayMath) {
      flushList();
      flushTable();
      pushDisplayMath(inlineDisplayMath[1], `math-${index}`);
      return;
    }
    if (trimmed === "$$" || trimmed === "\\[") {
      flushList();
      flushTable();
      mathFence = { delimiter: trimmed as MathFence["delimiter"], lines: [] };
      return;
    }
    if (canSkipFormulaEcho && isBareFormula(trimmed)) {
      canSkipFormulaEcho = false;
      return;
    }
    if (trimmed) canSkipFormulaEcho = false;
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
  const remainingMathFence = mathFence as MathFence | null;
  if (remainingMathFence) {
    pushDisplayMath(remainingMathFence.lines.join("\n"), "math-tail");
  }

  return <div className="markdown-body">{nodes}</div>;
}
