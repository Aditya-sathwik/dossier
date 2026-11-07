import { z } from "zod";

import type { Tone } from "@/generated/prisma/enums";
import type { ProfileData } from "@/lib/profile";
import { DEFAULT_BASE_COVER_LETTER_BODY, DEFAULT_BASE_COVER_LETTER_SUBJECT, DEFAULT_BASE_ROLE } from "@/lib/settings";
import { TONES } from "@/lib/tones";

import {
  candidateFacts,
  CREATIVITY,
  languageRule,
  NO_EM_DASHES,
  profileForPrompt,
  system,
  truthfulness,
  type Task,
} from "./prompt-parts";

export const WRITE_BASE_COVER_LETTER_VERSION = "write-base-cover-letter@2";

const answerSchema = z.object({
  proofPoints: z.array(z.string()),
  subject: z.string(),
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signOff: z.string(),
});

const INSTRUCTIONS = `You write a candidate's reusable cover letter as JSON. It is sent to companies, so it may use only these variables: {{company}}, {{role}}, {{name}}, {{contactPerson}}.

Fill the fields in this exact order:
- proofPoints: 3 items copied from the profile: one project, one metric, one technology. Copy the wording. Do not invent.
- subject: under 8 words, names the candidate's specialization (e.g. "Full-Stack Engineer application: {{role}} – {{name}}").
- greeting: "Dear {{contactPerson}},"
- paragraphs: exactly 3 to 4 paragraphs, 170 to 220 words total.
  1. Who the candidate is (specialization, years of experience) and that they want {{role}} roles at {{company}}. Two sentences max.
  2. The proof. Use proofPoints: name the project, the technology and the metric.
  3. Technical approach and architecture. Focus on maintainability, reliability, and clean code.
  4. Invite a short conversation and mention the resume is attached.
- signOff: closing phrase only, no name.

Rules:
- Every sentence must contain a specific project, technology or number from the profile.
- Mention at most 4 technologies.
- Do not describe the company or claim knowledge about it.`;

export const BANNED_BUZZWORDS = /\b(passionate|thrive|cross-functional|Agile|adept|synergy|excited|delighted)\b/i;

export type BaseCoverLetterInput = {
  profile: ProfileData;
  targetRole?: string;
  tone?: Tone;
  facts?: string[];
};

export type BaseCoverLetterOutput = {
  subject: string;
  body: string;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generates a versatile, high-converting base cover letter template for job portals / direct outreach,
 * grounded strictly in the candidate's profile and containing dynamic placeholders.
 */
export const writeBaseCoverLetter: Task<BaseCoverLetterInput, BaseCoverLetterOutput> = async (
  provider,
  { profile, targetRole = DEFAULT_BASE_ROLE, tone = "WARM", facts = [] },
  options,
) => {
  const executeCompletion = async () => {
    return provider.complete({
      system: system(
        INSTRUCTIONS,
        `Target Role: ${targetRole}`,
        `Tone: ${TONES[tone].label}. ${TONES[tone].description}`,
        truthfulness(options.strict),
        candidateFacts(profile, facts),
        CREATIVITY[options.creativity],
        languageRule(options.language),
        NO_EM_DASHES,
      ),
      messages: [
        {
          role: "user",
          content: `The candidate's profile:\n${profileForPrompt(profile)}\n\nWrite a universal cover letter for the role of ${targetRole}.`,
        },
      ],
      schema: answerSchema,
      schemaName: "base_cover_letter",
      creativity: options.creativity,
      signal: options.signal,
    });
  };

  let answer = await executeCompletion();

  const buildBody = (ans: typeof answer) => {
    const greeting = ans.greeting.trim() || `Dear {{contactPerson}},`;
    const signOff = ans.signOff.trim() || TONES[tone].signOff;
    const cleanParagraphs = ans.paragraphs.map((p) => p.trim()).filter(Boolean);
    return [greeting, ...cleanParagraphs, `${signOff}\n{{name}}`].join("\n\n");
  };

  let body = buildBody(answer);
  let words = countWords(body);

  if (BANNED_BUZZWORDS.test(body) || words > 260 || words < 90) {
    try {
      answer = await executeCompletion();
      body = buildBody(answer);
      words = countWords(body);
    } catch {
      // Keep first attempt or fallback below
    }
  }

  if (BANNED_BUZZWORDS.test(body) || words > 280 || words < 80) {
    return {
      data: {
        subject: DEFAULT_BASE_COVER_LETTER_SUBJECT,
        body: DEFAULT_BASE_COVER_LETTER_BODY,
      },
      promptVersion: WRITE_BASE_COVER_LETTER_VERSION,
    };
  }

  const subject = answer.subject.trim() || `Full-Stack Engineer application: {{role}} – {{name}}`;

  return {
    data: {
      subject,
      body,
    },
    promptVersion: WRITE_BASE_COVER_LETTER_VERSION,
  };
};
