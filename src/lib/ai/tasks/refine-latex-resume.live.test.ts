import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import type { Extracted } from "@/lib/application-data";
import { editsToHunks, validateEdits } from "@/lib/diff";
import { LocalProvider } from "../providers/local";
import { refineLatexResume } from "./refine-latex-resume";

const extracted: Extracted = {
  title: "AI Harness Engineer",
  company: "Tether",
  role: "AI Harness Engineer",
  location: "Remote",
  mode: "Remote",
  salary: null,
  deadline: null,
  requirements: [
    {
      text: "Hands-on work with AI/LLMs, agent harnesses, local inference, and/or P2P/distributed systems",
      skill: "AI/LLMs",
      kind: "skill",
      years: null,
      language: null,
    },
    {
      text: "Open-source experience is a plus",
      skill: "Open Source",
      kind: "other",
      years: null,
      language: null,
    },
  ],
  asksForReferences: false,
  language: "English",
};

const baseLatex = `\\documentclass[a4paper,12pt]{article}
\\usepackage{tabularx}
\\usepackage{enumitem}

\\begin{document}

\\section{Experience}
\\begin{tabularx}{\\linewidth}{@{}l r@{}}
\\textbf{Software Engineer, TechCorp} & \\hfill 2022 -- Present \\\\
\\multicolumn{2}{@{}X@{}}{
\\begin{itemize}[leftmargin=1em]
  \\item Built backend services with Node.js and Express, improving API response times by 30\\%.
  \\item Led integration of cloud storage services and optimized database queries.
\\end{itemize}
} \\\\
\\end{tabularx}

\\section{Skills}
\\textbf{Languages \\& Frameworks:} TypeScript, JavaScript, React.js, Node.js, Express.js

\\end{document}`;

describe("Model Validation Gate - Block-ID Integrated (qwen2.5:7b)", { timeout: 120_000 }, () => {
  it("generates block-addressed edits that successfully validate and convert to hunks", async () => {
    const provider = new LocalProvider(
      "http://localhost:11434",
      "qwen2.5:7b",
      120_000,
    );

    const request = `Tailor for Tether AI Harness Engineer:
- Mention experience with AI harnesses, agent workflows, and local inference in the experience bullet.
- Add AI coding tools and LLMs to skills.`;

    const started = Date.now();
    const result = await refineLatexResume(
      provider,
      {
        profile: demoProfile(),
        extracted,
        match: null,
        facts: [],
        latexSource: baseLatex,
        request,
      },
      { creativity: "BALANCED", strict: true, language: null },
    );

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n=== Model Response in ${elapsed}s ===`);
    console.log(`Reply: ${result.data.reply}`);
    console.log(`Edits: ${JSON.stringify(result.data.edits, null, 2)}`);

    expect(result.data.edits.length).toBeGreaterThan(0);

    const { validEdits, rejectedEdits } = validateEdits(baseLatex, result.data.edits);
    console.log(`\nValid edits: ${validEdits.length} / ${result.data.edits.length}`);
    if (rejectedEdits.length > 0) {
      console.log(`Rejected edits:`, rejectedEdits);
    }

    expect(validEdits.length).toBeGreaterThan(0);

    const hunks = editsToHunks(baseLatex, validEdits);
    expect(hunks.length).toBe(validEdits.length);

    console.log(`\n=== Generated Hunks ===`);
    for (const hunk of hunks) {
      console.log(`Hunk [${hunk.id}] (lines ${hunk.oldStartLine} -> ${hunk.newStartLine}):`);
      console.log(`- ${hunk.oldText}`);
      console.log(`+ ${hunk.newText}`);
    }
  });
});
