import { describe, expect, it } from "vitest";

import { computeLineDiff } from "./diff";

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
    // Should have omitted lines
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

