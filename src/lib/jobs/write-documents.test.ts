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

  it("tailors the resume, then writes the letter in standard mode", async () => {
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
    expect(steps).toEqual(expectedSteps.slice(0, 2));
    expect(result.resumeWith).toBe("tailor-resume@6");
    expect(result.letterWith).toBe("write-cover-letter@5");
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

  it("skips tailorResume and provides minimal units when resumeFormat is latex", async () => {
    mockSettings.current = {
      resumeFormat: "latex",
      baseResumeLatex: "\\documentclass{article}\n\\begin{document}\nBase resume\n\\end{document}",
    };
    // Provider only called for writeCoverLetter!
    provider.current = new MockProvider({
      reply: () => ({
        recipient: "Ledgerly",
        greeting: "Hi,",
        paragraphs: [{ label: "Opening", text: "Hi." }],
        signOff: "Best,",
      }),
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
    // In latex mode, steps are: Reading comments -> Writing cover letter (Saving is after)
    expect(steps).toEqual(expectedSteps.slice(0, 2));
    expect(result.resumeWith).toBe("latex-base");
    expect(result.resume).toHaveLength(1);
    expect(result.resume[0].id).toBe("summary");
    expect(result.latex).toBe(mockSettings.current.baseResumeLatex);
    expect(result.letterWith).toBe("write-cover-letter@5");
  });
});
