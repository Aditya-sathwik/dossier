"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { getAiProvider } from "@/lib/ai";
import { isAiConfigured } from "@/lib/ai/config";
import { writeBaseCoverLetter } from "@/lib/ai/tasks/write-base-cover-letter";
import { writeBaseEmail } from "@/lib/ai/tasks/write-base-email";
import { loadProfile } from "@/lib/profile-data";
import type { OutreachTrack } from "@/lib/settings";
import { loadSettings, saveSettings } from "@/lib/settings-data";

export const saveBaseEmail = action(
  z.object({
    subject: z.string().trim().min(1, "Enter a subject line."),
    body: z.string().trim().min(1, "Write an email message."),
    track: z.enum(["fullstack", "frontend", "backend", "mobile"]).default("fullstack"),
  }),
  async ({ subject, body, track }, { toast }) => {
    await saveSettings({
      baseEmailSubject: subject,
      baseEmailBody: body,
      baseEmailTrack: track,
    });
    toast("Cold outreach email saved.");
    return { subject, body, track };
  },
);

export const generateBaseEmailAction = action(
  z.object({
    track: z.enum(["fullstack", "frontend", "backend", "mobile"]).default("fullstack"),
    role: z.string().trim().optional(),
  }),
  async ({ track, role }, { toast }) => {
    if (!(await isAiConfigured())) {
      throw new ActionError("AI is not configured. Choose a provider in Settings → AI provider first.");
    }

    const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
    const provider = await getAiProvider();

    try {
      const result = await writeBaseEmail(
        provider,
        {
          profile,
          track: track as OutreachTrack,
          targetRole: role,
          tone: settings.defaultTone,
        },
        {
          creativity: settings.creativity,
          strict: settings.strict,
          language: settings.docLanguage,
        },
      );

      toast("Cold email generated with AI.");
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate base email.";
      throw new ActionError(msg);
    }
  },
);

export const saveBaseCoverLetter = action(
  z.object({
    subject: z.string().trim().min(1, "Enter a subject line."),
    body: z.string().trim().min(1, "Write a cover letter message."),
    role: z.string().trim().default(""),
  }),
  async ({ subject, body, role }, { toast }) => {
    await saveSettings({
      baseCoverLetterSubject: subject,
      baseCoverLetterBody: body,
      baseCoverLetterRole: role,
    });
    toast("Base cover letter saved.");
    return { subject, body, role };
  },
);

export const generateBaseCoverLetterAction = action(
  z.object({
    role: z.string().trim().default("Full-Stack Engineer"),
  }),
  async ({ role }, { toast }) => {
    if (!(await isAiConfigured())) {
      throw new ActionError("AI is not configured. Choose a provider in Settings → AI provider first.");
    }

    const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
    const provider = await getAiProvider();

    try {
      const result = await writeBaseCoverLetter(
        provider,
        {
          profile,
          targetRole: role || "Full-Stack Engineer",
          tone: settings.defaultTone,
        },
        {
          creativity: settings.creativity,
          strict: settings.strict,
          language: settings.docLanguage,
        },
      );

      toast("Cover letter draft generated with AI.");
      return result.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate base cover letter.";
      throw new ActionError(msg);
    }
  },
);
