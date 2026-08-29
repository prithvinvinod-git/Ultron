"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Markdown = memo(function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <div className="chat-markdown text-[14.5px] leading-relaxed text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
});