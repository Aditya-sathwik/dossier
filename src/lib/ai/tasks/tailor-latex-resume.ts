import type { Extracted, Match } from "@/lib/application-data";
import type { ProfileData } from "@/lib/profile";

import {
  applicationFacts,
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

export const TAILOR_LATEX_VERSION = "tailor-latex@1";

export type TailorLatexInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  facts: string[];
  latexSource: string;
};

/**
 * Validates that LaTeX braces `{` and `}` are balanced (ignoring escaped ones).
 */
export function areBracesBalanced(code: string): boolean {
  let depth = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\\" && i + 1 < code.length) {
      i++; // skip escaped char
      continue;
    }
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Validates that all \begin{env} have a matching \end{env}.
 */
export function areEnvironmentsBalanced(code: string): boolean {
  const envRegex = /\\(begin|end)\{([a-zA-Z*]+)\}/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = envRegex.exec(code)) !== null) {
    const type = match[1];
    const env = match[2];
    if (type === "begin") {
      stack.push(env);
    } else {
      if (stack.length === 0 || stack[stack.length - 1] !== env) {
        return false;
      }
      stack.pop();
    }
  }
  return stack.length === 0;
}

/**
 * Strips markdown code blocks like ```latex ... ``` if the LLM output is wrapped.
 */
export function stripMarkdownCodeBlocks(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  return cleaned.trim();
}

/**
 * Splits LaTeX source into preamble (everything up to and including \begin{document})
 * and the document body (between \begin{document} and \end{document}).
 */
export function splitLatexDocument(source: string): { preamble: string; body: string; postscript: string } {
  const beginMarker = "\\begin{document}";
  const endMarker = "\\end{document}";

  const beginIdx = source.indexOf(beginMarker);
  if (beginIdx === -1) {
    return { preamble: "", body: source, postscript: "" };
  }

  const preamble = source.slice(0, beginIdx + beginMarker.length);
  const remainder = source.slice(beginIdx + beginMarker.length);

  const endIdx = remainder.lastIndexOf(endMarker);
  if (endIdx === -1) {
    return { preamble, body: remainder, postscript: `\n${endMarker}` };
  }

  const body = remainder.slice(0, endIdx);
  const postscript = remainder.slice(endIdx);
  return { preamble, body, postscript };
}

const INSTRUCTIONS = `You are an expert resume writer and LaTeX engineer.
You tailor a candidate's LaTeX resume to a target job description.

RULES:
1. Output ONLY the LaTeX code that goes between \\begin{document} and \\end{document}.
2. Do NOT output \\documentclass, \\usepackage, custom command definitions or \\begin{document}. That preamble is already preserved in code.
3. Tailor the content:
   - Summary: 2-3 sentences targeting this role and company.
   - Experience: Tailor bullet points to lead with the action verbs, metrics, and skills most relevant to this job.
   - Skills: Reorder and highlight skills mentioned in the job requirements.
4. Keep the exact same section structure, macro names, and formatting commands (e.g. \\resumeSubheading, \\resumeItem, \\section).
5. Ensure all LaTeX syntax remains completely valid: escape special characters (e.g. \\%, \\&, \\$, \\#, \\_) and maintain strictly balanced braces and environments.
6. Never invent companies, degrees, dates, or experiences not in the candidate profile.
7. Return raw LaTeX only. No markdown formatting, no conversational commentary.
8. Escape LaTeX special characters (\\%, \\&, \\$, \\#, \\_, etc.) in any candidate text or comments you use.`;

export const tailorLatexResume: Task<TailorLatexInput, string> = async (
  provider,
  { profile, extracted, match, facts, latexSource },
  options,
) => {
  const { preamble, body, postscript } = splitLatexDocument(latexSource);

  const responseText = await provider.complete({
    system: system(
      INSTRUCTIONS,
      RESUME_ALIGNMENT_RULES,
      LATEX_WRITING_RULES,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      RESUME_COMMENT_RULES,
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
          applicationFacts(facts),
          `Current LaTeX resume body to tailor:\n${body.trim()}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    creativity: options.creativity,
    signal: options.signal,
  });

  let tailoredBody = stripMarkdownCodeBlocks(responseText);

  // If the model mistakenly included \begin{document} / \end{document}, extract only the inside
  if (tailoredBody.includes("\\begin{document}")) {
    const inner = splitLatexDocument(tailoredBody);
    tailoredBody = inner.body.trim();
  }

  // Validate structural integrity
  if (!areBracesBalanced(tailoredBody)) {
    throw new Error("Tailored LaTeX has unbalanced curly braces.");
  }
  if (!areEnvironmentsBalanced(tailoredBody)) {
    throw new Error("Tailored LaTeX has unbalanced environments (e.g. unclosed itemize).");
  }

  // Reassemble with original preamble
  const fullDocument = `${preamble}\n${tailoredBody}\n${postscript || "\\end{document}"}`;

  return {
    data: fullDocument,
    promptVersion: TAILOR_LATEX_VERSION,
  };
};

