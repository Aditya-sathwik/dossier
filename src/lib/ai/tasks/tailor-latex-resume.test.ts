import { describe, expect, it } from "vitest";

import type { Extracted, Match } from "@/lib/application-data";
import { demoProfile } from "@/lib/demo-profile";

import { MockProvider } from "../providers/mock";
import { FACTS_HEADING } from "./prompt-parts";
import {
  areBracesBalanced,
  areEnvironmentsBalanced,
  splitLatexDocument,
  stripMarkdownCodeBlocks,
  tailorLatexResume,
} from "./tailor-latex-resume";

describe("areBracesBalanced", () => {
  it("recognizes balanced braces", () => {
    expect(areBracesBalanced("\\textbf{Hello {World}} and \\{escaped\\}")).toBe(true);
  });

  it("detects unbalanced braces", () => {
    expect(areBracesBalanced("\\textbf{Hello")).toBe(false);
    expect(areBracesBalanced("Hello}")).toBe(false);
    expect(areBracesBalanced("{nested {bracket}}}")).toBe(false);
  });
});

describe("areEnvironmentsBalanced", () => {
  it("recognizes balanced environments", () => {
    const code = `
\\begin{document}
  \\begin{itemize}
    \\item Item 1
  \\end{itemize}
\\end{document}
`;
    expect(areEnvironmentsBalanced(code)).toBe(true);
  });

  it("detects mismatched or unclosed environments", () => {
    const code = `
\\begin{document}
  \\begin{itemize}
    \\item Item 1
\\end{document}
`;
    expect(areEnvironmentsBalanced(code)).toBe(false);
  });
});

describe("splitLatexDocument", () => {
  it("splits preamble and body cleanly", () => {
    const doc = `\\documentclass{article}
\\usepackage{hyperref}
\\begin{document}
\\section{Experience}
\\end{document}`;

    const { preamble, body, postscript } = splitLatexDocument(doc);
    expect(preamble).toContain("\\documentclass{article}");
    expect(preamble).toContain("\\begin{document}");
    expect(body).toContain("\\section{Experience}");
    expect(postscript).toBe("\\end{document}");
  });
});

describe("stripMarkdownCodeBlocks", () => {
  it("removes markdown fences", () => {
    expect(stripMarkdownCodeBlocks("```latex\n\\section{Test}\n```")).toBe("\\section{Test}");
    expect(stripMarkdownCodeBlocks("```\n\\section{Test}\n```")).toBe("\\section{Test}");
    expect(stripMarkdownCodeBlocks("\\section{Test}")).toBe("\\section{Test}");
  });
});

describe("tailorLatexResume prompt integration", () => {
  it("includes candidate comments, applicationFacts, and escape rules in prompt", async () => {
    const provider = new MockProvider({
      reply: () => "\\section{Experience}\n\\resumeItem{Built Rust tool}",
    });

    const extracted: Extracted = {
      title: "Rust Systems Engineer",
      company: "Datamint",
      role: "Rust Systems Engineer",
      location: "Remote",
      mode: "Remote",
      salary: null,
      deadline: null,
      requirements: [{ text: "Rust expertise", kind: "skill", skill: "Rust", years: null, language: null }],
      asksForReferences: false,
      language: "English",
    };

    const match: Match = {
      items: [
        {
          requirement: "Rust expertise",
          result: "gap",
          skill: null,
          experienceIds: [],
          note: "Not in your profile",
          comment: "I authored a popular async Rust crate",
        },
      ],
    };

    const latexSource = "\\documentclass{article}\n\\begin{document}\n\\section{Experience}\n\\resumeItem{Old item}\n\\end{document}";

    await tailorLatexResume(
      provider,
      {
        profile: demoProfile(),
        extracted,
        match,
        facts: ["Available immediately", "Prefers European timezone"],
        latexSource,
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    const call = provider.calls[0];
    expect(call.system).toContain("take precedence over \"not in profile\"");
    expect(call.system).toMatch(/In the resume, weave in candidate comments/);
    expect(call.system).toMatch(/Escape LaTeX special characters/);

    const userMessage = call.messages[0].content as string;
    expect(userMessage).toContain('"candidateComment": "I authored a popular async Rust crate"');
    expect(userMessage).toContain(`${FACTS_HEADING}:\n- Available immediately\n- Prefers European timezone`);
  });
});
