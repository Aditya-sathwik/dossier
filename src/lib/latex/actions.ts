"use server";

import { z } from "zod";

import { action } from "@/lib/action";
import { holdPdf } from "@/lib/pdf/downloads";
import { compileLatex } from "./compile";

/**
 * Server action to compile a LaTeX string and hold the PDF for inline preview.
 */
export const compileLatexAction = action(
  z.object({
    latex: z.string().max(300_000, "LaTeX code is too long (maximum 300,000 characters)."),
  }),
  async ({ latex }) => {
    const result = await compileLatex(latex);
    if (!result.ok) {
      return {
        success: false as const,
        unavailable: result.unavailable ?? false,
        error: result.error,
        diagnostics: result.diagnostics,
      };
    }

    const heldId = holdPdf(result.pdf, "resume.pdf");
    return {
      success: true as const,
      heldId,
      cached: result.cached ?? false,
    };
  },
);

