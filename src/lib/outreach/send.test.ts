import { describe, expect, it, vi, beforeEach } from "vitest";
import { compileBaseResumePdf, sendSingleOutreachEmail } from "./send";

vi.mock("@/lib/google/account", () => ({
  loadGoogleAccount: vi.fn(),
}));

vi.mock("@/lib/profile-data", () => ({
  loadProfileName: vi.fn(async () => "Aditya Sharma"),
  loadProfile: vi.fn(async () => ({ basics: { name: "Aditya Sharma" } })),
}));

vi.mock("@/lib/settings-data", () => ({
  loadSettings: vi.fn(async () => ({
    resumeFormat: "standard",
    fileNamePattern: "{name} - {company} - {doc}",
    baseEmailTrack: "fullstack",
    baseEmailSubject: "full-stack / software engineering at {{company}}",
    baseEmailBody: "Hi {{contactPerson}},\n\nReaching out about {{role}} openings at {{company}}.\n\nThanks,\n{{name}}",
    baseCoverLetterRole: "Full-Stack Engineer",
  })),
}));

vi.mock("@/lib/pdf/render", () => ({
  renderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

vi.mock("@/lib/google/gmail", () => ({
  sendMail: vi.fn(async () => ({
    id: "gmail_msg_001",
    threadId: "gmail_thread_001",
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    application: {
      create: vi.fn(async ({ data }) => ({ id: "app_001", ...data })),
    },
    emailMessage: {
      upsert: vi.fn(async ({ create }) => ({ id: "email_001", ...create })),
    },
    outreachContact: {
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      upsert: vi.fn(async ({ where, create, update }) => ({ id: "contact_001", ...create, ...update })),
    },
  },
}));

describe("sendSingleOutreachEmail", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { loadGoogleAccount } = await import("@/lib/google/account");
    vi.mocked(loadGoogleAccount).mockResolvedValue({
      id: "google",
      email: "aditya@gmail.com",
      scopes: ["send", "read"],
      syncProblem: null,
      lastSyncAt: new Date(),
    } as any);
  });

  it("compiles base resume pdf with correct filename pattern", async () => {
    const resume = await compileBaseResumePdf();
    expect(resume.fileName).toContain("Aditya Sharma");
    expect(resume.fileName).toContain("Resume.pdf");
    expect(resume.contentType).toBe("application/pdf");
    expect(resume.data).toBeInstanceOf(Buffer);
  });

  it("sends email with interpolated subject and body and tracks in DB", async () => {
    const { sendMail } = await import("@/lib/google/gmail");
    const { prisma } = await import("@/lib/prisma");

    const result = await sendSingleOutreachEmail({
      contactId: "cnt_123",
      company: "Acme Corp",
      email: "careers@acmeworks.com",
      role: "Backend Engineer",
      contactPerson: "Jane",
    });

    expect(result.success).toBe(true);
    expect(result.threadId).toBe("gmail_thread_001");
    expect(result.applicationId).toBe("app_001");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sendArgs = vi.mocked(sendMail).mock.calls[0][0];
    expect(sendArgs.to).toBe("careers@acmeworks.com");
    expect(sendArgs.subject).toBe("full-stack / software engineering at Acme Corp");
    expect(sendArgs.body).toContain("Hi Jane,");
    expect(sendArgs.body).toContain("Backend Engineer openings at Acme Corp");
    expect(sendArgs.body).toContain("Thanks,\nAditya Sharma");
    expect(sendArgs.attachments?.length).toBe(1);

    expect(prisma.application.create).toHaveBeenCalledTimes(1);
    expect(prisma.emailMessage.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.outreachContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "careers@acmeworks.com" },
        update: expect.objectContaining({
          status: "SENT",
          gmailThreadId: "gmail_thread_001",
        }),
      }),
    );
  });

  it("throws GoogleError if Google account is not connected", async () => {
    const { loadGoogleAccount } = await import("@/lib/google/account");
    vi.mocked(loadGoogleAccount).mockResolvedValueOnce(null);

    await expect(
      sendSingleOutreachEmail({
        company: "Acme Corp",
        email: "careers@acmeworks.com",
      }),
    ).rejects.toThrow("Connect your Google account in Settings → Google first.");
  });
});

