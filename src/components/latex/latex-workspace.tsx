"use client";

import { useEffect, useState, type ReactNode } from "react";

import { DownloadPdfButton } from "@/components/documents/download-pdf-button";
import { Button } from "@/components/ui/button";
import { compileLatexAction } from "@/lib/latex/actions";
import { LatexEditor } from "./latex-editor";
import { LatexPdfPreview } from "./latex-pdf-preview";

export type LatexWorkspaceProps = {
  code: string;
  onChange: (value: string) => void;
  downloadHref: string;
  actions?: ReactNode;
  saved?: boolean;
};

export function LatexWorkspace({
  code,
  onChange,
  downloadHref,
  actions,
  saved = true,
}: LatexWorkspaceProps) {
  const [heldId, setHeldId] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

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

  return (
    <div className="flex flex-1 flex-col gap-2 min-h-0 overflow-hidden">
      {/* Top Workspace Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1 py-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-meta text-muted flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                diagnostics.length > 0 ? "bg-danger" : compiling ? "bg-warning animate-pulse" : "bg-success"
              }`}
            />
            {diagnostics.length > 0 ? "Compiler errors" : compiling ? "Compiling…" : saved ? "Saved" : "Unsaved edits"}
          </span>
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

      {/* Overleaf-Style Split Screen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-[900px] min-h-[800px] overflow-hidden">
        <LatexEditor
          value={code}
          onChange={onChange}
          onCompile={() => void handleCompile()}
          compiling={compiling}
          diagnostics={diagnostics}
        />

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

