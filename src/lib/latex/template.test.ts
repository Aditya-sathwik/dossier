import { describe, expect, it } from "vitest";

import { PaperSize } from "@/generated/prisma/enums";
import { demoProfile } from "@/lib/demo-profile";
import { escapeLatex, generateLatexFromProfile, hrefTarget } from "./template";

describe("escapeLatex", () => {
  it("escapes special LaTeX characters safely", () => {
    expect(escapeLatex("C# & C++ with 100% $profit_margin^{fast} ~home\\test")).toBe(
      "C\\# \\& C++ with 100\\% \\$profit\\_margin\\textasciicircum{}\\{fast\\} \\textasciitilde{}home\\textbackslash{}test",
    );
  });

  it("handles empty or blank string", () => {
    expect(escapeLatex("")).toBe("");
  });
});

describe("hrefTarget", () => {
  it("allows valid http, https, and mailto URLs", () => {
    expect(hrefTarget("https://linkedin.com/in/jane")).toBe("https://linkedin.com/in/jane");
    expect(hrefTarget("http://example.com")).toBe("http://example.com");
    expect(hrefTarget("mailto:jane@example.com")).toBe("mailto:jane@example.com");
  });

  it("rejects javascript: and other malicious schemes", () => {
    expect(hrefTarget("javascript:alert(1)")).toBe("");
    expect(hrefTarget("file:///etc/passwd")).toBe("");
    expect(hrefTarget("data:text/html,...")).toBe("");
  });
});

describe("generateLatexFromProfile", () => {
  it("generates a complete valid LaTeX document from a profile", () => {
    const profile = demoProfile();
    const latex = generateLatexFromProfile(profile, { paper: PaperSize.A4 });

    expect(latex).toContain("\\documentclass[a4paper,11pt]{article}");
    expect(latex).toContain("\\begin{document}");
    expect(latex).toContain("\\end{document}");
    expect(latex).toContain("Jane Doe");
    expect(latex).toContain("\\section{Experience}");
    expect(latex).toContain("\\section{Education}");
    expect(latex).toContain("\\section{Technical Skills}");
    // Verifies that pdfTeX-incompatible commands are absent
    expect(latex).not.toContain("pdfgentounicode");
    expect(latex).not.toContain("glyphtounicode");
  });

  it("respects letterpaper when paper is LETTER", () => {
    const profile = demoProfile();
    const latex = generateLatexFromProfile(profile, { paper: PaperSize.LETTER });
    expect(latex).toContain("\\documentclass[letterpaper,11pt]{article}");
  });
});

