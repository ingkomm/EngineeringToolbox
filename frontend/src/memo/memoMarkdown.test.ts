import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMemoMarkdown } from "./memoMarkdown";

describe("memo markdown", () => {
  it("renders bold and headings without executing anything", () => {
    const html = renderToStaticMarkup(renderMemoMarkdown("# Title\n\n**bold** and *em*"));
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
  });

  it("renders lists without requiring blank lines", () => {
    const html = renderToStaticMarkup(renderMemoMarkdown("# Title\n- a\n- b\n1. one"));
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("a");
    expect(html).toContain("one");
  });
});
