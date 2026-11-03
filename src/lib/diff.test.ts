import { describe, expect, it } from "vitest";

import {
  applyDecisions,
  CodeHunk,
  computeLineDiff,
  editsToHunks,
  RawEdit,
  tagLatexDocument,
  validateEdits,
} from "./diff";

describe("computeLineDiff", () => {
  it("handles empty inputs", () => {
    const result = computeLineDiff("", "");
    expect(result.lines).toEqual([]);
  });

  it("handles identical inputs", () => {
    const text = "line 1\nline 2\nline 3";
    const result = computeLineDiff(text, text);
    expect(result.lines.length).toBe(3);
    expect(result.lines.every((l) => l.type === "same")).toBe(true);
    expect(result.lines[0]).toEqual({
      type: "same",
      line: "line 1",
      oldLineNumber: 1,
      newLineNumber: 1,
    });
  });

  it("normalizes CRLF", () => {
    const oldText = "line 1\r\nline 2";
    const newText = "line 1\nline 2";
    const result = computeLineDiff(oldText, newText);
    expect(result.lines.every((l) => l.type === "same")).toBe(true);
  });

  it("handles pure insertions", () => {
    const oldText = "line 1\nline 2";
    const newText = "line 1\ninserted line\nline 2";
    const result = computeLineDiff(oldText, newText, { contextLines: 3 });

    const inserted = result.lines.find((l) => l.type === "add");
    expect(inserted).toEqual({
      type: "add",
      line: "inserted line",
      newLineNumber: 2,
    });
  });

  it("handles pure deletions", () => {
    const oldText = "line 1\ndeleted line\nline 2";
    const newText = "line 1\nline 2";
    const result = computeLineDiff(oldText, newText, { contextLines: 3 });

    const deleted = result.lines.find((l) => l.type === "remove");
    expect(deleted).toEqual({
      type: "remove",
      line: "deleted line",
      oldLineNumber: 2,
    });
  });

  it("collapses long unchanged runs around changes to contextLines", () => {
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let i = 1; i <= 20; i++) {
      oldLines.push(`line ${i}`);
      newLines.push(i === 10 ? "modified line 10" : `line ${i}`);
    }

    const result = computeLineDiff(oldLines.join("\n"), newLines.join("\n"), { contextLines: 2 });
    const omitted = result.lines.filter((l) => l.type === "omitted");
    expect(omitted.length).toBeGreaterThan(0);

    const change = result.lines.find((l) => l.type === "add");
    expect(change?.line).toBe("modified line 10");
  });

  it("guards against excessive matrix size", () => {
    const hugeOld = new Array(600).fill("a").join("\n");
    const hugeNew = new Array(600).fill("b").join("\n");
    const result = computeLineDiff(hugeOld, hugeNew, { maxMatrixSize: 100_000 });
    expect(result.truncated).toBe(true);
    expect(result.lines[0].type).toBe("omitted");
  });
});

