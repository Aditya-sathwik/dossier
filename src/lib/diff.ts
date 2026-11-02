/**
 * Line diff utility for comparing original and tailored LaTeX or code documents.
 * Employs common prefix/suffix optimization, LCS, and context collapsing.
 */

export type DiffLineType = "add" | "remove" | "same" | "omitted";

export type DiffLine = {
  type: DiffLineType;
  line: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

export type ComputeDiffOptions = {
  /** Maximum number of unchanged context lines around changes (default: 3). Set to Infinity to keep all. */
  contextLines?: number;
  /** Maximum matrix size (N * M) before falling back to summary (default: 250,000). */
  maxMatrixSize?: number;
};

/**
 * Computes an array of diff lines showing additions (+), removals (-),
 * unchanged context lines, and omitted lines markers ("@@ ... @@").
 */
export function computeLineDiff(
  oldText: string,
  newText: string,
  options: ComputeDiffOptions = {},
): { lines: DiffLine[]; truncated?: boolean } {
  const { contextLines = 3, maxMatrixSize = 250_000 } = options;

  // Normalize CRLF to LF
  const normOld = oldText.replace(/\r\n/g, "\n");
  const normNew = newText.replace(/\r\n/g, "\n");

  if (normOld === normNew) {
    if (!normOld) return { lines: [] };
    const allLines = normOld.split("\n");
    // If identical, we can either return all lines or a collapsed view
    const lines: DiffLine[] = allLines.map((line, idx) => ({
      type: "same",
      line,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
    }));
    return { lines };
  }

  const oldLines = normOld.split("\n");
  const newLines = normNew.split("\n");

  // Performance guard: check matrix size
  if (oldLines.length * newLines.length > maxMatrixSize) {
    return {
      lines: [
        {
          type: "omitted",
          line: `Diff too large to compute in-memory (${oldLines.length} lines vs ${newLines.length} lines).`,
        },
      ],
      truncated: true,
    };
  }

  // 1. Trim common prefix
  let prefixCount = 0;
  while (
    prefixCount < oldLines.length &&
    prefixCount < newLines.length &&
    oldLines[prefixCount] === newLines[prefixCount]
  ) {
    prefixCount++;
  }

  // 2. Trim common suffix
  let suffixCount = 0;
  while (
    suffixCount < oldLines.length - prefixCount &&
    suffixCount < newLines.length - prefixCount &&
    oldLines[oldLines.length - 1 - suffixCount] === newLines[newLines.length - 1 - suffixCount]
  ) {
    suffixCount++;
  }

  const midOld = oldLines.slice(prefixCount, oldLines.length - suffixCount);
  const midNew = newLines.slice(prefixCount, newLines.length - suffixCount);

  // 3. Compute LCS on the middle portion
  const n = midOld.length;
  const m = midNew.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (midOld[i - 1] === midNew[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack LCS to build diff items for the middle portion
  type RawItem = { type: "same" | "add" | "remove"; line: string };
  const rawMid: RawItem[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
      rawMid.push({ type: "same", line: midOld[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawMid.push({ type: "add", line: midNew[j - 1] });
      j--;
    } else if (i > 0) {
      rawMid.push({ type: "remove", line: midOld[i - 1] });
      i--;
    }
  }
  rawMid.reverse();

  // Combine prefix + mid + suffix into a raw diff sequence with line numbers
  const fullRaw: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let k = 0; k < prefixCount; k++) {
    fullRaw.push({
      type: "same",
      line: oldLines[k],
      oldLineNumber: oldLine++,
      newLineNumber: newLine++,
    });
  }

  for (const item of rawMid) {
    if (item.type === "same") {
      fullRaw.push({
        type: "same",
        line: item.line,
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    } else if (item.type === "remove") {
      fullRaw.push({
        type: "remove",
        line: item.line,
        oldLineNumber: oldLine++,
      });
    } else if (item.type === "add") {
      fullRaw.push({
        type: "add",
        line: item.line,
        newLineNumber: newLine++,
      });
    }
  }

  for (let k = oldLines.length - suffixCount; k < oldLines.length; k++) {
    fullRaw.push({
      type: "same",
      line: oldLines[k],
      oldLineNumber: oldLine++,
      newLineNumber: newLine++,
    });
  }

  // 4. Collapse long runs of "same" lines to `contextLines`
  if (!Number.isFinite(contextLines) || contextLines < 0) {
    return { lines: fullRaw };
  }

  // Identify which indices need to be kept (changes + within contextLines radius)
  const keep = new Uint8Array(fullRaw.length);
  for (let idx = 0; idx < fullRaw.length; idx++) {
    if (fullRaw[idx].type === "add" || fullRaw[idx].type === "remove") {
      const start = Math.max(0, idx - contextLines);
      const end = Math.min(fullRaw.length - 1, idx + contextLines);
      for (let c = start; c <= end; c++) {
        keep[c] = 1;
      }
    }
  }

  const result: DiffLine[] = [];
  let inOmittedBlock = false;

  for (let idx = 0; idx < fullRaw.length; idx++) {
    if (keep[idx] === 1) {
      inOmittedBlock = false;
      result.push(fullRaw[idx]);
    } else {
      if (!inOmittedBlock) {
        inOmittedBlock = true;
        result.push({
          type: "omitted",
          line: "@@ ... @@",
        });
      }
    }
  }

  return { lines: result };
}

