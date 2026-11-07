import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { EmailDirection, OutreachStatus } from "@/generated/prisma/enums";

import { dedupeContacts } from "./dedupe";
import type { ExtractedContact } from "./sheet-parser";

describe("dedupeContacts", () => {
  const mockContact = (company: string, email: string): ExtractedContact => ({
    company,
    email,
    secondaryEmails: [],
    phone: "",
    contactPerson: "",
    role: "",
    notes: "",
    sourceRow: 1,
    rawText: `${company} - ${email}`,
  });

  it("flags new emails as READY when not in DB", async () => {
    const mockDb = {
      outreachContact: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const contacts = [mockContact("Acme", "careers@acme.example"), mockContact("Beta", "hr@beta.example")];
    const result = await dedupeContacts(contacts, [], mockDb);

    expect(result.total).toBe(2);
    expect(result.readyCount).toBe(2);
    expect(result.alreadySentCount).toBe(0);
    expect(result.contacts[0].category).toBe("READY");
    expect(result.contacts[1].category).toBe("READY");
  });

  it("flags emails previously sent in OutreachContact as ALREADY_SENT", async () => {
    const sentDate = new Date("2026-11-01T10:00:00Z");
    const mockDb = {
      outreachContact: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "oc_1",
            email: "careers@acme.example",
            status: OutreachStatus.SENT,
            sentAt: sentDate,
            gmailThreadId: "thread_123",
          },
        ]),
      },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const contacts = [mockContact("Acme", "careers@acme.example"), mockContact("Beta", "hr@beta.example")];
    const result = await dedupeContacts(contacts, [], mockDb);

    expect(result.readyCount).toBe(1);
    expect(result.alreadySentCount).toBe(1);

    const acme = result.contacts.find((c) => c.company === "Acme");
    expect(acme?.category).toBe("ALREADY_SENT");
    expect(acme?.alreadySentAt).toBe(sentDate.toISOString());
    expect(acme?.gmailThreadId).toBe("thread_123");

    const beta = result.contacts.find((c) => c.company === "Beta");
    expect(beta?.category).toBe("READY");
  });

  it("flags emails previously sent in EmailMessage as ALREADY_SENT", async () => {
    const sentDate = new Date("2026-10-25T14:30:00Z");
    const mockDb = {
      outreachContact: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue([
          {
            toAddress: "Hiring Team <careers@acme.example>",
            sentAt: sentDate,
            threadId: "gmail_thread_789",
          },
        ]),
      },
    } as unknown as PrismaClient;

    const contacts = [mockContact("Acme", "careers@acme.example")];
    const result = await dedupeContacts(contacts, [], mockDb);

    expect(result.alreadySentCount).toBe(1);
    expect(result.contacts[0].category).toBe("ALREADY_SENT");
    expect(result.contacts[0].alreadySentAt).toBe(sentDate.toISOString());
    expect(result.contacts[0].gmailThreadId).toBe("gmail_thread_789");
  });

  it("handles duplicate emails within the same uploaded sheet", async () => {
    const mockDb = {
      outreachContact: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const contacts = [
      mockContact("Acme Branch 1", "jobs@acme.example"),
      mockContact("Acme Branch 2", "jobs@acme.example"), // Duplicate email
    ];
    const result = await dedupeContacts(contacts, [], mockDb);

    expect(result.readyCount).toBe(1);
    expect(result.duplicateInSheetCount).toBe(1);
    expect(result.contacts[0].category).toBe("READY");
    expect(result.contacts[1].category).toBe("DUPLICATE_IN_SHEET");
  });

  it("categorizes contacts without email as NO_EMAIL", async () => {
    const mockDb = {
      outreachContact: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emailMessage: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const withEmail = [mockContact("Acme", "careers@acme.example")];
    const withoutEmail = [mockContact("Unknown Corp", "")];

    const result = await dedupeContacts(withEmail, withoutEmail, mockDb);
    expect(result.total).toBe(2);
    expect(result.readyCount).toBe(1);
    expect(result.noEmailCount).toBe(1);
    expect(result.contacts.find((c) => c.company === "Unknown Corp")?.category).toBe("NO_EMAIL");
  });
});

