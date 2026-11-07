import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

vi.mock("@/lib/google/account", () => ({
  googleConnection: vi.fn(async () => ({ status: "disconnected" as const })),
}));

vi.mock("@/lib/settings-data", () => ({
  loadSettings: vi.fn(async () => ({
    baseCoverLetterSubject: "Subject",
    baseCoverLetterBody: "Body",
    baseCoverLetterRole: "Role",
  })),
}));

vi.mock("@/lib/profile-data", () => ({
  loadProfileName: vi.fn(async () => "Aditya"),
}));

import OutreachPage from "./page";

const prisma = () => db.client!;

beforeEach(async () => {
  await resetDatabase(prisma());
});

afterAll(() => prisma().$disconnect());

describe("OutreachPage", () => {
  it("executes OutreachPage server component and queries prisma.outreachContact without error", async () => {
    // Insert a dummy contact
    const contact = await prisma().outreachContact.create({
      data: {
        email: "page-test@example.com",
        company: "Test Co",
        status: "NEW",
      },
    });

    const jsx = await OutreachPage();
    expect(jsx).toBeDefined();
    expect(jsx.type).toBeDefined();
    expect(jsx.props.initialContacts.some((c: any) => c.email === "page-test@example.com")).toBe(true);
  });
});
