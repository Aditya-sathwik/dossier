import { z } from "zod";

import type { Tone } from "@/generated/prisma/enums";
import type { ProfileData } from "@/lib/profile";
import { EMAIL_TRACK_PRESETS, type OutreachTrack } from "@/lib/settings";
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

export const WRITE_BASE_EMAIL_VERSION = "write-base-email@1";

const answerSchema = z.object({
  proofPoints: z.array(z.string()),
  subject: z.string(),
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signOff: z.string(),
});

const INSTRUCTIONS = `You write a short, plain-text cold outreach email from a software engineer to an engineering leader or founder, as JSON.
Allowed template variables: {{company}}, {{role}}, {{name}}, {{contactPerson}}.

Fill fields in this exact order:
- proofPoints: 3 concrete items from the candidate's profile covering web/frontend, backend, or mobile (1 project, 1 metric, 1 technology). Copy the wording. Do not invent.
- subject: lowercase, 4 to 7 words, mentions engineering focus and {{company}} (e.g. "full-stack / software engineering at {{company}}"). Never start with "Application".
- greeting: "Hi {{contactPerson}},"
- paragraphs: exactly 3 short paragraphs, 70 to 90 words total across the entire email:
  1. One sentence: candidate's specialization (React.js, Node.js, TypeScript, React Native), years of experience, and checking if {{company}} has engineering openings.
  2. Two sentences max: concrete proof using proofPoints (real systems shipped and metrics achieved).
  3. One sentence: mention resume is attached and ask if they are hiring for full-stack, frontend, or backend roles right now.
- signOff: "Thanks,"

Rules:
- Total word count across paragraphs MUST be under 95 words.
- Never ask for a 15-minute call; ask a simple yes/no hiring question.
- Never praise or describe {{company}}.`;

export const BANNED_BUZZWORDS = /\b(passionate|thrive|cross-functional|Agile|adept|synergy|excited|delighted)\b/i;

export type BaseEmailInput = {
  profile: ProfileData;
  targetRole?: string;
  track?: OutreachTrack;
  tone?: Tone;
  facts?: string[];
};

export type BaseEmailOutput = {
  subject: string;
  body: string;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generates an ultra-concise, high-converting cold outreach email (~75-85 words)
 * adhering strictly to the 6-second rule and factual proof points.
 */
export const writeBaseEmail: Task<BaseEmailInput, BaseEmailOutput> = async (
  provider,
  { profile, targetRole, track = "fullstack", tone = "WARM", facts = [] },
  options,
) => {
  const roleName = targetRole || EMAIL_TRACK_PRESETS[track]?.role || "Full-Stack Engineer";

  const executeCompletion = async () => {
    return provider.complete({
      system: system(
        INSTRUCTIONS,
        `Role Track: ${track} (${roleName})`,
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
          content: `The candidate's profile:\n${profileForPrompt(profile)}\n\nWrite a 75-85 word cold outreach email for ${roleName} roles.`,
        },
      ],
      schema: answerSchema,
      schemaName: "base_outreach_email",
      creativity: options.creativity,
      signal: options.signal,
    });
  };

  let answer = await executeCompletion();

  const buildBody = (ans: typeof answer) => {
    const greeting = ans.greeting.trim() || `Hi {{contactPerson}},`;
    const signOff = ans.signOff.trim() || "Thanks,";
    const cleanParagraphs = ans.paragraphs.map((p) => p.trim()).filter(Boolean);
    return [greeting, ...cleanParagraphs, `${signOff}\n{{name}}`].join("\n\n");
  };

  let body = buildBody(answer);
  let words = countWords(body);

  // If buzzwords exist or word count is far beyond 105 words, retry once
  if (BANNED_BUZZWORDS.test(body) || words > 105 || words < 50) {
    try {
      answer = await executeCompletion();
      body = buildBody(answer);
      words = countWords(body);
    } catch {
      // Keep first attempt or fallback below
    }
  }

  // If still failing quality criteria, fallback to the pre-crafted track preset
  if (BANNED_BUZZWORDS.test(body) || words > 120 || words < 45) {
    const preset = EMAIL_TRACK_PRESETS[track] || EMAIL_TRACK_PRESETS.fullstack;
    return {
      data: {
        subject: preset.subject,
        body: preset.body,
      },
      promptVersion: WRITE_BASE_EMAIL_VERSION,
    };
  }

  const subject = answer.subject.trim() || EMAIL_TRACK_PRESETS[track]?.subject || `full-stack / software engineering at {{company}}`;

  return {
    data: {
      subject,
      body,
    },
    promptVersion: WRITE_BASE_EMAIL_VERSION,
  };
};

