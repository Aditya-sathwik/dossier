import "server-only";

import { ApplicationStatus, DocumentKind, EmailDirection, OutreachStatus } from "@/generated/prisma/enums";
import { resolveFileName } from "@/lib/file-name";
import { loadGoogleAccount } from "@/lib/google/account";
import { GoogleError } from "@/lib/google/errors";
import { sendMail } from "@/lib/google/gmail";
import type { Attachment } from "@/lib/google/mime";
import { baseLatexOrGenerated } from "@/lib/latex/base";
import { LatexRenderError, renderLatexPdf } from "@/lib/latex/render";
import { renderPdf } from "@/lib/pdf/render";
import { prisma } from "@/lib/prisma";
import { loadProfile, loadProfileName } from "@/lib/profile-data";
import {
  DEFAULT_BASE_EMAIL_BODY,
  DEFAULT_BASE_EMAIL_SUBJECT,
  DEFAULT_BASE_ROLE,
  EMAIL_TRACK_PRESETS,
} from "@/lib/settings";
import { loadSettings } from "@/lib/settings-data";

import { interpolateTemplate } from "./template";

export type CompiledResume = {
  fileName: string;
  contentType: string;
  data: Buffer;
};

/**
 * Pre-compiles the user's Base Resume PDF once so that batch sends do not
 * invoke Chromium / LaTeX repeatedly for every single recipient.
 */
export async function compileBaseResumePdf(): Promise<CompiledResume> {
  const [name, settings] = await Promise.all([loadProfileName(), loadSettings()]);
  const fileName = resolveFileName(settings.fileNamePattern, {
    name,
    company: "Company",
    role: settings.baseCoverLetterRole || DEFAULT_BASE_ROLE,
    doc: DocumentKind.RESUME,
    date: new Date(),
  });

  let data: Buffer;
  if (settings.resumeFormat === "latex") {
    const profile = await loadProfile();
    try {
      data = await renderLatexPdf(baseLatexOrGenerated(settings, profile));
    } catch (err) {
      const msg = err instanceof LatexRenderError ? err.message : "Failed to compile base LaTeX resume.";
      throw new GoogleError("unavailable", `Could not compile resume attachment: ${msg}`);
    }
  } else {
    const rendered = await renderPdf("/print/base");
    data = Buffer.from(rendered);
  }

  return {
    fileName,
    contentType: "application/pdf",
    data,
  };
}

export type SendOutreachParams = {
  contactId?: string;
  company: string;
  email: string;
  role?: string;
  contactPerson?: string;
  customSubject?: string;
  customBody?: string;
  resumeAttachment?: CompiledResume;
};

export type SendOutreachResult = {
  success: boolean;
  threadId: string;
  gmailId: string;
  applicationId: string;
};

/**
 * Sends a cold outreach email to a single company/recruiter using Gmail API.
 * Attaches the Base Resume PDF, interpolates cover letter variables, logs
 * an Application record in Dossier, and updates the OutreachContact.
 */
export async function sendSingleOutreachEmail(params: SendOutreachParams): Promise<SendOutreachResult> {
  const account = await loadGoogleAccount();
  if (!account) {
    throw new GoogleError("not-connected", "Connect your Google account in Settings → Google first.");
  }

  const [name, settings] = await Promise.all([loadProfileName(), loadSettings()]);
  const senderName = name.trim().replace(/[<>"]/g, "");
  const from = senderName ? `${senderName} <${account.email}>` : account.email;

  // Use pre-compiled attachment or compile on demand
  const attachment = params.resumeAttachment || (await compileBaseResumePdf());

  const activeTrack = settings.baseEmailTrack || "fullstack";
  const defaultRole = EMAIL_TRACK_PRESETS[activeTrack]?.role || settings.baseCoverLetterRole || DEFAULT_BASE_ROLE;
  const targetRole = params.role?.trim() || defaultRole;

  const subjectTemplate = params.customSubject || settings.baseEmailSubject || DEFAULT_BASE_EMAIL_SUBJECT;
  const bodyTemplate = params.customBody || settings.baseEmailBody || DEFAULT_BASE_EMAIL_BODY;

  if (!bodyTemplate.trim()) {
    throw new GoogleError("unavailable", "The outreach email is empty. Set your base email template before sending.");
  }

  const templateVars = {
    company: params.company,
    role: targetRole,
    contactPerson: params.contactPerson,
    myName: name,
  };

  const subject = interpolateTemplate(subjectTemplate, templateVars).trim() || "full-stack / software engineering";
  const body = interpolateTemplate(bodyTemplate, templateVars).trim();

  const attachments: Attachment[] = [
    {
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      data: attachment.data,
    },
  ];

  // Send via Gmail
  const sent = await sendMail({
    from,
    to: params.email.trim(),
    subject,
    body,
    attachments,
  });

  // Track in Dossier via transaction
  const targetCompany = params.company.trim() || "Company";

  const application = await prisma.application.create({
    data: {
      company: targetCompany,
      role: targetRole,
      status: ApplicationStatus.SENT,
      sentAt: new Date(),
      emailThreadId: sent.threadId,
    },
  });

  await prisma.emailMessage.upsert({
    where: { gmailId: sent.id },
    create: {
      gmailId: sent.id,
      threadId: sent.threadId,
      applicationId: application.id,
      direction: EmailDirection.OUTGOING,
      fromName: senderName,
      fromAddress: account.email.toLowerCase(),
      toAddress: params.email.trim(),
      subject,
      body,
      sentAt: new Date(),
      handledAt: new Date(),
    },
    update: {},
  });

  const emailKey = params.email.trim().toLowerCase();
  await prisma.outreachContact.upsert({
    where: { email: emailKey },
    create: {
      email: emailKey,
      company: targetCompany,
      contactPerson: params.contactPerson?.trim() || "",
      role: targetRole,
      status: OutreachStatus.SENT,
      sentAt: new Date(),
      gmailThreadId: sent.threadId,
      applicationId: application.id,
    },
    update: {
      company: targetCompany || undefined,
      contactPerson: params.contactPerson?.trim() || undefined,
      role: targetRole || undefined,
      status: OutreachStatus.SENT,
      sentAt: new Date(),
      gmailThreadId: sent.threadId,
      applicationId: application.id,
      lastError: null,
    },
  });

  return {
    success: true,
    threadId: sent.threadId,
    gmailId: sent.id,
    applicationId: application.id,
  };
}

