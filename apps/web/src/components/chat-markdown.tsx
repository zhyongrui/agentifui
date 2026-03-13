"use client";

import React from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

type ChatMarkdownProps = {
  content: string;
  emptyFallback?: string;
};

const markdownComponents: Components = {
  a({ children, href }) {
    return (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
};

export function ChatMarkdown({
  content,
  emptyFallback = "",
}: ChatMarkdownProps) {
  const normalizedContent = content.trim();

  if (normalizedContent.length === 0) {
    return emptyFallback ? <p>{emptyFallback}</p> : null;
  }

  return (
    <div className="chat-markdown">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
