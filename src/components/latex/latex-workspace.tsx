"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { DownloadPdfButton } from "@/components/documents/download-pdf-button";
import { Button } from "@/components/ui/button";
import { applyDecisions, type CodeHunk, type HunkDecision } from "@/lib/diff";
import { compileLatexAction } from "@/lib/latex/actions";
import { LatexDiffViewer } from "./latex-diff-viewer";
import { LatexEditor } from "./latex-editor";
import { LatexPdfPreview } from "./latex-pdf-preview";

export type PendingProposal = {
  hunks: CodeHunk[];
  baseLatex: string;
};

export type LatexWorkspaceProps = {
  code: string;
  onChange: (value: string) => void;
  downloadHref: string;
  actions?: ReactNode;
  saved?: boolean;
  pendingProposal?: PendingProposal | null;
  onApplyProposal?: (newCode: string) => void;
  onDiscardProposal?: () => void;
  onAskAiAboutSelection?: (selection: { text: string; startLine: number; endLine: number }) => void;
};

export function LatexWorkspace({
  code,
  onChange,
  downloadHref,
  actions,
  saved = true,
  pendingProposal = null,
  onApplyProposal,
  onDiscardProposal,
  onAskAiAboutSelection,
}: LatexWorkspaceProps) {
  const [heldId, setHeldId] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  // Decisions map for review mode: hunkId -> "accepted" | "rejected"
  const [decisions, setDecisions] = useState<Record<string, HunkDecision>>({});
  // Snapshot before AI changes were applied, for 1-click Undo
  const [undoSnapshot, setUndoSnapshot] = useState<string | null>(null);

  // Initialize decisions when proposal changes: default to empty (pending)
  useEffect(() => {
    setDecisions({});
  }, [pendingProposal]);

  const handleCompile = async (source = code) => {
    setCompiling(true);
    try {
      const result = await compileLatexAction({ latex: source });
      if (result.ok) {
        if (result.data.success) {
          setHeldId(result.data.heldId);
          setDiagnostics([]);
          setUnavailable(false);
        } else {
          setDiagnostics(result.data.diagnostics);
          setUnavailable(result.data.unavailable);
        }
      } else {
        setDiagnostics([result.error]);
      }
    } finally {
      setCompiling(false);
    }
  };

  // Initial compilation on mount if code is present
  useEffect(() => {
    if (code.trim() && !heldId) {
      void handleCompile(code);
    }
  }, []);

  const handleApplyReview = async () => {
    if (!pendingProposal) return;
    const finalDecisions: Record<string, HunkDecision> = { ...decisions };
    // If no hunks have been explicitly accepted or rejected yet, treat all pending hunks as accepted
    const explicitlyDecided = Object.keys(finalDecisions).length;
    if (explicitlyDecided === 0) {
      for (const hunk of pendingProposal.hunks) {
        finalDecisions[hunk.id] = "accepted";
      }
    }
    const { code: newCode } = applyDecisions(
      pendingProposal.baseLatex,
      pendingProposal.hunks,
      finalDecisions,
    );
    setUndoSnapshot(pendingProposal.baseLatex);
    onChange(newCode);
    onApplyProposal?.(newCode);
    await handleCompile(newCode);
  };

  const handleDiscardReview = () => {
    onDiscardProposal?.();
  };

  const handleUndo = async () => {
    if (!undoSnapshot) return;
    const reverted = undoSnapshot;
    setUndoSnapshot(null);
    onChange(reverted);
    onApplyProposal?.(reverted);
    await handleCompile(reverted);
  };

  const isReviewing = Boolean(pendingProposal && pendingProposal.hunks.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-2 min-h-0 overflow-hidden">
      {/* Top Workspace Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 py-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-meta text-muted flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                diagnostics.length > 0
                  ? "bg-danger"
                  : compiling
                    ? "bg-warning animate-pulse"
                    : "bg-success"
              }`}
            />
            {diagnostics.length > 0
              ? "Compiler errors"
              : compiling
                ? "Compiling…"
                : saved
                  ? "Saved"
                  : "Unsaved edits"}
          </span>

          {isReviewing && (
            <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs font-medium">
              Reviewing AI suggestions
            </span>
          )}

          {undoSnapshot && !isReviewing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleUndo()}
              className="text-xs flex items-center gap-1.5"
              title="Revert to code before AI changes"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted" />
              Undo AI changes
            </Button>
          )}

          {actions}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-disabled={compiling || undefined}
            onClick={() => void handleCompile()}
          >
            {compiling ? "Compiling…" : "Compile"} <kbd className="ml-1 text-[11px] opacity-60">⌘↵</kbd>
          </Button>

          <DownloadPdfButton variant="primary" size="sm" href={downloadHref}>
            Download PDF
          </DownloadPdfButton>
        </div>
      </div>

      {/* Split Screen: Left (Editor / Diff Viewer) | Right (PDF Preview) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-[900px] min-h-[800px] overflow-hidden">
        {isReviewing && pendingProposal ? (
          <LatexDiffViewer
            hunks={pendingProposal.hunks}
            decisions={decisions}
            onDecideHunk={(id, decision) =>
              setDecisions((prev) => ({ ...prev, [id]: decision }))
            }
            onAcceptAll={() => {
              const all: Record<string, HunkDecision> = {};
              for (const h of pendingProposal.hunks) all[h.id] = "accepted";
              setDecisions(all);
            }}
            onRejectAll={() => {
              const all: Record<string, HunkDecision> = {};
              for (const h of pendingProposal.hunks) all[h.id] = "rejected";
              setDecisions(all);
            }}
            onApply={() => void handleApplyReview()}
            onDiscard={handleDiscardReview}
            isApplying={compiling}
          />
        ) : (
          <LatexEditor
            value={code}
            onChange={onChange}
            onCompile={() => void handleCompile()}
            compiling={compiling}
            diagnostics={diagnostics}
            onAskAiAboutSelection={onAskAiAboutSelection}
          />
        )}

        <LatexPdfPreview
          heldId={heldId}
          compiling={compiling}
          unavailable={unavailable}
          onCompile={() => void handleCompile()}
        />
      </div>
    </div>
  );
}
