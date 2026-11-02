import "server-only";

import { compileLatex } from "./compile";

export class LatexRenderError extends Error {
  override name = "LatexRenderError";
  readonly diagnostics: string[];

  constructor(message: string, diagnostics: string[] = []) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

/**
 * Compiles a LaTeX document string into a PDF Buffer or throws a LatexRenderError.
 */
export async function renderLatexPdf(source: string, options?: { signal?: AbortSignal }): Promise<Buffer> {
  const result = await compileLatex(source, options);
  if (!result.ok) {
    throw new LatexRenderError(result.error, result.diagnostics);
  }
  return result.pdf;
}

