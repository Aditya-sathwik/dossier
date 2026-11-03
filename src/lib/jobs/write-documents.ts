import "server-only";

import { z } from "zod";

import { Tone } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorResume, writeCoverLetter } from "@/lib/ai/tasks";
import { extractedSchema, matchSchema, unitsSchema, type Unit } from "@/lib/application-data";
import { loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { writeDocumentsSteps } from "./application-steps";
import { defineJob } from "./runner";

/**
 * Writes the cover letter and resume units (E7-6, NEW-7).
 * When format is LaTeX, skips the heavy resume tailoring LLM call and stores
 * minimal baseline resume units, leaving LaTeX tailoring to the interactive
 * workspace on the next page.
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
    const isLatex = settings.resumeFormat === "latex";
    const steps = writeDocumentsSteps({ hasComments, latex: isLatex });
    let stepIndex = 0;

    // "Anything I should know?" is the application's first fact (APP-15).
    const facts = note.trim() ? [note.trim()] : [];

    if (hasComments) {
      await step(steps[stepIndex++]);
    }

    let resumeUnits: Unit[];
    let resumeWith: string;

    if (isLatex) {
      // In LaTeX mode, the primary document is LaTeX code.
      // Store minimal summary units to satisfy database schema and unitsSchema without calling tailorResume.
      resumeUnits = [
        {
          id: "summary",
          label: "Summary",
          text: profile.basics.headline || "LaTeX Resume",
        },
      ];
      resumeWith = "latex-base";
    } else {
      await step(steps[stepIndex++]);
      const tailored = await tailorResume(
        provider,
        { profile, extracted, match, facts, posting },
        { ...options, signal },
      );
      resumeUnits = tailored.data;
      resumeWith = tailored.promptVersion;
    }

    await step(steps[stepIndex++]);
    const letter = await writeCoverLetter(
      provider,
      { profile, extracted, match, tone, facts, posting },
      { ...options, signal },
    );

    return {
      resume: resumeUnits,
      resumeWith,
      letter: letter.data,
      letterWith: letter.promptVersion,
      latex: settings.baseResumeLatex || undefined,
      latexStatus: "none" as const,
      baseLatex: settings.baseResumeLatex || undefined,
    };
  },
});

export type WriteDocumentsInput = z.infer<typeof writeDocumentsJob.input>;
export type WriteDocumentsResult = z.infer<typeof writeDocumentsJob.result>;
