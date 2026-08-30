import type { ReactNode } from "react";

/** Lightweight Markdown display. Does not interpret engineering meaning. */
export function renderMemoMarkdown(source: string): ReactNode {
  const text = source.replace(/\r\n/g, "\n");
  if (!text.trim()) return null;

  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  const flushParagraph = (buffer: string[]) => {
    const body = buffer.join("\n").trim();
    if (!body) return;
    const key = `p-${index++}`;
    blocks.push(
      <p key={key} className="memo-md__p">
        {inline(body)}
      </p>,
    );
  };

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const fence: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        fence.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`pre-${index++}`} className="memo-md__pre">
          <code>{fence.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3}) (.+)$/);
    if (heading) {
      const Tag = (heading[1].length === 1 ? "h4" : heading[1].length === 2 ? "h5" : "h6") as "h4" | "h5" | "h6";
      blocks.push(
        <Tag key={`h-${index++}`} className="memo-md__heading">
          {inline(heading[2])}
        </Tag>,
      );
      i += 1;
      continue;
    }
    if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^[-*] /.test(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\. / : /^[-*] /, ""));
        i += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={`l-${index++}`} className="memo-md__list">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const buffer = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !/^```/.test(lines[i]) && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i])) {
      buffer.push(lines[i]);
      i += 1;
    }
    flushParagraph(buffer);
  }

  return blocks;
}

function inline(value: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
}
