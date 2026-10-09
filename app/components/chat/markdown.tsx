"use client";

import { isValidElement, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { HtmlPreview, VisualizationBlock, parseVizSpec } from "@/app/components/chat/visual-block";

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : String(children ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="group/code relative">
      <button
        onClick={() => void copy()}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border bg-surface-2/90 px-2 py-1 text-[11px] text-mist opacity-0 transition group-hover/code:opacity-100 hover:border-border-strong hover:text-ink"
        aria-label="Copy code"
        title="Copy code"
      >
        {copied ? <Check size={12} className="text-good" /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className={className}>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <div className="chat-markdown text-[14.5px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children, ...props }) => {
            const language = className?.replace("language-", "");
            const source = String(children).replace(/\\n$/, "");
            if (language === "ultron-viz") {
              const spec = parseVizSpec(source);
              return spec ? <VisualizationBlock spec={spec} /> : <code className={className} {...props}>{children}</code>;
            }
            if (language === "html" || language === "html-preview") {
              return <HtmlPreview source={source} />;
            }
            return <code className={className} {...props}>{children}</code>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
