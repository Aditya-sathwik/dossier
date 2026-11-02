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
  it("refines LaTeX code and extracts reply from markers", async () => {
    const mockProvider = new MockProvider({
      reply: () => `
---LATEX_START---
\\section{Summary}
Shortened summary highlighting Rust.
\\section{Experience}
Rust Systems Engineer at Acme.
---LATEX_END---
I shortened your summary and emphasized your Rust experience.
`,
    });

    const initialLatex = `\\documentclass{article}
\\begin{document}
\\section{Summary}
Original long summary.
\\end{document}`;

    const result = await refineLatexResume(
      mockProvider,
      {
        profile: demoProfile(),
        extracted,
        match: null,
        facts: [],
        latexSource: initialLatex,
        request: "Make summary shorter and highlight Rust",
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    expect(result.data.latex).toContain("\\documentclass{article}");
    expect(result.data.latex).toContain("Shortened summary highlighting Rust.");
    expect(result.data.reply).toContain("I shortened your summary");
  });

  it("handles fallback when markers are absent", async () => {
    const mockProvider = new MockProvider({
      reply: () => `
\\section{Summary}
Updated summary.
`,
    });

    const initialLatex = `\\documentclass{article}
\\begin{document}
\\section{Summary}
Old.
\\end{document}`;

    const result = await refineLatexResume(
      mockProvider,
      {
        profile: demoProfile(),
        extracted,
        match: null,
        facts: [],
        latexSource: initialLatex,
        request: "Update summary",
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    expect(result.data.latex).toContain("\\documentclass{article}");
    expect(result.data.latex).toContain("Updated summary.");
    expect(result.data.reply).toBeTruthy();
  });
});
