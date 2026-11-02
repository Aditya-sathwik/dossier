"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type LatexEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onCompile: () => void;
  compiling?: boolean;
  diagnostics?: string[];
  className?: string;
  "aria-label"?: string;
};

export function LatexEditor({
  value,
  onChange,
  onCompile,
  compiling = false,
  diagnostics = [],
  className,
  "aria-label": ariaLabel = "LaTeX source code editor",
}: LatexEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [showErrors, setShowErrors] = useState(true);

  // Synchronize gutter scrolling with textarea scrolling
  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleGutterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop += e.deltaY;
      textareaRef.current.scrollLeft += e.deltaX;
    }
  };

  // Keep error drawer open when new diagnostics arrive
  useEffect(() => {
    if (diagnostics.length > 0) {
      setShowErrors(true);
    }
  }, [diagnostics]);

  const lineCount = Math.max(1, value.split("\n").length);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+Enter or Ctrl+Enter to compile
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onCompile();
      return;
    }

    // Tab key inserts 2 spaces
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const updated = value.substring(0, start) + "  " + value.substring(end);

      onChange(updated);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn("flex flex-1 flex-col min-h-0 h-full overflow-hidden bg-card border border-line-card rounded-panel", className)}>
      <div className="relative flex flex-1 min-h-0 overflow-hidden font-mono text-[13px] leading-[20px]">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          onWheel={handleGutterWheel}
          className="w-11 shrink-0 select-none overflow-hidden bg-input/40 py-2.5 pr-2.5 text-right text-muted/60 border-r border-line h-full text-xs"
        >
          {lineNumbers.map((n) => (
            <div key={n} className="h-[20px] leading-[20px]">
              {n}
            </div>
          ))}
        </div>

        {/* Textarea Editor */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          placeholder="Type or paste your LaTeX code here..."
          className="flex-1 min-h-0 w-full h-full resize-none bg-transparent py-2.5 px-3 text-ink outline-none selection:bg-hover placeholder:text-muted/40 overflow-auto whitespace-pre tab-[2] scrollbar-subtle"
        />
      </div>

      {/* Compiler Diagnostic Error Drawer */}
      {diagnostics.length > 0 && (
        <div className="shrink-0 border-t border-danger/30 bg-danger-surface text-danger text-xs font-mono">
          <div className="flex items-center justify-between px-4 py-2 border-b border-danger/20">
            <span className="font-semibold flex items-center gap-1.5">
              <span>✕</span> Compiler Errors ({diagnostics.length})
            </span>
            <Button
              variant="text"
              size="sm"
              className="text-danger hover:text-danger hover:underline text-xs"
              onClick={() => setShowErrors(!showErrors)}
            >
              {showErrors ? "Hide" : "Show"}
            </Button>
          </div>
          {showErrors && (
            <div className="max-h-40 overflow-y-auto px-4 py-2.5 space-y-1 select-text">
              {diagnostics.map((err, idx) => (
                <div key={idx} className="leading-snug break-words">
                  {err}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

