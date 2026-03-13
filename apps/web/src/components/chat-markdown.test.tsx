import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMarkdown } from "./chat-markdown.js";

describe("ChatMarkdown", () => {
  it("renders markdown, code blocks, and math content", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown
        content={`# Policy heading

- item one
- item two

\`inline code\`

\`\`\`ts
const policy = true;
\`\`\`

$$E=mc^2$$`}
      />,
    );

    expect(markup).toContain("<h1>Policy heading</h1>");
    expect(markup).toContain("<li>item one</li>");
    expect(markup).toContain("<code>inline code</code>");
    expect(markup).toContain("const policy = true;");
    expect(markup).toContain('class="katex');
  });

  it("renders a fallback when the message body is empty", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown content="   " emptyFallback="Streaming..." />,
    );

    expect(markup).toContain("<p>Streaming...</p>");
  });
});
