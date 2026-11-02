import "server-only";

import { z } from "zod";

import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { tailorLatexResume } from "@/lib/ai/tasks/tailor-latex-resume";
import { extractedOf, matchSchema } from "@/lib/application-data";
import { compileLatex } from "@/lib/latex/compile";
import { latexSourceOf } from "@/lib/latex/base";
import { prisma } from "@/lib/prisma";
import { loadFactTexts, loadProfile } from "@/lib/profile-data";
import { readJson } from "@/lib/application-documents";
import { loadSettings } from "@/lib/settings-data";

import { defineJob } from "./runner";

export const tailorLatexJobKey = (applicationId: string) => `tailor-latex:${applicationId}`;

export const tailorLatexJob = defineJob({
  type: "tailor-latex",
  input: z.object({
    applicationId: z.string().min(1),
  }),
  result: z.object({
    latex: z.string(),
    previous: z.string(),
    summary: z.string(),
  }),
  async run({ applicationId }, { step, signal }) {
    await step("Reading application and LaTeX code");
    const [application, profile, settings, facts] = await Promise.all([
      prisma.application.findUnique({
        where: { id: applicationId },
      }),
      loadProfile(),
      loadSettings(),
      loadFactTexts(applicationId),
    ]);

    if (!application) {
      throw new Error("Application not found.");
    }

    const previousLatex = latexSourceOf(application, settings, profile);
    const extracted = extractedOf(application);
    const match = readJson(matchSchema, application.match);

    await step("Tailoring resume with AI");
    const [provider, options] = await Promise.all([getAiProvider(), loadTaskOptions()]);

    const { data: tailoredLatex } = await tailorLatexResume(
      provider,
      {
        profile,
        extracted,
        match,
        facts,
        latexSource: previousLatex,
      },
      { ...options, signal },
    );

    await step("Verifying LaTeX compilation");
    const compileResult = await compileLatex(tailoredLatex, { signal });
    if (!compileResult.ok) {
      throw new Error(`Tailored LaTeX failed to compile: ${compileResult.error}`);
    }

    await step("Saving tailored resume");
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        latexCode: tailoredLatex,
        resumeFormat: "latex",
      },
    });

    return {
      latex: tailoredLatex,
      previous: previousLatex,
      summary: "Tailored your LaTeX resume for this position.",
    };
  },
});

