import { describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";

import { writeDocumentsSteps } from "./application-steps";
import { writeDocumentsJob } from "./write-documents";

const provider = vi.hoisted(() => ({ current: undefined as unknown }));
const mockSettings = vi.hoisted(() => ({
  current: {
    resumeFormat: "standard" as "standard" | "latex",
    baseResumeLatex: "",
  },
}));

vi.mock("@/lib/ai", () => ({ getAiProvider: async () => provider.current }));
vi.mock("@/lib/ai/task-options", () => ({
  loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true, language: null }),
}));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
vi.mock("@/lib/settings-data", () => ({
  loadSettings: async () => mockSettings.current,
}));
vi.mock("@/lib/latex/compile", () => ({
  compileLatex: vi.fn(async (latex: string) => {
    if (latex.includes("FAIL_COMPILE")) {
      return { ok: false, error: "Syntax error on line 1", diagnostics: ["! Syntax error"] };
    }
    return { ok: true, pdf: Buffer.from("pdf-data") };
  }),
}));
vi.mock("@/lib/ai/tasks/tailor-latex-resume", () => ({
  tailorLatexResume: vi.fn(async (_p, input) => {
    if (input.latexSource.includes("FAIL_TAILOR")) {
      throw new Error("AI tailoring crashed");
    }
    return {
      data: `${input.latexSource}\n% Tailored for ${input.extracted.company}`,
      promptVersion: "tailor-latex-resume@1",
    };
  }),
}));
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

describe("writeDocumentsJob (E7-6)", () => {
  const extracted = {
    title: "Designer · Ledgerly",
    company: "Ledgerly",
    role: "Designer",
    location: null,
    mode: null,
    salary: null,
    deadline: null,
    requirements: [],
    asksForReferences: false,
    language: "English",
  };

  it("tailors the resume, then writes the letter, naming each step when no comments exist", async () => {
    mockSettings.current = { resumeFormat: "standard", baseResumeLatex: "" };
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer at Google.", roles: [], projects: [], skills: ["Figma"], education: [] }
          : {
              recipient: "Ledgerly · Hiring team",
              greeting: "Dear Ledgerly team,",
              paragraphs: [{ label: "Opening", text: "I'd love to join Ledgerly." }],
              signOff: "Warm regards,",
            },
    });

    const steps: string[] = [];
    const result = await writeDocumentsJob.run(
      { readJobId: "read-job", posting: "Ledgerly is hiring.", extracted, match: { items: [] }, tone: "WARM", note: "" },
      { id: "test-job", step: async (name) => void steps.push(name), signal: new AbortController().signal },
    );

    const expectedSteps = writeDocumentsSteps({ hasComments: false, latex: false });
    // It reports all steps except the saving step which is handled post-job
    expect(steps).toEqual(expectedSteps.slice(0, 2));
    expect(result.resumeWith).toBe("tailor-resume@6");
    expect(result.letterWith).toBe("write-cover-letter@5");
    expect(result.latexStatus).toBe("none");
    expect(result.latex).toBeUndefined();
    expect(result.resume[0]).toMatchObject({ id: "summary", unverified: ["Google"] });
    expect(result.letter.map((unit) => unit.id)).toEqual(["recipient", "greeting", "paragraph:1", "sign-off"]);
  });

  it("reports 'Reading your comments and instructions' when comments or notes exist", async () => {
    mockSettings.current = { resumeFormat: "standard", baseResumeLatex: "" };
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer.", roles: [], projects: [], skills: [], education: [] }
          : {
              recipient: "Ledgerly",
              greeting: "Hi,",
              paragraphs: [{ label: "Opening", text: "Hi." }],
              signOff: "Best,",
            },
    });

    const steps: string[] = [];
    await writeDocumentsJob.run(
      {
        readJobId: "read-job",
        posting: "Ledgerly is hiring.",
        extracted,
        match: { items: [{ requirement: "TypeScript", result: "covered", skill: "TypeScript", experienceIds: [], note: null, comment: "5 years exp" }] },
        tone: "WARM",
        note: "Also note my open source work.",
      },
      { id: "test-job", step: async (name) => void steps.push(name), signal: new AbortController().signal },
    );

    const expectedSteps = writeDocumentsSteps({ hasComments: true, latex: false });
    expect(steps).toEqual(expectedSteps.slice(0, 3));
    expect(steps[0]).toBe("Reading your comments and instructions");
  });

  it("tailors and compiles LaTeX when resumeFormat is latex and baseResumeLatex exists", async () => {
    mockSettings.current = {
      resumeFormat: "latex",
      baseResumeLatex: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
    };
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer.", roles: [], projects: [], skills: [], education: [] }
          : {
              recipient: "Ledgerly",
              greeting: "Hi,",
              paragraphs: [{ label: "Opening", text: "Hi." }],
              signOff: "Best,",
            },
    });

    const steps: string[] = [];
    const result = await writeDocumentsJob.run(
      {
        readJobId: "read-job",
        posting: "Ledgerly is hiring.",
        extracted,
        match: { items: [{ requirement: "LaTeX", result: "covered", skill: "LaTeX", experienceIds: [], note: null, comment: "Authored papers" }] },
        tone: "WARM",
        note: "",
      },
      { id: "test-job", step: async (name) => void steps.push(name), signal: new AbortController().signal },
    );

    const expectedSteps = writeDocumentsSteps({ hasComments: true, latex: true });
    expect(steps).toEqual(expectedSteps.slice(0, 4));
    expect(result.latexStatus).toBe("tailored");
    expect(result.latex).toContain("% Tailored for Ledgerly");
    expect(result.baseLatex).toBe(mockSettings.current.baseResumeLatex);
  });

  it("falls back gracefully to base resume when LaTeX compilation fails", async () => {
    mockSettings.current = {
      resumeFormat: "latex",
      baseResumeLatex: "\\documentclass{article}\nFAIL_COMPILE\n\\end{document}",
    };
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer.", roles: [], projects: [], skills: [], education: [] }
          : {
              recipient: "Ledgerly",
              greeting: "Hi,",
              paragraphs: [{ label: "Opening", text: "Hi." }],
              signOff: "Best,",
            },
    });

    const steps: string[] = [];
    const result = await writeDocumentsJob.run(
      {
        readJobId: "read-job",
        posting: "Ledgerly is hiring.",
        extracted,
        match: { items: [] },
        tone: "WARM",
        note: "",
      },
      { id: "test-job", step: async (name) => void steps.push(name), signal: new AbortController().signal },
    );

    expect(result.latexStatus).toBe("fallback");
    expect(result.latexError).toBe("Syntax error on line 1");
    expect(result.latex).toBe(mockSettings.current.baseResumeLatex);
  });
});
