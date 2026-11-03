import { z } from "zod";

import type { Extracted, Match } from "@/lib/application-data";
import { tagLatexDocument, type RawEdit } from "@/lib/diff";
import type { ProfileData } from "@/lib/profile";

import {
  candidateFacts,
  CREATIVITY,
  jobForPrompt,
  languageRule,
  LATEX_WRITING_RULES,
  profileForPrompt,
  RESUME_ALIGNMENT_RULES,
  RESUME_COMMENT_RULES,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type Task,
} from "./prompt-parts";

export const REFINE_LATEX_VERSION = "refine-latex@2";

export const rawEditSchema = z.object({
  id: z.string().optional(),
  blockId: z.string().describe("The ID of the block being targeted from the tagged document, e.g. 'B5' or 'B12'"),
  action: z
    .enum(["replace", "insertAfter", "insertBefore", "delete"])
    .optional()
    .default("replace"),
  find: z.string().optional().describe("Optional verbatim lines if blockId not used"),
  replace: z.string().default("").describe("New LaTeX lines to replace the block with or insert"),
  reason: z.string().describe("Short explanation of why this change was made"),
});

export const refineLatexResultSchema = z.object({
  reply: z.string().describe("Friendly 1-2 sentence response to the candidate summarizing what was changed"),
  edits: z.array(rawEditSchema).describe("List of targeted edits to apply to the LaTeX document"),
});

export type RefineLatexInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  facts: string[];
  latexSource: string;
  request: string;
  history?: { role: string; text: string }[];
  targetSnippet?: string | null;
};

export type RefineLatexResult = {
  reply: string;
  edits: RawEdit[];
};

const INSTRUCTIONS = `You are an expert resume writer and LaTeX engineer.
A candidate is refining their LaTeX resume for a specific job application.
The candidate may ask for specific improvements or provide tailoring points derived from job requirements and candidate comments.

Lines in the resume body are tagged with block IDs like [B1], [B2], [B3]...

RULES FOR EDITS:
1. Output JSON matching the schema with:
   - "reply": A friendly 1-2 sentence explanation describing the changes you made.
   - "edits": An array of targeted edits.
2. For each edit in "edits":
   - "blockId": The ID of the block (e.g. "B6") being targeted.
   - "action":
     * "replace": replace the specified block line with new LaTeX code.
     * "insertAfter": insert a new bullet or line after the specified block.
   - "replace": The updated LaTeX line(s).
     * Maintain strictly valid LaTeX syntax.
     * Escape special characters properly (\\%, \\&, \\$, \\#, \\_).
     * Maintain balanced curly braces { and } and environment tags.
     * If writing an item, include the leading '\\item '.
   - "reason": A brief explanation of why this specific edit was made.
3. TEXT-ONLY CONTENT EDITING:
   - You ONLY modify the human-readable text of bullet points, summary sentences, and skill lists.
   - NEVER alter, replace, or output document preamble commands (e.g. \\documentclass, \\usepackage, \\hypersetup, \\titleformat, \\definecolor).
   - NEVER replace structural environment delimiters (e.g. \\begin{itemize}, \\end{itemize}, \\begin{tabularx}, \\resumeItemListStart, \\resumeItemListEnd).
   - Keep bullet macro wrappers intact:
     * If the block is \\item[--] ..., replace it with \\item[--] <new text>.
     * If the block is \\resumeItem{...}, replace it with \\resumeItem{<new text>}.
     * If the block is \\item ..., replace it with \\item <new text>.
4. If the user provided a specific target snippet (selected lines), focus your edits on the corresponding block(s).
5. Never invent companies, degrees, or dates not in the candidate's profile.
6. If no changes are needed or you cannot fulfill the request, return an empty "edits" array and explain why in "reply".`;

export const refineLatexResume: Task<RefineLatexInput, RefineLatexResult> = async (
  provider,
  { profile, extracted, match, facts, latexSource, request, history = [], targetSnippet },
  options,
) => {
  const { taggedText } = tagLatexDocument(latexSource);

  // Extract the tagged body between \begin{document} and \end{document} to keep prompt focused
  // while guaranteeing that the [B#] block IDs match the full document tagging 100%.
  const beginMarker = "\\begin{document}";
  const endMarker = "\\end{document}";
  const beginIdx = taggedText.indexOf(beginMarker);
  const endIdx = taggedText.lastIndexOf(endMarker);
  const taggedBody =
    beginIdx !== -1 && endIdx !== -1
      ? taggedText.slice(beginIdx + beginMarker.length, endIdx).trim()
      : taggedText;

  const formattedHistory = history
    .slice(-4)
    .map((turn) => `${turn.role === "user" ? "Candidate" : "Assistant"}: ${turn.text}`)
    .join("\n");

  const promptContent = [
    `The candidate's profile:\n${profileForPrompt(profile)}`,
    `The job:\n${jobForPrompt(extracted, match)}`,
    formattedHistory ? `Recent conversation:\n${formattedHistory}` : "",
    targetSnippet
      ? `Candidate's selected LaTeX snippet to focus on:\n\`\`\`latex\n${targetSnippet.trim()}\n\`\`\``
      : "",
    `Current tagged LaTeX resume body:\n\`\`\`latex\n${taggedBody}\n\`\`\``,
    `Candidate's request:\n${request}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const answer = await provider.complete({
    system: system(
      INSTRUCTIONS,
      RESUME_ALIGNMENT_RULES,
      LATEX_WRITING_RULES,
      RESUME_COMMENT_RULES,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      CREATIVITY[options.creativity],
      languageRule(options.language),
      UNTRUSTED_POSTING,
    ),
    messages: [{ role: "user", content: promptContent }],
    schema: refineLatexResultSchema,
    schemaName: "refine_latex_resume",
    creativity: options.creativity,
    signal: options.signal,
  });

  return {
    data: answer,
    promptVersion: REFINE_LATEX_VERSION,
  };
};
