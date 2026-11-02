"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, FileCode, Loader2, MessageSquare, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { computeLineDiff } from "@/lib/diff";

export type AgentComment = {
  id: string;
  label: string;
  text: string;
};

export type AgentProgressStep = {
  name: string;
  status: "pending" | "running" | "done" | "error";
};

export type AgentProgressConsoleProps = {
  title?: string;
  agentName?: string;
  steps: AgentProgressStep[];
  comments?: AgentComment[];
  originalCode?: string | null;
  updatedCode?: string | null;
  latexStatus?: "none" | "tailored" | "fallback";
  latexError?: string | null;
  isDone?: boolean;
  onCompleteAction?: () => void;
  completeActionLabel?: string;
  className?: string;
};

/**
 * Reusable Antigravity-style agent progress console:
 * - Real step progression indicator with live status announcements.
 * - Displays actual candidate comments read and applied by the agent.
 * - Honest post-generation diff viewer between original base code and tailored output.
 * - LaTeX compile fallback warning if compilation fails.
 */
export function AgentProgressConsole({
  title = "Agent Workspace",
  agentName = "Tailor Agent",
  steps,
  comments = [],
  originalCode,
  updatedCode,
  latexStatus = "none",
  latexError,
  isDone = false,
  onCompleteAction,
  completeActionLabel = "View application →",
  className,
}: AgentProgressConsoleProps) {
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [showAllDiff, setShowAllDiff] = useState(false);

  // Compute diff once code is available
  const diffResult = useMemo(() => {
    if (!originalCode || !updatedCode) return null;
    return computeLineDiff(originalCode, updatedCode, {
      contextLines: showAllDiff ? Number.POSITIVE_INFINITY : 3,
    });
  }, [originalCode, updatedCode, showAllDiff]);

  const diffStats = useMemo(() => {
    if (!diffResult) return null;
    let added = 0;
    let removed = 0;
    for (const l of diffResult.lines) {
      if (l.type === "add") added++;
      if (l.type === "remove") removed++;
    }
    return { added, removed };
  }, [diffResult]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col rounded-lg border border-border-subtle bg-elevation/70 text-body font-mono text-xs shadow-sm overflow-hidden",
        className,
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-elevation px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted" aria-hidden="true" />
          <span className="font-semibold text-emphasis">{title}</span>
          <span className="rounded bg-interactive/10 px-1.5 py-0.5 text-[10px] text-interactive font-medium">
            {agentName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDone ? (
            <span className="inline-flex items-center gap-1.5 text-accent font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Done
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-interactive font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Working…
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Comments Read Section */}
        {comments.length > 0 && (
          <div className="rounded border border-border-subtle bg-background/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setCommentsOpen((open) => !open)}
              aria-expanded={commentsOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-left font-sans text-xs font-medium text-muted hover:bg-elevation/50"
            >
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>
                  Candidate instructions read ({comments.length} item{comments.length > 1 ? "s" : ""})
                </span>
              </div>
              {commentsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {commentsOpen && (
              <div className="flex flex-col gap-2 border-t border-border-subtle p-3 font-sans">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded border-l-2 border-accent bg-elevation/40 px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-emphasis">{comment.label}: </span>
                    <span className="text-body whitespace-pre-wrap">{comment.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Steps Progression */}
        <div className="flex flex-col gap-1.5" data-testid="agent-progress-steps">
          {steps.map((s, idx) => (
            <div key={`${s.name}-${idx}`} className="flex items-center gap-2">
              {s.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-accent flex-none" aria-hidden="true" />}
              {s.status === "running" && (
                <Loader2 className="h-3.5 w-3.5 text-interactive animate-spin motion-reduce:animate-none flex-none" aria-hidden="true" />
              )}
              {s.status === "pending" && <span className="h-3.5 w-3.5 rounded-full border border-border-subtle flex-none" />}
              {s.status === "error" && <span className="h-3.5 w-3.5 rounded-full bg-error flex-none" />}
              <span
                data-step-name={s.name}
                className={cn(
                  s.status === "running" && "font-semibold text-emphasis",
                  s.status === "done" && "text-muted",
                  s.status === "pending" && "text-muted/60",
                  s.status === "error" && "text-error font-medium",
                )}
              >
                {`[Agent] ${s.name}`}
              </span>
            </div>
          ))}
        </div>

        {/* Fallback Notice */}
        {latexStatus === "fallback" && (
          <div role="alert" className="rounded border border-error/40 bg-error/10 p-3 font-sans text-xs text-error">
            <p className="font-medium">LaTeX tailoring failed compilation; using base resume.</p>
            {latexError && <p className="mt-1 text-[11px] font-mono text-error/90">{latexError}</p>}
          </div>
        )}

        {/* Diff View (rendered when done and tailored code exists) */}
        {diffResult && (
          <div className="flex flex-col gap-2 rounded border border-border-subtle bg-background/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-sans font-medium text-emphasis">
                <FileCode className="h-3.5 w-3.5 text-interactive" aria-hidden="true" />
                <span>Tailored LaTeX changes</span>
                {diffStats && (
                  <span className="ml-1 text-[11px] font-mono text-muted">
                    (<span className="text-accent">+{diffStats.added}</span>{" "}
                    <span className="text-error">-{diffStats.removed}</span> lines)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAllDiff((v) => !v)}
                className="text-[11px] text-interactive hover:underline"
              >
                {showAllDiff ? "Collapse context" : "Show all"}
              </button>
            </div>

            <pre className="max-h-[360px] overflow-x-auto overflow-y-auto rounded bg-background p-2.5 text-[11px] leading-relaxed select-text font-mono border border-border-subtle">
              {diffResult.lines.map((l, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex min-w-full px-1 py-0.5",
                    l.type === "add" && "bg-accent/15 text-accent font-medium",
                    l.type === "remove" && "bg-error/15 text-error font-medium",
                    l.type === "omitted" && "text-muted/60 italic py-1",
                    l.type === "same" && "text-muted",
                  )}
                >
                  <span className="w-8 flex-none text-right select-none opacity-40 pr-2">
                    {l.type === "add" ? "+" : l.type === "remove" ? "-" : l.oldLineNumber ?? ""}
                  </span>
                  <span className="w-8 flex-none text-right select-none opacity-40 pr-3">
                    {l.newLineNumber ?? ""}
                  </span>
                  <span className="whitespace-pre">{l.line}</span>
                </div>
              ))}
            </pre>
          </div>
        )}

        {/* Completion Action */}
        {isDone && onCompleteAction && (
          <div className="flex justify-end pt-2">
            <Button onClick={onCompleteAction}>{completeActionLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}