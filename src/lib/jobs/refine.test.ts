import { describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { refineJob } from "./refine";

const provider = vi.hoisted(() => ({ current: undefined as unknown }));
const mockPrisma = vi.hoisted(() => ({
  application: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  chatMessage: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => provider.current }));
vi.mock("@/lib/ai/task-options", () => ({
  loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true, language: null }),
}));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile(), loadFactTexts: async () => [] };
});
vi.mock("@/lib/settings-data", () => ({
  loadSettings: async () => ({
    resumeFormat: "latex" as const,
    baseResumeLatex: "\\documentclass{article}\n\\begin{document}\n\\item Line 1\n\\item Line 2\n\\end{document}",
  }),
}));
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

describe("refineJob - LaTeX flow", () => {
  const context = { id: "test-refine-job", step: async () => { }, signal: new AbortController().signal };

  const baseLatex = `\\documentclass{article}
\\begin{document}
\\section{Experience}
\\begin{itemize}
  \\item Built backend services with Node.js and Redis.
  \\item Led team of 5 engineers delivering SaaS features.
\\end{itemize}
\\end{document}`;

  const mockExtracted = {
    title: "Dev",
    company: "Acme",
    role: "Dev",
    location: null,
    mode: null,
    salary: null,
    deadline: null,
    requirements: [],
    asksForReferences: false,
    language: "English",
  };

  it("converts valid structured edits into hunks without touching database latexCode", async () => {
    mockPrisma.application.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app-latex-1",
      resumeFormat: "latex",
      latexCode: baseLatex,
      extracted: mockExtracted,
      documents: [],
      messages: [],
      postingText: "Hiring Go dev",
      match: null,
      language: "English",
      tone: "WARM",
    });

    mockPrisma.chatMessage.create.mockResolvedValueOnce({
      id: "reply-msg-1",
    });

    provider.current = new MockProvider({
      reply: () => ({
        reply: "I emphasized Go backend experience in the first bullet.",
        edits: [
          {
            blockId: "B2",
            action: "replace",
            find: "\\item Built backend services with Node.js and Redis.",
            replace: "\\item Built backend microservices with Go, Node.js and Redis.",
            reason: "Highlight Go skill",
          },
        ],
      }),
    });

    const result = await refineJob.run(
      {
        applicationId: "app-latex-1",
        messageId: "user-msg-1",
        request: "Add Go experience",
        target: null,
        viewing: "RESUME",
      },
      context,
    );

    expect(result.messageId).toBe("reply-msg-1");
    if (!("hunks" in result)) throw new Error("Expected hunks in result");
    expect(result.hunks).toBeDefined();
    expect(result.hunks).toHaveLength(1);
    expect(result.hunks![0].oldText).toContain("Built backend services with Node.js and Redis.");
    expect(result.hunks![0].newText).toContain("Built backend microservices with Go");
    expect(result.baseLatex).toBe(baseLatex);

    // Critical assertion: Database latexCode must NOT be updated prior to user review
    expect(mockPrisma.application.update).not.toHaveBeenCalled();
  });

  it("handles unmatchable edits gracefully without failing the job", async () => {
    mockPrisma.application.findUniqueOrThrow.mockResolvedValueOnce({
      id: "app-latex-2",
      resumeFormat: "latex",
      latexCode: baseLatex,
      extracted: mockExtracted,
      documents: [],
      messages: [],
      postingText: "Hiring",
      match: null,
      language: "English",
      tone: "WARM",
    });

    mockPrisma.chatMessage.create.mockResolvedValueOnce({
      id: "reply-msg-2",
    });

    provider.current = new MockProvider({
      reply: () => ({
        reply: "I attempted to update the summary.",
        edits: [
          {
            find: "\\item Non-existent line not in the document.",
            replace: "\\item Something new.",
            reason: "Not found",
          },
        ],
      }),
    });

    const result = await refineJob.run(
      {
        applicationId: "app-latex-2",
        messageId: "user-msg-2",
        request: "Update summary",
        target: null,
        viewing: "RESUME",
      },
      context,
    );

    expect(result.messageId).toBe("reply-msg-2");
    if (!("hunks" in result)) throw new Error("Expected hunks in result");
    expect(result.hunks).toEqual([]);
    expect(result.edited).toEqual([]);
  });
});