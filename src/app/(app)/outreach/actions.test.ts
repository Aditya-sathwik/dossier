import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    persistent: false,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  })),
}));

vi.mock("@/lib/outreach/send", () => ({
  compileBaseResumePdf: vi.fn(async () => ({
    fileName: "Test_Resume.pdf",
    contentType: "application/pdf",
    data: Buffer.from("pdf-data"),
  })),
  sendSingleOutreachEmail: vi.fn(async () => ({
    success: true,
    threadId: "t_100",
    gmailId: "g_100",
    applicationId: "a_100",
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    outreachContact: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import { prepareResumeAttachmentAction, sendOutreachEmailAction } from "./actions";

describe("outreach batch actions", () => {
  it("prepares resume attachment as base64", async () => {
    const res = await prepareResumeAttachmentAction({});
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok: true");
    expect(res.data.fileName).toBe("Test_Resume.pdf");
    expect(res.data.contentType).toBe("application/pdf");
    expect(res.data.base64).toBe(Buffer.from("pdf-data").toString("base64"));
  });

  it("sends outreach email via action", async () => {
    const res = await sendOutreachEmailAction({
      company: "Acme",
      email: "recruiter@acme.com",
      role: "Frontend Engineer",
      contactPerson: "Bob",
      resumeAttachment: {
        fileName: "Test_Resume.pdf",
        contentType: "application/pdf",
        base64: Buffer.from("pdf-data").toString("base64"),
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("Expected ok: true");
    expect(res.data.success).toBe(true);
    expect(res.data.threadId).toBe("t_100");
    expect(res.data.applicationId).toBe("a_100");
  });
});
