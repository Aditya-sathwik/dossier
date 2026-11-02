import "server-only";

import { z } from "zod";

import { Tone } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorResume, writeCoverLetter } from "@/lib/ai/tasks";
import { tailorLatexResume } from "@/lib/ai/tasks/tailor-latex-resume";
import { extractedSchema, matchSchema, unitsSchema } from "@/lib/application-data";
import { compileLatex } from "@/lib/latex/compile";
import { loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { writeDocumentsSteps } from "./application-steps";
import { defineJob } from "./runner";

/**
 * Writes the tailored resume and cover letter (E7-6, NEW-7). Saves nothing:
 * the application is created from the result in one transaction afterwards,
 * so leaving midway leaves nothing behind.
 */
export const writeDocumentsJob = defineJob({
  type: "write-documents",
  input: z.object({
    /** The job that read the posting; its result and input are the source of truth. */
    readJobId: z.string().min(1),
    posting: z.string().min(1),
    /** What was read, with the user's corrections (company, role…) for the prompts. */
    extracted: extractedSchema,
    /** The match as shown, including skills added to the profile since. */
    match: matchSchema,
    tone: z.enum(Tone),
    note: z.string().max(2000),
  }),
  result: z.object({
    resume: unitsSchema,
    resumeWith: z.string(),
    letter: unitsSchema,
    letterWith: z.string(),
    latex: z.string().max(200_000).optional(),
    latexStatus: z.enum(["none", "tailored", "fallback"]).default("none"),
    latexError: z.string().optional(),
    baseLatex: z.string().max(200_000).optional(),
  }),
  async run({ posting, extracted, match, tone, note }, { step, signal }) {
    const [provider, options, profile, settings] = await Promise.all([
      getAiProvider(),
      loadTaskOptions(),
      loadProfile(),
      loadSettings(),
    ]);

    const hasComments = match.items.some((i) => i.comment) || !!note.trim();
    const isLatex = settings.resumeFormat === "latex" && !!settings.baseResumeLatex;
    const steps = writeDocumentsSteps({ hasComments, latex: isLatex });
    let stepIndex = 0;

    // "Anything I should know?" is the application's first fact (APP-15).
    const facts = note.trim() ? [note.trim()] : [];

    if (hasComments) {
      await step(steps[stepIndex++]);
    }

    let tailoredLatex: string | undefined;
    let latexStatus: "none" | "tailored" | "fallback" = "none";
    let latexError: string | undefined;
    const baseLatex = isLatex ? settings.baseResumeLatex : undefined;

    if (isLatex && settings.baseResumeLatex) {
      await step(steps[stepIndex++]);
      try {
        const latexResult = await tailorLatexResume(
          provider,
          {
            profile,
            extracted,
            match,
            facts,
            latexSource: settings.baseResumeLatex,
          },
          { ...options, signal },
        );

        await step(steps[stepIndex++]);
        const compiled = await compileLatex(latexResult.data, { signal });
        if (compiled.ok) {
          tailoredLatex = latexResult.data;
          latexStatus = "tailored";
        } else {
          latexStatus = "fallback";
          latexError = compiled.error;
          tailoredLatex = settings.baseResumeLatex;
        }
      } catch (err) {
        latexStatus = "fallback";
        latexError = err instanceof Error ? err.message : "LaTeX tailoring failed";
        tailoredLatex = settings.baseResumeLatex;
      }
    } else {
      await step(steps[stepIndex++]);
    }

    // Always generate standard units for application database/export compatibility
    const resume = await tailorResume(provider, { profile, extracted, match, facts, posting }, { ...options, signal });

    await step(steps[stepIndex++]);
    const letter = await writeCoverLetter(provider, { profile, extracted, match, tone, facts, posting }, { ...options, signal });

    return {
      resume: resume.data,
      resumeWith: resume.promptVersion,
      letter: letter.data,
      letterWith: letter.promptVersion,
      latex: tailoredLatex,
      latexStatus,
      latexError,
      baseLatex,
    };
  },
});

export type WriteDocumentsInput = z.infer<typeof writeDocumentsJob.input>;
export type WriteDocumentsResult = z.infer<typeof writeDocumentsJob.result>;
