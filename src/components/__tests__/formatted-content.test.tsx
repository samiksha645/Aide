import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, it, expect } from "vitest";
import { FormattedContent } from "@/components/ChatArea";

const SAMPLE_MARKDOWN = [
  "# Project Notes", // heading
  "",
  "This is **bold** text with `inline_code`.", // bold + inline code
  "",
  "- First item",
  "- Second item", // unordered list
  "",
  "| Tool | Status |",
  "| ---- | ------ |",
  "| web  | done   |", // GFM table
  "",
  "```javascript",
  "const answer = 42;",
  "```", // fenced code block
].join("\n");

describe("FormattedContent (assistant message rendering)", () => {
  const html = renderToStaticMarkup(
    React.createElement(FormattedContent, { content: SAMPLE_MARKDOWN })
  );

  it("renders headings", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Project Notes");
  });

  it("renders bold text", () => {
    expect(html).toContain("<strong");
    expect(html).toContain("bold");
  });

  it("renders inline code as a chip", () => {
    expect(html).toContain("inline_code");
  });

  it("renders unordered lists", () => {
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("First item");
  });

  it("renders GFM tables", () => {
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("web");
  });

  it("syntax-highlights fenced code blocks with hljs tokens", () => {
    expect(html).toContain("hljs");
    expect(html).toContain("hljs-keyword"); // `const` should be a highlighted token
    expect(html).toContain("answer");
  });

  it("keeps the code block chrome (language label + copy button)", () => {
    expect(html).toContain("javascript"); // language badge from CodeBlock
    expect(html).toContain("Copy");
  });

  it("does NOT wrap assistant content in a dark bubble", () => {
    expect(html).not.toContain("rounded-2xl rounded-tl-sm"); // old bubble class
    expect(html).toContain("aide-prose");
  });

  it("wraps <pre> so CodeBlock owns the chrome (no nested pre)", () => {
    expect((html.match(/<pre/g) || []).length).toBe(1);
  });
});
