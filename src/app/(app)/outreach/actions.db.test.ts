import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OutreachStatus } from "@/generated/prisma/enums";
import { createTestClient, resetDatabase } from "@/test/db";

import { loadStoredOutreachContacts, parseSheetFromFile, resetOutreachSentAction, saveOutreachContacts } from "./actions";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));

const prisma = () => db.client!;

beforeEach(async () => {
  await resetDatabase(prisma());
});

afterAll(() => prisma().$disconnect());

describe("outreach actions", () => {
  describe("saveOutreachContacts & loadStoredOutreachContacts", () => {
    it("saves contacts to DB with status NEW and loads them back", async () => {
      const result = await saveOutreachContacts({
        contacts: [
          {
            company: "Acme Corp",
            email: "careers@acme.example",
            contactPerson: "Alice",
            phone: "1234567890",
            role: "",
            notes: "",
            source: "test.csv",
          },
          {
            company: "Beta Ltd",
            email: "hr@beta.example",
            contactPerson: "Bob",
            phone: "",
            role: "",
            notes: "",
            source: "test.csv",
          },
        ],
      });

      expect(result).toEqual({ ok: true, data: { savedCount: 2 }, toast: "Saved 2 contacts." });

      const loaded = await loadStoredOutreachContacts({});
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw new Error("failed to load");
      expect(loaded.data.contacts).toHaveLength(2);
      expect(loaded.data.contacts.some((c) => c.email === "careers@acme.example" && c.status === OutreachStatus.NEW)).toBe(true);
      expect(loaded.data.contacts.some((c) => c.email === "hr@beta.example" && c.status === OutreachStatus.NEW)).toBe(true);
    });

    it("does not overwrite SENT status when saving updated contact info", async () => {
      // Pre-seed an existing SENT contact
      const sentDate = new Date("2026-11-01T12:00:00Z");
      await prisma().outreachContact.create({
        data: {
          company: "ZINFI",
          email: "hrteam@zinfitech.com",
          status: OutreachStatus.SENT,
          sentAt: sentDate,
          gmailThreadId: "th_1",
        },
      });

      // Try re-saving ZINFI with new phone
      const result = await saveOutreachContacts({
        contacts: [
          {
            company: "ZINFI Technologies",
            email: "hrteam@zinfitech.com",
            contactPerson: "Gopi",
            phone: "7624937351",
            role: "",
            notes: "",
            source: "update.xlsx",
          },
        ],
      });

      expect(result.ok).toBe(true);

      const record = await prisma().outreachContact.findUniqueOrThrow({
        where: { email: "hrteam@zinfitech.com" },
      });
      // Status and sentAt must remain intact!
      expect(record.status).toBe(OutreachStatus.SENT);
      expect(record.sentAt?.toISOString()).toBe(sentDate.toISOString());
    });
  });

  describe("parseSheetFromFile with deduplication against DB", () => {
    it("correctly flags contacts as READY or ALREADY_SENT based on real DB records", async () => {
      // Pre-seed one sent contact in DB
      await prisma().outreachContact.create({
        data: {
          company: "Acme Corp",
          email: "careers@acme.example",
          status: OutreachStatus.SENT,
          sentAt: new Date("2026-10-30T10:00:00Z"),
        },
      });

      const csvContent = `Company,Email,Phone\nAcme Corp,careers@acme.example,111\nFresh Inc,hello@fresh.example,222`;
      const base64Data = Buffer.from(csvContent).toString("base64");

      const result = await parseSheetFromFile({
        base64Data,
        fileName: "test_batch.csv",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("parse failed");

      expect(result.data.summary.total).toBe(2);
      expect(result.data.summary.readyCount).toBe(1);
      expect(result.data.summary.alreadySentCount).toBe(1);

      const acme = result.data.summary.contacts.find((c) => c.company === "Acme Corp");
      expect(acme?.category).toBe("ALREADY_SENT");

      const fresh = result.data.summary.contacts.find((c) => c.company === "Fresh Inc");
      expect(fresh?.category).toBe("READY");
    });
  });

  describe("resetOutreachSentAction (The 3 Reset Modes)", () => {
    beforeEach(async () => {
      // Seed 3 sent contacts on different dates
      await prisma().outreachContact.createMany({
        data: [
          {
            company: "Company 1",
            email: "c1@test.com",
            status: OutreachStatus.SENT,
            sentAt: new Date("2026-11-01T12:00:00Z"),
          },
          {
            company: "Company 2",
            email: "c2@test.com",
            status: OutreachStatus.SENT,
            sentAt: new Date("2026-11-05T12:00:00Z"),
          },
          {
            company: "Company 3",
            email: "c3@test.com",
            status: OutreachStatus.SENT,
            sentAt: new Date("2026-11-08T12:00:00Z"),
          },
        ],
      });
    });

    it("Mode 1: resets single contact by ID", async () => {
      const contact = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c1@test.com" } });
      const res = await resetOutreachSentAction({
        mode: "single",
        contactId: contact.id,
      });

      expect(res.ok).toBe(true);
      const updated = await prisma().outreachContact.findUniqueOrThrow({ where: { id: contact.id } });
      expect(updated.status).toBe(OutreachStatus.NEW);
      expect(updated.sentAt).toBeNull();
    });

    it("Mode 1: resets single contact by email", async () => {
      const res = await resetOutreachSentAction({
        mode: "single",
        email: "c2@test.com",
      });

      expect(res.ok).toBe(true);
      const updated = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c2@test.com" } });
      expect(updated.status).toBe(OutreachStatus.NEW);
      expect(updated.sentAt).toBeNull();
    });

    it("Mode 1: resets selected contacts by emails array", async () => {
      const res = await resetOutreachSentAction({
        mode: "selected",
        emails: ["c1@test.com", "c3@test.com"],
      });

      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("reset failed");
      expect(res.data.resetCount).toBe(2);

      const c1 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c1@test.com" } });
      const c2 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c2@test.com" } });
      const c3 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c3@test.com" } });

      expect(c1.status).toBe(OutreachStatus.NEW);
      expect(c2.status).toBe(OutreachStatus.SENT);
      expect(c3.status).toBe(OutreachStatus.NEW);
    });

    it("Mode 2: resets contacts within a date range", async () => {
      const res = await resetOutreachSentAction({
        mode: "date_range",
        startDate: "2026-11-01",
        endDate: "2026-11-06",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("reset failed");
      expect(res.data.resetCount).toBe(2);

      const c1 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c1@test.com" } });
      const c2 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c2@test.com" } });
      const c3 = await prisma().outreachContact.findUniqueOrThrow({ where: { email: "c3@test.com" } });

      expect(c1.status).toBe(OutreachStatus.NEW);
      expect(c2.status).toBe(OutreachStatus.NEW);
      expect(c3.status).toBe(OutreachStatus.SENT); // Outside range
    });

    it("Mode 3: hard reset all sent contacts", async () => {
      const res = await resetOutreachSentAction({
        mode: "all",
      });

      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("reset failed");
      expect(res.data.resetCount).toBe(3);

      const remainingSent = await prisma().outreachContact.count({ where: { status: OutreachStatus.SENT } });
      expect(remainingSent).toBe(0);
    });
  });
});

