import { describe, expect, it } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { demoProfile } from "@/lib/demo-profile";
import type { Extracted } from "@/lib/application-data";
import { refineLatexResume } from "./refine-latex-resume";

const extracted: Extracted = {
  title: "Rust Dev",
  company: "Acme",
  role: "Rust Dev",
  location: "Remote",
  mode: "Remote",
  salary: null,
  deadline: null,
  requirements: [],
  asksForReferences: false,
  language: "English",
};

describe("refineLatexResume", () => {
  it("returns structured edits and reply", async () => {
    const mockProvider = new MockProvider({
      reply: () => ({
        reply: "I updated your summary to highlight Rust.",
        edits: [
          {
            find: "\\item Original bullet point.",
            replace: "\\item Tailored bullet point emphasizing Rust.",
            reason: "Align with Rust Dev requirement",
          },
        ],
      }),
    });

    const initialLatex = `\\documentclass{article}
\\begin{document}
\\section{Summary}
\\item Original bullet point.
\\end{document}`;

    const result = await refineLatexResume(
      mockProvider,
      {
        profile: demoProfile(),
        extracted,
        match: null,
        facts: [],
        latexSource: initialLatex,
        request: "Highlight Rust experience",
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    expect(result.data.reply).toBe("I updated your summary to highlight Rust.");
    expect(result.data.edits).toHaveLength(1);
    expect(result.data.edits[0].find).toBe("\\item Original bullet point.");
    expect(result.data.edits[0].replace).toContain("emphasizing Rust");
  });

  it("passes targetSnippet into prompt when present", async () => {
    const mockProvider = new MockProvider({
      reply: () => ({
        reply: "Updated selected line.",
        edits: [],
      }),
    });

    const initialLatex = `\\documentclass{article}
\\begin{document}
\\section{Experience}
\\item Selected line.
\\end{document}`;

    await refineLatexResume(
      mockProvider,
      {
        profile: demoProfile(),
        extracted,
        match: null,
        facts: [],
        latexSource: initialLatex,
        request: "Improve this line",
        targetSnippet: "\\item Selected line.",
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    expect(mockProvider.calls).toHaveLength(1);
    const content = mockProvider.calls[0].messages[0].content;
    expect(content).toContain("Candidate's selected LaTeX snippet to focus on:");
    expect(content).toContain("\\item Selected line.");
  });
});
