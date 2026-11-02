"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type LatexPdfPreviewProps = {
  heldId: string | null;
  compiling?: boolean;
  unavailable?: boolean;
  onCompile?: () => void;
  className?: string;
};

export function LatexPdfPreview({
  heldId,
  compiling = false,
  unavailable = false,
  onCompile,
  className,
}: LatexPdfPreviewProps) {
  if (unavailable) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center p-8 bg-card border border-line-card rounded-panel text-center", className)}>
        <div className="max-w-md space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warning-surface text-warning font-bold text-lg">
            !
          </div>
          <h3 className="font-serif text-lg text-ink font-semibold">Tectonic LaTeX Compiler Missing</h3>
          <p className="text-sm text-muted">
            To compile LaTeX resumes into PDFs, Dossier uses the standalone <code className="text-xs bg-input px-1.5 py-0.5 rounded">tectonic</code> engine.
          </p>
          <div className="bg-input p-3 rounded-control text-xs font-mono text-ink text-left">
            brew install tectonic
          </div>
          {onCompile && (
            <Button variant="secondary" size="sm" onClick={onCompile}>
              Check again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-1 flex-col min-h-0 h-full overflow-hidden bg-card border border-line-card rounded-panel", className)}>
      {heldId ? (
        <iframe
          src={`/api/latex/${heldId}`}
          title="LaTeX Resume PDF Preview"
          className="w-full h-full flex-1 min-h-0 border-none bg-canvas"
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted">
          <p className="text-sm">Click <strong>Compile</strong> (or press <kbd className="px-1 py-0.5 rounded bg-input text-xs border border-line">Cmd+Enter</kbd>) to preview your PDF.</p>
        </div>
      )}

      {compiling && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
          <div className="flex items-center gap-2.5 rounded-card bg-canvas px-4 py-2 text-sm text-ink shadow-raised border border-line">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Compiling LaTeX PDF…</span>
          </div>
        </div>
      )}
    </div>
  );
}

