"use client";

import { Check, CheckCheck, Sparkles, X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CodeHunk, HunkDecision } from "@/lib/diff";

export type LatexDiffViewerProps = {
  hunks: CodeHunk[];
  decisions: Record<string, HunkDecision>;
  onDecideHunk: (hunkId: string, decision: HunkDecision) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApply: () => void;
  onDiscard: () => void;
  isApplying?: boolean;
};

export function LatexDiffViewer({
  hunks,
  decisions,
  onDecideHunk,
  onAcceptAll,
  onRejectAll,
  onApply,
  onDiscard,
  isApplying = false,
}: LatexDiffViewerProps) {
  const acceptedCount = hunks.filter((h) => decisions[h.id] === "accepted").length;
  const rejectedCount = hunks.filter((h) => decisions[h.id] === "rejected").length;
  const pendingCount = hunks.length - acceptedCount - rejectedCount;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card border border-line-card rounded-panel">
      {/* Header bar with bulk actions */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 bg-panel/70">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-ink">AI Proposed Changes</span>
              <span className="rounded-full bg-input px-2 py-0.5 text-xs text-muted font-medium">
                {hunks.length} {hunks.length === 1 ? "change" : "changes"}
              </span>
            </div>
            <div className="text-xs text-muted">
              {pendingCount > 0 && (
                <span className="text-amber-500 font-medium">{pendingCount} pending · </span>
              )}
              <span className="text-success font-medium">{acceptedCount} accepted</span> ·{" "}
              <span className="text-danger font-medium">{rejectedCount} rejected</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onAcceptAll}
            title="Accept all changes"
            className="text-xs flex items-center gap-1 hover:border-success/50"
          >
            <CheckCheck className="h-3.5 w-3.5 text-success" />
            Accept all
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onRejectAll}
            title="Reject all changes"
            className="text-xs flex items-center gap-1 hover:border-danger/50"
          >
            <XCircle className="h-3.5 w-3.5 text-danger" />
            Reject all
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={isApplying || (rejectedCount === hunks.length && acceptedCount === 0)}
            onClick={onApply}
            className="text-xs font-semibold"
          >
            {isApplying
              ? "Applying…"
              : acceptedCount > 0
                ? `Done / Apply (${acceptedCount} accepted)`
                : "Done / Apply"}
          </Button>

          <Button
            variant="text"
            size="sm"
            onClick={onDiscard}
            title="Discard this review"
            className="text-xs text-muted hover:text-ink"
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Scrollable list of hunk cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-subtle">
        {hunks.map((hunk, index) => {
          const decision = decisions[hunk.id];
          const isAccepted = decision === "accepted";
          const isRejected = decision === "rejected";
          const isPending = !isAccepted && !isRejected;

          return (
            <div
              key={hunk.id}
              className={`rounded-lg border transition-all ${
                isAccepted
                  ? "border-success/50 bg-success-surface/20 shadow-xs"
                  : isRejected
                    ? "border-danger/30 bg-danger-surface/20 opacity-70"
                    : "border-line bg-card/90"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line/60 bg-panel/30">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted shrink-0">#{index + 1}</span>
                  <span className="text-xs font-medium text-ink truncate" title={hunk.reason}>
                    {hunk.reason}
                  </span>
                  <span className="text-[11px] text-muted shrink-0 font-mono">
                    (L{hunk.oldStartLine})
                  </span>

                  {isAccepted && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-success/20 text-success border border-success/30 shrink-0">
                      <Check className="h-3 w-3" /> Accepted
                    </span>
                  )}
                  {isRejected && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-danger/20 text-danger border border-danger/30 shrink-0">
                      <X className="h-3 w-3" /> Rejected
                    </span>
                  )}
                  {isPending && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
                      Pending review
                    </span>
                  )}
                </div>

                {/* Per-hunk Accept / Reject buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDecideHunk(hunk.id, "accepted")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                      isAccepted
                        ? "bg-success text-white shadow-xs font-semibold"
                        : "bg-input text-ink hover:bg-success/20 hover:text-success border border-line"
                    }`}
                    aria-label={`Accept change ${index + 1}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </button>

                  <button
                    type="button"
                    onClick={() => onDecideHunk(hunk.id, "rejected")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                      isRejected
                        ? "bg-danger text-white shadow-xs font-semibold"
                        : "bg-input text-ink hover:bg-danger/20 hover:text-danger border border-line"
                    }`}
                    aria-label={`Reject change ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>

              {/* Card Diff Body */}
              <div className="p-2.5 font-mono text-xs overflow-x-auto space-y-1">
                {hunk.oldText && (
                  <div className="bg-danger/10 text-danger border-l-2 border-danger px-2 py-1 rounded-xs whitespace-pre">
                    <span className="select-none font-bold mr-1.5 opacity-70">-</span>
                    {hunk.oldText}
                  </div>
                )}
                {hunk.newText && (
                  <div className="bg-success/10 text-success border-l-2 border-success px-2 py-1 rounded-xs whitespace-pre">
                    <span className="select-none font-bold mr-1.5 opacity-70">+</span>
                    {hunk.newText}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
