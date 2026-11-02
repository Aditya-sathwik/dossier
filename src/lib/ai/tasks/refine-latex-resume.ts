import type { Extracted, Match } from "@/lib/application-data";
import type { ProfileData } from "@/lib/profile";

import {
  candidateFacts,
  CREATIVITY,
  jobForPrompt,
  languageRule,
  profileForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";
import {
  areBracesBalanced,
  areEnvironmentsBalanced,
  splitLatexDocument,
  stripMarkdownCodeBlocks,
} from "./tailor-latex-resume";

export const REFINE_LATEX_VERSION = "refine-latex@1";

export type RefineLatexInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  facts: string[];
  latexSource: string;
  request: string;
  history?: { role: string; text: string }[];
};

export type RefineLatexResult = {
  latex: string;
  reply: string;
};

const INSTRUCTIONS = `You are an expert resume writer and LaTeX engineer.
A candidate is chatting with you to refine their LaTeX resume for a specific job application.
The user will ask for a change (e.g. "make the summary shorter", "emphasize leadership in the second role", "mention Rust in skills").

RULES:
1. Output your answer in two parts separated by the exact delimiter:
---LATEX_START---
<the modified LaTeX code that goes between \\begin{document} and \\end{document}>
---LATEX_END---
<a brief, friendly 1-2 sentence explanation to the candidate describing what you changed>

2. The LaTeX portion must contain ONLY the content between \\begin{document} and \\end{document}.
3. Do NOT output \\documentclass, \\usepackage, custom command definitions, or \\begin{document}. The preamble is already preserved in code.
4. Keep the exact same section structure, macro names, and formatting commands (e.g. \\resumeSubheading, \\resumeItem, \\section).
5. Ensure all LaTeX syntax remains completely valid: escape special characters (e.g. \\%, \\&, \\$, \\#, \\_) and maintain strictly balanced braces and environments.
6. Never invent companies, degrees, dates, or experiences not in the candidate profile.
7. Address the user's specific request accurately while keeping the resume professional and tailored to the job.`;

export const refineLatexResume: Task<RefineLatexInput, RefineLatexResult> = async (
  provider,
  { profile, extracted, match, facts, latexSource, request, history = [] },
  options,
) => {
  const { preamble, body, postscript } = splitLatexDocument(latexSource);

  const formattedHistory = history
    .slice(-4)
    .map((turn) => `${turn.role === "user" ? "Candidate" : "Assistant"}: ${turn.text}`)
    .join("\n");

  const responseText = await provider.complete({
    system: system(
      INSTRUCTIONS,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      CREATIVITY[options.creativity],
      languageRule(options.language),
      UNTRUSTED_POSTING,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The job:\n${jobForPrompt(extracted, match)}`,
          formattedHistory ? `Recent conversation:\n${formattedHistory}` : "",
          `Current LaTeX resume body:\n${body.trim()}`,
          `Candidate's request:\n${request}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    creativity: options.creativity,
    signal: options.signal,
  });

  let raw = responseText.trim();
  let modifiedBody = "";
  let reply = "";

  const startMarker = "---LATEX_START---";
  const endMarker = "---LATEX_END---";

  if (raw.includes(startMarker) && raw.includes(endMarker)) {
    const afterStart = raw.slice(raw.indexOf(startMarker) + startMarker.length);
    const endIdx = afterStart.indexOf(endMarker);
    modifiedBody = afterStart.slice(0, endIdx).trim();
    reply = afterStart.slice(endIdx + endMarker.length).trim();
  } else {
    modifiedBody = stripMarkdownCodeBlocks(raw);
    reply = "I've updated your LaTeX resume according to your request.";
  }

  if (modifiedBody.includes("\\begin{document}")) {
    const inner = splitLatexDocument(modifiedBody);
    modifiedBody = inner.body.trim();
  }

  modifiedBody = stripMarkdownCodeBlocks(modifiedBody);

  // Validate structural integrity
  if (!areBracesBalanced(modifiedBody)) {
    throw new Error("Refined LaTeX has unbalanced curly braces.");
  }
  if (!areEnvironmentsBalanced(modifiedBody)) {
    throw new Error("Refined LaTeX has unbalanced environments (e.g. unclosed itemize).");
  }

  const fullDocument = `${preamble}\n${modifiedBody}\n${postscript || "\\end{document}"}`;

  return {
    data: {
      latex: fullDocument,
      reply: reply || "I've updated your LaTeX resume according to your request.",
    },
    promptVersion: REFINE_LATEX_VERSION,
  };
};

