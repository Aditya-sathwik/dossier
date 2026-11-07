"use server";

import { z } from "zod";

import { OutreachStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { GoogleError } from "@/lib/google/errors";
import { dedupeContacts, type DedupeSummary } from "@/lib/outreach/dedupe";
import { compileBaseResumePdf, sendSingleOutreachEmail, type CompiledResume } from "@/lib/outreach/send";
import {
  fetchGoogleSpreadsheetBuffer,
  parseCsvText,
  parseSpreadsheetBuffer,
} from "@/lib/outreach/sheet-parser";
import { prisma } from "@/lib/prisma";

export const parseSheetFromUrl = action(
  z.object({ url: z.string().trim().url() }),
  async ({ url }) => {
    let sheetBuffer: Uint8Array;
    let format: "xlsx" | "csv";
    try {
      const res = await fetchGoogleSpreadsheetBuffer(url);
      sheetBuffer = res.buffer;
      format = res.format;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch Google Sheet.";
      throw new ActionError(msg);
    }

    const parsed =
      format === "xlsx"
        ? parseSpreadsheetBuffer(sheetBuffer, url)
        : parseCsvText(Buffer.from(sheetBuffer).toString("utf-8"), url);

    const summary = await dedupeContacts(
      parsed.contactsWithEmail,
      parsed.contactsWithoutEmail,
      prisma,
      parsed.sheetNames,
    );

    // Auto-persist:
    // 1. Contacts with email
    const readyList = summary.contacts.filter((c) => c.category === "READY");
    for (const c of readyList) {
      if (!c.email || !c.email.includes("@")) continue;
      await prisma.outreachContact.upsert({
        where: { email: c.email.toLowerCase() },
        create: {
          email: c.email.toLowerCase(),
          company: c.company,
          contactPerson: c.contactPerson || "",
          phone: c.phone || "",
          role: c.role || "",
          notes: c.notes || "",
          sheetName: c.sheetName || "Sheet1",
          source: url,
          status: OutreachStatus.NEW,
        },
        update: {
          company: c.company || undefined,
          contactPerson: c.contactPerson || undefined,
          phone: c.phone || undefined,
          role: c.role || undefined,
          notes: c.notes || undefined,
          sheetName: c.sheetName || undefined,
          source: url,
        },
      });
    }

    // 2. Pending companies without email (research backlog)
    if (parsed.contactsWithoutEmail.length > 0) {
      await prisma.outreachPendingCompany.deleteMany({ where: { source: url } });
      await prisma.outreachPendingCompany.createMany({
        data: parsed.contactsWithoutEmail.map((c) => ({
          company: c.company,
          contactPerson: c.contactPerson || "",
          phone: c.phone || "",
          notes: c.notes || "",
          sheetName: c.sheetName || "Sheet1",
          source: url,
        })),
      });
    }

    return {
      source: parsed.source,
      sheetNames: parsed.sheetNames,
      summary,
    };
  },
);

export const parseSheetFromFile = action(
  z.object({
    base64Data: z.string().min(1),
    fileName: z.string().default("uploaded_sheet.xlsx"),
  }),
  async ({ base64Data, fileName }) => {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const parsed = parseSpreadsheetBuffer(buffer, fileName);
    const summary = await dedupeContacts(
      parsed.contactsWithEmail,
      parsed.contactsWithoutEmail,
      prisma,
      parsed.sheetNames,
    );

    // Auto-persist:
    // 1. Contacts with email
    const readyList = summary.contacts.filter((c) => c.category === "READY");
    for (const c of readyList) {
      if (!c.email || !c.email.includes("@")) continue;
      await prisma.outreachContact.upsert({
        where: { email: c.email.toLowerCase() },
        create: {
          email: c.email.toLowerCase(),
          company: c.company,
          contactPerson: c.contactPerson || "",
          phone: c.phone || "",
          role: c.role || "",
          notes: c.notes || "",
          sheetName: c.sheetName || "Sheet1",
          source: fileName,
          status: OutreachStatus.NEW,
        },
        update: {
          company: c.company || undefined,
          contactPerson: c.contactPerson || undefined,
          phone: c.phone || undefined,
          role: c.role || undefined,
          notes: c.notes || undefined,
          sheetName: c.sheetName || undefined,
          source: fileName,
        },
      });
    }

    // 2. Pending companies without email
    if (parsed.contactsWithoutEmail.length > 0) {
      await prisma.outreachPendingCompany.deleteMany({ where: { source: fileName } });
      await prisma.outreachPendingCompany.createMany({
        data: parsed.contactsWithoutEmail.map((c) => ({
          company: c.company,
          contactPerson: c.contactPerson || "",
          phone: c.phone || "",
          notes: c.notes || "",
          sheetName: c.sheetName || "Sheet1",
          source: fileName,
        })),
      });
    }

    return {
      source: fileName,
      sheetNames: parsed.sheetNames,
      summary,
    };
  },
);

const contactInputSchema = z.object({
  company: z.string().default(""),
  email: z.string().trim().toLowerCase(),
  contactPerson: z.string().default(""),
  phone: z.string().default(""),
  role: z.string().default(""),
  notes: z.string().default(""),
  sheetName: z.string().default(""),
  source: z.string().default(""),
});

export const saveOutreachContacts = action(
  z.object({
    contacts: z.array(contactInputSchema),
  }),
  async ({ contacts }, { toast }) => {
    let saved = 0;
    for (const c of contacts) {
      if (!c.email || !c.email.includes("@")) continue;

      const existing = await prisma.outreachContact.findUnique({
        where: { email: c.email },
        select: { id: true, status: true },
      });

      if (existing) {
        if (existing.status !== OutreachStatus.SENT) {
          await prisma.outreachContact.update({
            where: { id: existing.id },
            data: {
              company: c.company || undefined,
              contactPerson: c.contactPerson || undefined,
              phone: c.phone || undefined,
              role: c.role || undefined,
              notes: c.notes || undefined,
              sheetName: c.sheetName || undefined,
              source: c.source || undefined,
            },
          });
          saved++;
        }
      } else {
        await prisma.outreachContact.create({
          data: {
            company: c.company,
            email: c.email,
            contactPerson: c.contactPerson,
            phone: c.phone,
            role: c.role,
            notes: c.notes,
            sheetName: c.sheetName || "Sheet1",
            source: c.source,
            status: OutreachStatus.NEW,
          },
        });
        saved++;
      }
    }

    toast(`Saved ${saved} ${saved === 1 ? "contact" : "contacts"}.`);
    return { savedCount: saved };
  },
);

export const resetOutreachSentAction = action(
  z.object({
    mode: z.enum(["single", "selected", "date_range", "all"]),
    contactId: z.string().optional(),
    contactIds: z.array(z.string()).optional(),
    email: z.string().optional(),
    emails: z.array(z.string()).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
  async (input, { toast }) => {
    let count = 0;

    if (input.mode === "single") {
      if (input.contactId) {
        await prisma.outreachContact.update({
          where: { id: input.contactId },
          data: {
            status: OutreachStatus.NEW,
            sentAt: null,
            gmailThreadId: null,
            lastError: null,
          },
        });
        count = 1;
      } else if (input.email) {
        await prisma.outreachContact.update({
          where: { email: input.email.toLowerCase() },
          data: {
            status: OutreachStatus.NEW,
            sentAt: null,
            gmailThreadId: null,
            lastError: null,
          },
        });
        count = 1;
      }
    } else if (input.mode === "selected") {
      if (input.contactIds && input.contactIds.length > 0) {
        const res = await prisma.outreachContact.updateMany({
          where: { id: { in: input.contactIds } },
          data: {
            status: OutreachStatus.NEW,
            sentAt: null,
            gmailThreadId: null,
            lastError: null,
          },
        });
        count = res.count;
      } else if (input.emails && input.emails.length > 0) {
        const res = await prisma.outreachContact.updateMany({
          where: { email: { in: input.emails.map((e) => e.toLowerCase()) } },
          data: {
            status: OutreachStatus.NEW,
            sentAt: null,
            gmailThreadId: null,
            lastError: null,
          },
        });
        count = res.count;
      }
    } else if (input.mode === "date_range" && input.startDate && input.endDate) {
      const start = new Date(input.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(input.endDate);
      end.setHours(23, 59, 59, 999);

      const res = await prisma.outreachContact.updateMany({
        where: {
          status: OutreachStatus.SENT,
          sentAt: {
            gte: start,
            lte: end,
          },
        },
        data: {
          status: OutreachStatus.NEW,
          sentAt: null,
          gmailThreadId: null,
          lastError: null,
        },
      });
      count = res.count;
    } else if (input.mode === "all") {
      const res = await prisma.outreachContact.updateMany({
        where: { status: OutreachStatus.SENT },
        data: {
          status: OutreachStatus.NEW,
          sentAt: null,
          gmailThreadId: null,
          lastError: null,
        },
      });
      count = res.count;
    }

    toast(`Reset ${count} ${count === 1 ? "contact" : "contacts"} back to Ready to Send.`);
    return { resetCount: count };
  },
);

export const clearOutreachDataAction = action(
  z.object({
    scope: z.enum(["all", "missing", "ready", "sent"]),
  }),
  async ({ scope }, { toast }) => {
    let message = "";
    if (scope === "all") {
      await prisma.$transaction([
        prisma.outreachPendingCompany.deleteMany(),
        prisma.outreachContact.deleteMany(),
      ]);
      message = "Cleared all outreach contacts and sheets.";
    } else if (scope === "missing") {
      const { count } = await prisma.outreachPendingCompany.deleteMany();
      message = `Cleared ${count} pending companies without emails.`;
    } else if (scope === "ready") {
      const { count } = await prisma.outreachContact.deleteMany({
        where: { status: OutreachStatus.NEW },
      });
      message = `Cleared ${count} unsent contacts.`;
    } else if (scope === "sent") {
      const { count } = await prisma.outreachContact.updateMany({
        where: { status: OutreachStatus.SENT },
        data: { status: OutreachStatus.NEW, sentAt: null, gmailThreadId: null },
      });
      message = `Reset ${count} sent contacts to ready.`;
    }
    toast(message);
    return { ok: true, message };
  },
);

export const loadStoredOutreachContacts = action(
  z.object({}),
  async () => {
    const [contacts, pending] = await Promise.all([
      prisma.outreachContact.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.outreachPendingCompany.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    return { contacts, pending };
  },
);

export const prepareResumeAttachmentAction = action(
  z.object({}),
  async () => {
    try {
      const compiled = await compileBaseResumePdf();
      return {
        fileName: compiled.fileName,
        contentType: compiled.contentType,
        base64: compiled.data.toString("base64"),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to compile base resume attachment.";
      throw new ActionError(msg);
    }
  },
);

export const sendOutreachEmailAction = action(
  z.object({
    contactId: z.string().optional(),
    company: z.string(),
    email: z.string().trim().email(),
    role: z.string().optional(),
    contactPerson: z.string().optional(),
    customSubject: z.string().optional(),
    customBody: z.string().optional(),
    resumeAttachment: z
      .object({
        fileName: z.string(),
        contentType: z.string(),
        base64: z.string(),
      })
      .optional(),
  }),
  async (input) => {
    try {
      const attachment: CompiledResume | undefined = input.resumeAttachment
        ? {
            fileName: input.resumeAttachment.fileName,
            contentType: input.resumeAttachment.contentType,
            data: Buffer.from(input.resumeAttachment.base64, "base64"),
          }
        : undefined;

      const result = await sendSingleOutreachEmail({
        contactId: input.contactId,
        company: input.company,
        email: input.email,
        role: input.role,
        contactPerson: input.contactPerson,
        customSubject: input.customSubject,
        customBody: input.customBody,
        resumeAttachment: attachment,
      });

      return result;
    } catch (err) {
      if (err instanceof GoogleError) {
        throw new ActionError(err.message);
      }
      const msg = err instanceof Error ? err.message : "Failed to send outreach email.";
      throw new ActionError(msg);
    }
  },
);
