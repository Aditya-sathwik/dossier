import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { EmailDirection, OutreachStatus } from "@/generated/prisma/enums";
import { prisma as defaultPrisma } from "@/lib/prisma";

import type { ExtractedContact } from "./sheet-parser";

export type DedupeCategory = "READY" | "ALREADY_SENT" | "DUPLICATE_IN_SHEET" | "NO_EMAIL";

export type CategorizedOutreachContact = ExtractedContact & {
  category: DedupeCategory;
  alreadySentAt?: string;
  gmailThreadId?: string;
  existingContactId?: string;
  previousStatus?: OutreachStatus;
};

export type DedupeSummary = {
  total: number;
  readyCount: number;
  alreadySentCount: number;
  noEmailCount: number;
  duplicateInSheetCount: number;
  sheetNames: string[];
  contacts: CategorizedOutreachContact[];
};

/**
 * Cross-references extracted contacts against OutreachContact and EmailMessage
 * tables to isolate fresh contacts, flag already-sent ones, and drop intra-sheet duplicates.
 */
export async function dedupeContacts(
  contactsWithEmail: ExtractedContact[],
  contactsWithoutEmail: ExtractedContact[] = [],
  db: PrismaClient = defaultPrisma,
  sheetNames: string[] = ["Sheet1"],
): Promise<DedupeSummary> {
  const allEmails = [...new Set(contactsWithEmail.map((c) => c.email.toLowerCase()).filter(Boolean))];

  // 1. Fetch existing OutreachContacts
  const existingOutreach = allEmails.length > 0
    ? await db.outreachContact.findMany({
      where: { email: { in: allEmails } },
      select: { id: true, email: true, status: true, sentAt: true, gmailThreadId: true },
    })
    : [];

  const outreachMap = new Map<string, { id: string; status: OutreachStatus; sentAt: Date | null; gmailThreadId: string | null }>();
  for (const entry of existingOutreach) {
    outreachMap.set(entry.email.toLowerCase(), entry);
  }

  // 2. Fetch outgoing EmailMessages to catch any manual applications sent in the past
  const existingOutgoing = allEmails.length > 0
    ? await db.emailMessage.findMany({
      where: {
        direction: EmailDirection.OUTGOING,
      },
      select: { toAddress: true, sentAt: true, threadId: true },
    })
    : [];

  const emailMessageMap = new Map<string, { sentAt: Date; threadId: string }>();
  for (const msg of existingOutgoing) {
    const toLower = msg.toAddress.toLowerCase();
    for (const email of allEmails) {
      if (toLower.includes(email) && !emailMessageMap.has(email)) {
        emailMessageMap.set(email, { sentAt: msg.sentAt, threadId: msg.threadId });
      }
    }
  }

  // 3. Categorize contacts with email
  const seenInSheet = new Set<string>();
  const categorized: CategorizedOutreachContact[] = [];

  for (const contact of contactsWithEmail) {
    const emailLower = contact.email.toLowerCase();

    // Check duplicate in sheet
    if (seenInSheet.has(emailLower)) {
      categorized.push({
        ...contact,
        category: "DUPLICATE_IN_SHEET",
      });
      continue;
    }
    seenInSheet.add(emailLower);

    const outreachRecord = outreachMap.get(emailLower);
    const emailRecord = emailMessageMap.get(emailLower);

    // If marked SENT in OutreachContact or found in EmailMessage, it was sent before!
    if (outreachRecord?.status === OutreachStatus.SENT || emailRecord) {
      const sentDate = outreachRecord?.sentAt ?? emailRecord?.sentAt ?? null;
      const threadId = outreachRecord?.gmailThreadId ?? emailRecord?.threadId ?? undefined;
      categorized.push({
        ...contact,
        category: "ALREADY_SENT",
        alreadySentAt: sentDate ? sentDate.toISOString() : undefined,
        gmailThreadId: threadId,
        existingContactId: outreachRecord?.id,
        previousStatus: outreachRecord?.status,
      });
      continue;
    }

    // Fresh, unsent contact!
    categorized.push({
      ...contact,
      category: "READY",
      existingContactId: outreachRecord?.id,
      previousStatus: outreachRecord?.status,
    });
  }

  // 4. Append contacts without email
  for (const contact of contactsWithoutEmail) {
    categorized.push({
      ...contact,
      category: "NO_EMAIL",
    });
  }

  const readyCount = categorized.filter((c) => c.category === "READY").length;
  const alreadySentCount = categorized.filter((c) => c.category === "ALREADY_SENT").length;
  const duplicateInSheetCount = categorized.filter((c) => c.category === "DUPLICATE_IN_SHEET").length;
  const noEmailCount = categorized.filter((c) => c.category === "NO_EMAIL").length;

  return {
    total: categorized.length,
    readyCount,
    alreadySentCount,
    duplicateInSheetCount,
    noEmailCount,
    sheetNames: sheetNames.length > 0 ? sheetNames : ["Sheet1"],
    contacts: categorized,
  };
}