describe("validateEdits", () => {
  const baseDoc = `\\documentclass{article}
\\begin{document}
\\section{Experience}
\\begin{itemize}
  \\item Built backend services with Node.js and Redis.
  \\item Led team of 5 engineers delivering SaaS features.
  \\item Optimized PostgreSQL queries reducing latency by 40%.
\\end{itemize}
\\section{Skills}
TypeScript, React, PostgreSQL, Docker
\\end{document}`;

  it("validates exact substring matches (Level 1)", () => {
    const edits: RawEdit[] = [
      {
        id: "edit-node",
        find: "Built backend services with Node.js and Redis.",
        replace: "Built high-throughput backend microservices using Node.js, Go, and Redis.",
        reason: "Emphasize Go and microservices experience",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.rejectedEdits).toHaveLength(0);
    expect(result.validEdits).toHaveLength(1);
    expect(result.validEdits[0]).toMatchObject({
      id: "edit-node",
      find: "Built backend services with Node.js and Redis.",
      start: baseDoc.indexOf("Built backend services with Node.js and Redis."),
      end:
        baseDoc.indexOf("Built backend services with Node.js and Redis.") +
        "Built backend services with Node.js and Redis.".length,
    });
  });

  it("rejects empty or whitespace-only find strings", () => {
    const edits: RawEdit[] = [
      { find: "", replace: "something", reason: "empty find" },
      { find: "   \t\n  ", replace: "something", reason: "whitespace find" },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(2);
    expect(result.rejectedEdits[0].reason).toContain("Empty find string");
    expect(result.rejectedEdits[1].reason).toContain("Empty find string");
  });

  it("rejects degenerate edits where find === replace", () => {
    const edits: RawEdit[] = [
      {
        find: "TypeScript, React, PostgreSQL, Docker",
        replace: "TypeScript, React, PostgreSQL, Docker",
        reason: "no-op edit",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Degenerate edit");
  });

  it("rejects ambiguous matches when find appears multiple times", () => {
    const textWithDuplicates = "word test word test word";
    const edits: RawEdit[] = [
      { find: "word", replace: "term", reason: "duplicate" },
    ];

    const result = validateEdits(textWithDuplicates, edits);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Ambiguous match");
  });

  it("falls back to Level 2 whitespace-normalized matching when indentation or spaces differ", () => {
    const edits: RawEdit[] = [
      {
        // Missing the 2 leading spaces that exist in baseDoc ("  \\item Led team...")
        find: "\\item Led team of 5 engineers delivering SaaS features.",
        replace: "\\item Mentored 5 engineers delivering cloud features.",
        reason: "Different wording",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.rejectedEdits).toHaveLength(0);
    expect(result.validEdits).toHaveLength(1);
    // Should match the exact range in baseDoc without throwing offset errors
    const match = result.validEdits[0];
    expect(baseDoc.slice(match.start, match.end)).toBe(
      "\\item Led team of 5 engineers delivering SaaS features.",
    );
  });

  it("handles CRLF vs LF differences in Level 2 whitespace fallback", () => {
    const crlfDoc = "First line\r\nSecond line\r\nwith info\r\nThird line";
    const edits: RawEdit[] = [
      {
        find: "Second line\nwith info",
        replace: "Second line with updated details",
        reason: "Update line",
      },
    ];

    const result = validateEdits(crlfDoc, edits);
    expect(result.rejectedEdits).toHaveLength(0);
    expect(result.validEdits).toHaveLength(1);
    const valid = result.validEdits[0];
    expect(crlfDoc.slice(valid.start, valid.end)).toBe("Second line\r\nwith info");
  });

  it("rejects edits when text cannot be found in base document", () => {
    const edits: RawEdit[] = [
      {
        find: "Nonexistent phrase that never appears anywhere in the resume",
        replace: "Something else",
        reason: "Not found",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Could not find matching text");
  });

  it("detects and rejects overlapping edits", () => {
    const doc = "The quick brown fox jumps over the lazy dog";
    const edits: RawEdit[] = [
      {
        id: "edit-1",
        find: "brown fox jumps",
        replace: "red fox leaps",
        reason: "edit 1",
      },
      {
        id: "edit-2",
        find: "fox jumps over",
        replace: "hound runs past",
        reason: "overlapping edit 2",
      },
    ];

    const result = validateEdits(doc, edits);
    // edit-1 is valid; edit-2 overlaps with edit-1
    expect(result.validEdits).toHaveLength(1);
    expect(result.validEdits[0].id).toBe("edit-1");
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Overlapping edit");
  });

  it("enforces selectionSnippet bounds when provided", () => {
    const edits: RawEdit[] = [
      {
        id: "edit-in-selection",
        find: "TypeScript, React, PostgreSQL, Docker",
        replace: "TypeScript, React, PostgreSQL, Docker, Kubernetes",
        reason: "Add Kubernetes",
      },
      {
        id: "edit-outside-selection",
        find: "Built backend services with Node.js and Redis.",
        replace: "Built microservices with Go.",
        reason: "Outside selection",
      },
    ];

    const snippet = "TypeScript, React, PostgreSQL, Docker";
    const result = validateEdits(baseDoc, edits, { selectionSnippet: snippet });

    expect(result.validEdits).toHaveLength(1);
    expect(result.validEdits[0].id).toBe("edit-in-selection");

    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("outside the selected text range");
  });

  it("rejects all edits if selectionSnippet cannot be located", () => {
    const edits: RawEdit[] = [
      {
        id: "edit-1",
        find: "TypeScript, React, PostgreSQL, Docker",
        replace: "TypeScript, React",
        reason: "Remove docker",
      },
    ];

    const result = validateEdits(baseDoc, edits, {
      selectionSnippet: "This snippet does not exist anywhere",
    });

    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Selection snippet could not be uniquely located");
  });

  it("resolves edits by blockId with 100% precision", () => {
    const edits: RawEdit[] = [
      {
        id: "edit-block-replace",
        blockId: "B2",
        action: "replace",
        replace: "  \\item Replaced first item with tailored details.",
        reason: "Replace item",
      },
      {
        id: "edit-block-insert",
        blockId: "B3",
        action: "insertAfter",
        replace: "  \\item Inserted extra item after B3.",
        reason: "Insert item",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.rejectedEdits).toHaveLength(0);
    expect(result.validEdits).toHaveLength(2);
    expect(result.validEdits[0].id).toBe("edit-block-replace");
    expect(result.validEdits[0].replace).toContain("Replaced first item");
    expect(result.validEdits[1].id).toBe("edit-block-insert");
    expect(result.validEdits[1].replace).toContain("Inserted extra item");
  });

  it("rejects edits with unknown blockId", () => {
    const edits: RawEdit[] = [
      {
        blockId: "B999",
        replace: "Something",
        reason: "Unknown block",
      },
    ];

    const result = validateEdits(baseDoc, edits);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Unknown blockId");
  });
});

describe("editsToHunks", () => {
  const baseDoc = `Line 1: Header
Line 2: Section
Line 3: Item A
Line 4: Item B
Line 5: Footer`;

  it("computes 1-based oldStartLine and newStartLine", () => {
    const edits = [
      {
        id: "hunk-1",
        find: "Line 3: Item A",
        replace: "Line 3: Item A modified\nLine 3.5: Inserted extra line",
        reason: "Add details",
        start: baseDoc.indexOf("Line 3: Item A"),
        end: baseDoc.indexOf("Line 3: Item A") + "Line 3: Item A".length,
      },
      {
        id: "hunk-2",
        find: "Line 5: Footer",
        replace: "Line 5: Footer updated",
        reason: "Footer edit",
        start: baseDoc.indexOf("Line 5: Footer"),
        end: baseDoc.indexOf("Line 5: Footer") + "Line 5: Footer".length,
      },
    ];

    const hunks = editsToHunks(baseDoc, edits);
    expect(hunks).toHaveLength(2);

    // hunk-1 is on line 3
    expect(hunks[0].oldStartLine).toBe(3);
    expect(hunks[0].newStartLine).toBe(3);
    expect(hunks[0].oldText).toBe("Line 3: Item A");

    // hunk-2 was on line 5 originally.
    // hunk-1 added 1 extra line (replaced 1 line with 2 lines, +1 line delta),
    // so hunk-2 starts at line 6 in the modified document.
    expect(hunks[1].oldStartLine).toBe(5);
    expect(hunks[1].newStartLine).toBe(6);
    expect(hunks[1].oldText).toBe("Line 5: Footer");
  });

  it("trims common leading and trailing lines from multiline hunks for clean diff display", () => {
    const doc = `\\begin{itemize}
  \\item Common prefix line
  \\item Old changed line
  \\item Common suffix line
\\end{itemize}`;

    const rawOld = `\\item Common prefix line\n  \\item Old changed line\n  \\item Common suffix line`;
    const start = doc.indexOf(rawOld);
    const end = start + rawOld.length;

    const edits = [
      {
        id: "trimmed-hunk",
        find: rawOld,
        replace: `\\item Common prefix line\n  \\item New tailored line\n  \\item Common suffix line`,
        reason: "Tailor item",
        start,
        end,
      },
    ];

    const hunks = editsToHunks(doc, edits);
    expect(hunks).toHaveLength(1);
    // The common prefix and suffix lines should be trimmed away, leaving only the changed line
    expect(hunks[0].oldText).toBe("  \\item Old changed line");
    expect(hunks[0].newText).toBe("  \\item New tailored line");
    // Slicing doc from hunk start to hunk end should match oldText
    expect(doc.slice(hunks[0].start, hunks[0].end)).toBe("  \\item Old changed line");
  });
});

describe("applyDecisions", () => {
  const baseDoc = `Line 1: Alpha
Line 2: Beta
Line 3: Gamma
Line 4: Delta`;

  const hunks: CodeHunk[] = [
    {
      id: "hunk-alpha",
      reason: "Update alpha",
      start: baseDoc.indexOf("Line 1: Alpha"),
      end: baseDoc.indexOf("Line 1: Alpha") + "Line 1: Alpha".length,
      oldText: "Line 1: Alpha",
      newText: "Line 1: ALPHA-EXTENDED",
      oldStartLine: 1,
      newStartLine: 1,
    },
    {
      id: "hunk-gamma",
      reason: "Update gamma",
      start: baseDoc.indexOf("Line 3: Gamma"),
      end: baseDoc.indexOf("Line 3: Gamma") + "Line 3: Gamma".length,
      oldText: "Line 3: Gamma",
      newText: "Line 3: GAMMA-REFINED",
      oldStartLine: 3,
      newStartLine: 3,
    },
  ];

  it("returns baseText unchanged when no hunks are accepted", () => {
    const decisions = new Map<string, "accepted" | "rejected">([
      ["hunk-alpha", "rejected"],
      ["hunk-gamma", "rejected"],
    ]);

    const result = applyDecisions(baseDoc, hunks, decisions);
    expect(result.changed).toBe(false);
    expect(result.code).toBe(baseDoc);
  });

  it("applies accepted hunks in bottom-up order preserving offsets", () => {
    // Both hunks accepted; hunk-gamma (higher offset) must be spliced before hunk-alpha
    const decisions = {
      "hunk-alpha": "accepted" as const,
      "hunk-gamma": "accepted" as const,
    };

    const result = applyDecisions(baseDoc, hunks, decisions);
    expect(result.changed).toBe(true);
    expect(result.code).toBe(
      `Line 1: ALPHA-EXTENDED\nLine 2: Beta\nLine 3: GAMMA-REFINED\nLine 4: Delta`,
    );
  });

  it("correctly handles partial acceptance (one accepted, one rejected)", () => {
    const decisions = new Map<string, "accepted" | "rejected">([
      ["hunk-alpha", "rejected"],
      ["hunk-gamma", "accepted"],
    ]);

    const result = applyDecisions(baseDoc, hunks, decisions);
    expect(result.changed).toBe(true);
    expect(result.code).toBe(
      `Line 1: Alpha\nLine 2: Beta\nLine 3: GAMMA-REFINED\nLine 4: Delta`,
    );
  });

  it("detects unbalanced curly braces in applied LaTeX output", () => {
    const brokenHunk: CodeHunk[] = [
      {
        id: "hunk-broken",
        reason: "Unclosed brace",
        start: 0,
        end: 6,
        oldText: "Line 1",
        newText: "\\textbf{Line 1", // Missing closing }
        oldStartLine: 1,
        newStartLine: 1,
      },
    ];

    const result = applyDecisions("Line 1: Alpha", brokenHunk, {
      "hunk-broken": "accepted",
    });

    expect(result.changed).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("Mismatched curly braces");
  });

  it("ignores escaped braces (\\{ and \\}) in brace balance check", () => {
    const escapedHunk: CodeHunk[] = [
      {
        id: "hunk-escaped",
        reason: "Escaped braces",
        start: 0,
        end: 6,
        oldText: "Line 1",
        newText: "\\{Line 1\\}", // Escaped \{ and \}
        oldStartLine: 1,
        newStartLine: 1,
      },
    ];

    const result = applyDecisions("Line 1: Alpha", escapedHunk, {
      "hunk-escaped": "accepted",
    });

    expect(result.changed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("never tags preamble lines or structural environments in tagLatexDocument", () => {
    const fullDoc = `\\documentclass{article}
\\usepackage{xcolor}
\\hypersetup{colorlinks, urlcolor=blue}
\\begin{document}
\\section{Summary}
\\begin{itemize}
  \\item Experienced full stack engineer.
\\end{itemize}
\\end{document}`;

    const { blocks, blockMap } = tagLatexDocument(fullDoc);
    const taggedTexts = blocks.map((b) => b.text.trim());

    // Preamble lines must NEVER be tagged
    expect(taggedTexts).not.toContain("\\usepackage{xcolor}");
    expect(taggedTexts).not.toContain("\\hypersetup{colorlinks, urlcolor=blue}");
    expect(taggedTexts).not.toContain("\\documentclass{article}");
    // Structural environment delimiters must not be tagged
    expect(taggedTexts).not.toContain("\\begin{itemize}");
    expect(taggedTexts).not.toContain("\\end{itemize}");
    // Content lines MUST be tagged
    expect(taggedTexts).toContain("\\section{Summary}");
    expect(taggedTexts).toContain("\\item Experienced full stack engineer.");
    expect(blockMap.get("B1")?.text.trim()).toBe("\\section{Summary}");
  });

  it("rejects edits targeting text inside the preamble", () => {
    const fullDoc = `\\documentclass{article}
\\hypersetup{
    urlcolor=blue
}
\\begin{document}
\\section{Experience}
\\item Built software.
\\end{document}`;

    const preambleEdit: RawEdit = {
      find: "urlcolor=blue",
      replace: "urlcolor=red",
      reason: "change color",
    };

    const result = validateEdits(fullDoc, [preambleEdit]);
    expect(result.validEdits).toHaveLength(0);
    expect(result.rejectedEdits).toHaveLength(1);
    expect(result.rejectedEdits[0].reason).toContain("Edits outside \\begin{document}");
  });

  it("auto-wraps bare text replacements into \\resumeItem when target block is \\resumeItem", () => {
    const doc = `\\begin{document}
\\resumeItem{Old bullet description}
\\end{document}`;

    const edit: RawEdit = {
      find: "\\resumeItem{Old bullet description}",
      replace: "New improved bullet description",
      reason: "update bullet",
    };

    const result = validateEdits(doc, [edit]);
    expect(result.validEdits).toHaveLength(1);
    expect(result.validEdits[0].replace).toBe("\\resumeItem{New improved bullet description}");
  });

  it("auto-preserves \\item[--] prefix when replacement omits it", () => {
    const doc = `\\begin{document}
\\item[--] Front-end web developer with 2 years of experience.
\\end{document}`;

    const edit: RawEdit = {
      find: "\\item[--] Front-end web developer with 2 years of experience.",
      replace: "Front-end web developer with 3 years of experience.",
      reason: "update experience count",
    };

    const result = validateEdits(doc, [edit]);
    expect(result.validEdits).toHaveLength(1);
    expect(result.validEdits[0].replace).toBe(
      "\\item[--] Front-end web developer with 3 years of experience.",
    );
  });
});
