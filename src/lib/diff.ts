import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Phase 2: In-Context LaTeX Copilot Diff Engine
// Types, Offset-Preserving Edit Validation, Hunk Formation & Bottom-Up Decisions
// ---------------------------------------------------------------------------

export type RawEditAction = "replace" | "insertAfter" | "insertBefore" | "delete";

export type RawEdit = {
  id?: string;
  blockId?: string;
  action?: RawEditAction;
  find?: string;
  replace?: string;
  reason: string;
};

export type LatexBlock = {
  id: string;
  lineNum: number;
  start: number;
  end: number;
  text: string;
};

/**
 * Tags meaningful content lines of a LaTeX document with identifiers like [B1], [B2]
 * for deterministic, 100% reliable block addressing by 7B models.
 * Excludes preamble, comments, and structural delimiters so only editable text is targeted.
 */
export function tagLatexDocument(source: string): {
  taggedText: string;
  blocks: LatexBlock[];
  blockMap: Map<string, LatexBlock>;
} {
  const lines = source.split("\n");
  const blocks: LatexBlock[] = [];
  const blockMap = new Map<string, LatexBlock>();
  const taggedLines: string[] = [];

  let inDocument = false;
  const hasBeginDoc = source.includes("\\begin{document}");
  if (!hasBeginDoc) {
    inDocument = true;
  }

  let offset = 0;
  let counter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset += line.length + 1; // +1 for \n

    const trimmed = line.trim();

    if (trimmed.includes("\\begin{document}")) {
      inDocument = true;
      taggedLines.push(line);
      continue;
    }
    if (trimmed.includes("\\end{document}")) {
      inDocument = false;
      taggedLines.push(line);
      continue;
    }

    if (!inDocument) {
      // PREAMBLE LINES ARE IMMUTABLE - NEVER TAGGED
      taggedLines.push(line);
      continue;
    }

    // Skip comments, empty lines, and structural LaTeX markup
    const isComment = trimmed.startsWith("%");
    const isEmpty = trimmed.length === 0;
    const isClosingBrace =
      trimmed === "}" || trimmed === "}{" || trimmed === "}{}" || trimmed === "}}";
    const isStructuralEnv =
      trimmed.startsWith("\\begin{") ||
      trimmed.startsWith("\\end{") ||
      trimmed.startsWith("\\resumeItemListStart") ||
      trimmed.startsWith("\\resumeItemListEnd") ||
      trimmed.startsWith("\\resumeSubHeadingListStart") ||
      trimmed.startsWith("\\resumeSubHeadingListEnd") ||
      trimmed.startsWith("\\multicolumn") ||
      trimmed.startsWith("\\pagestyle") ||
      trimmed.startsWith("\\thispagestyle") ||
      trimmed.startsWith("\\vspace") ||
      trimmed.startsWith("\\hspace") ||
      trimmed.startsWith("\\vfill") ||
      trimmed.startsWith("\\newpage") ||
      trimmed.startsWith("\\medskip") ||
      trimmed.startsWith("\\bigskip") ||
      trimmed.startsWith("\\smallskip");

    const isTagCandidate = !isComment && !isEmpty && !isClosingBrace && !isStructuralEnv;

    if (isTagCandidate) {
      const id = `B${counter++}`;
      const block: LatexBlock = {
        id,
        lineNum: i + 1,
        start: lineStart,
        end: lineEnd,
        text: line,
      };
      blocks.push(block);
      blockMap.set(id, block);
      taggedLines.push(`[${id}] ${line}`);
    } else {
      taggedLines.push(line);
    }
  }

  return { taggedText: taggedLines.join("\n"), blocks, blockMap };
}

export type ValidatedEdit = {
  id: string;
  find: string;
  replace: string;
  reason: string;
  start: number; // character offset in base text
  end: number;   // character offset in base text
};

export const codeHunkSchema = z.object({
  id: z.string(),
  reason: z.string(),
  start: z.number(),
  end: z.number(),
  oldText: z.string(),
  newText: z.string(),
  oldStartLine: z.number(),
  newStartLine: z.number(),
});

export type CodeHunk = z.infer<typeof codeHunkSchema>;

export type HunkDecision = "accepted" | "rejected";

export type ValidateEditsOptions = {
  /** If provided, all edits must fall strictly within the bounds of this snippet in baseText */
  selectionSnippet?: string;
};

export type RejectedEdit = {
  edit: RawEdit;
  reason: string;
};

export type ValidateEditsResult = {
  validEdits: ValidatedEdit[];
  rejectedEdits: RejectedEdit[];
};

export type ApplyDecisionsResult = {
  code: string;
  changed: boolean;
  warning?: string;
};

/**
 * Builds a whitespace-collapsed normalized string alongside character index mappings
 * back to exact offsets in the original text.
 */
function buildWhitespaceNormalizedMap(text: string): {
  normalized: string;
  originalIndices: number[];
  originalEndIndices: number[];
} {
  let normalized = "";
  const originalIndices: number[] = [];
  const originalEndIndices: number[] = [];

  let i = 0;
  const len = text.length;

  while (i < len) {
    if (/\s/.test(text[i])) {
      const wsStart = i;
      while (i < len && /\s/.test(text[i])) {
        i++;
      }
      const wsEnd = i;
      if (normalized.length > 0 && i < len) {
        normalized += " ";
        originalIndices.push(wsStart);
        originalEndIndices.push(wsEnd);
      }
    } else {
      normalized += text[i];
      originalIndices.push(i);
      originalEndIndices.push(i + 1);
      i++;
    }
  }

  return { normalized, originalIndices, originalEndIndices };
}

function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, " ");
}

/**
 * Checks LaTeX brace `{` vs `}` balance ignoring escaped braces (`\{`, `\}`).
 */
function checkLatexBraceBalance(text: string): { balanced: boolean; diff: number } {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "}") {
      let bsCount = 0;
      let j = i - 1;
      while (j >= 0 && text[j] === "\\") {
        bsCount++;
        j--;
      }
      if (bsCount % 2 === 0) {
        if (ch === "{") depth++;
        else depth--;
      }
    }
  }
  return { balanced: depth === 0, diff: depth };
}

/**
 * Validates raw AI edits against the base document text.
 * Performs Level 1 (exact substring match) and Level 2 (whitespace-collapsed normalized match),
 * checks for uniqueness, guards against overlapping edits, and enforces selection constraints.
 */
export function validateEdits(
  baseText: string,
  edits: RawEdit[],
  options: ValidateEditsOptions = {},
): ValidateEditsResult {
  const validEdits: ValidatedEdit[] = [];
  const rejectedEdits: RejectedEdit[] = [];

  let wsMap: ReturnType<typeof buildWhitespaceNormalizedMap> | null = null;
  const getWsMap = () => {
    if (!wsMap) {
      wsMap = buildWhitespaceNormalizedMap(baseText);
    }
    return wsMap;
  };

  let docTags: ReturnType<typeof tagLatexDocument> | null = null;
  const getDocTags = () => {
    if (!docTags) {
      docTags = tagLatexDocument(baseText);
    }
    return docTags;
  };

  // 1. Locate selection snippet bounds if specified
  let selStart = -1;
  let selEnd = -1;
  if (options.selectionSnippet && options.selectionSnippet.trim().length > 0) {
    const snippet = options.selectionSnippet;
    // Level 1: exact match
    let count = 0;
    let pos = baseText.indexOf(snippet);
    let firstPos = -1;
    while (pos !== -1) {
      count++;
      if (firstPos === -1) firstPos = pos;
      pos = baseText.indexOf(snippet, pos + 1);
    }

    if (count === 1) {
      selStart = firstPos;
      selEnd = firstPos + snippet.length;
    } else if (count === 0) {
      // Level 2: whitespace match
      const map = getWsMap();
      const normSnippet = normalizeWhitespace(snippet);
      let normCount = 0;
      let normPos = map.normalized.indexOf(normSnippet);
      let firstNormPos = -1;
      while (normPos !== -1) {
        normCount++;
        if (firstNormPos === -1) firstNormPos = normPos;
        normPos = map.normalized.indexOf(normSnippet, normPos + 1);
      }
      if (normCount === 1) {
        selStart = map.originalIndices[firstNormPos];
        selEnd = map.originalEndIndices[firstNormPos + normSnippet.length - 1];
      }
    }

    if (selStart === -1 || selEnd === -1) {
      // Snippet could not be uniquely found
      return {
        validEdits: [],
        rejectedEdits: edits.map((edit) => ({
          edit,
          reason: "Selection snippet could not be uniquely located in base text",
        })),
      };
    }
  }

  // 2. Validate and locate each individual edit
  type Candidate = {
    id: string;
    find: string;
    replace: string;
    reason: string;
    start: number;
    end: number;
    rawEdit: RawEdit;
  };

  const candidates: Candidate[] = [];

  for (let idx = 0; idx < edits.length; idx++) {
    const edit = edits[idx];
    const editId = edit.id || `edit-${idx + 1}`;

    let matchStart = -1;
    let matchEnd = -1;
    let findText = edit.find ?? "";
    let replaceText = edit.replace ?? "";

    let blockId = edit.blockId;
    if (!blockId) {
      const matchInReplace = edit.replace?.match(/\[B(\d+)\]/);
      const matchInFind = edit.find?.match(/\[B(\d+)\]/);
      if (matchInReplace) {
        blockId = `B${matchInReplace[1]}`;
      } else if (matchInFind) {
        blockId = `B${matchInFind[1]}`;
      }
    }

    if (blockId) {
      const cleanBlockId = blockId.replace(/[\[\]]/g, "").trim();
      const tags = getDocTags();
      const block = tags.blockMap.get(cleanBlockId);
      if (!block) {
        rejectedEdits.push({ edit, reason: `Unknown blockId: ${blockId}` });
        continue;
      }

      findText = block.text;
      const rawReplace = (edit.replace ?? "").replace(/\[B\d+\]\s*/g, "");
      const action = edit.action ?? "replace";
      if (action === "replace") {
        matchStart = block.start;
        matchEnd = block.end;
        replaceText = rawReplace;
      } else if (action === "insertAfter") {
        matchStart = block.end;
        matchEnd = block.end;
        replaceText = "\n" + rawReplace;
      } else if (action === "insertBefore") {
        matchStart = block.start;
        matchEnd = block.start;
        replaceText = rawReplace + "\n";
      } else if (action === "delete") {
        matchStart = block.start;
        matchEnd = block.end;
        replaceText = "";
      }
    } else {
      if (!edit.find || !edit.find.trim()) {
        rejectedEdits.push({ edit, reason: "Empty find string" });
        continue;
      }

      if (edit.find === edit.replace) {
        rejectedEdits.push({ edit, reason: "Degenerate edit: find and replace are identical" });
        continue;
      }

      // Level 1: Exact substring match
      let exactCount = 0;
      let exactPos = baseText.indexOf(edit.find);
      let firstExactPos = -1;
      while (exactPos !== -1) {
        exactCount++;
        if (firstExactPos === -1) firstExactPos = exactPos;
        exactPos = baseText.indexOf(edit.find, exactPos + 1);
      }

      if (exactCount === 1) {
        matchStart = firstExactPos;
        matchEnd = firstExactPos + edit.find.length;
      } else if (exactCount > 1) {
        rejectedEdits.push({
          edit,
          reason: `Ambiguous match: found ${exactCount} exact occurrences in base text`,
        });
        continue;
      } else {
        // Level 2: Whitespace-collapsed normalized match
        const map = getWsMap();
        const normFind = normalizeWhitespace(edit.find);

        if (!normFind) {
          rejectedEdits.push({ edit, reason: "Find string contains only whitespace" });
          continue;
        }

        let normCount = 0;
        let normPos = map.normalized.indexOf(normFind);
        let firstNormPos = -1;
        while (normPos !== -1) {
          normCount++;
          if (firstNormPos === -1) firstNormPos = normPos;
          normPos = map.normalized.indexOf(normFind, normPos + 1);
        }

        if (normCount === 1) {
          matchStart = map.originalIndices[firstNormPos];
          matchEnd = map.originalEndIndices[firstNormPos + normFind.length - 1];
        } else if (normCount > 1) {
          rejectedEdits.push({
            edit,
            reason: `Ambiguous match: found ${normCount} occurrences after whitespace normalization`,
          });
          continue;
        } else {
          rejectedEdits.push({ edit, reason: "Could not find matching text in base document" });
          continue;
        }
      }

      // Line indentation preservation check:
      // If find matched starting mid-line after whitespace, but replace starts with the line's indent,
      // expand matchStart to the start of the line to prevent duplicate indentation.
      const lineStart = baseText.lastIndexOf("\n", matchStart - 1) + 1;
      const leadingIndentOnLine = baseText.slice(lineStart, matchStart);
      if (
        matchStart > lineStart &&
        /^\s+$/.test(leadingIndentOnLine) &&
        replaceText.startsWith(leadingIndentOnLine)
      ) {
        matchStart = lineStart;
      }
    }

    // Preamble protection check:
    // If baseText has a \begin{document}...\end{document} structure,
    // edits must not fall outside \begin{document}...\end{document} (e.g. into the preamble).
    const docBeginIdx = baseText.indexOf("\\begin{document}");
    const docEndIdx = baseText.lastIndexOf("\\end{document}");
    if (docBeginIdx !== -1) {
      const bodyStart = docBeginIdx + "\\begin{document}".length;
      const bodyEnd = docEndIdx !== -1 ? docEndIdx : baseText.length;
      if (matchStart < bodyStart || matchEnd > bodyEnd) {
        rejectedEdits.push({
          edit,
          reason: "Edits outside \\begin{document} ... \\end{document} (such as preamble) are not permitted.",
        });
        continue;
      }
    }

    // Bullet / Macro preservation normalization:
    // If the target block is a bullet item (e.g. \resumeItem{...} or \item ...),
    // ensure that if replaceText omitted the command wrapper, it is restored cleanly.
    const trimmedFind = findText.trim();
    const trimmedReplace = replaceText.trim();
    if (trimmedFind.startsWith("\\resumeItem{") && trimmedFind.endsWith("}")) {
      if (!trimmedReplace.startsWith("\\resumeItem{")) {
        const innerText = trimmedReplace
          .replace(/^\s*\\item(\[[^\]]*\])?\s*/, "")
          .replace(/^\{/, "")
          .replace(/\}$/, "")
          .trim();
        const leadingIndent = replaceText.match(/^\s*/)?.[0] ?? "";
        replaceText = `${leadingIndent}\\resumeItem{${innerText}}`;
      }
    } else if (trimmedFind.startsWith("\\item[--]")) {
      if (!trimmedReplace.startsWith("\\item")) {
        const innerText = trimmedReplace.replace(/^\{/, "").replace(/\}$/, "").trim();
        const leadingIndent = replaceText.match(/^\s*/)?.[0] ?? "";
        replaceText = `${leadingIndent}\\item[--] ${innerText}`;
      }
    } else if (trimmedFind.startsWith("\\item ")) {
      if (!trimmedReplace.startsWith("\\item")) {
        const innerText = trimmedReplace.replace(/^\{/, "").replace(/\}$/, "").trim();
        const leadingIndent = replaceText.match(/^\s*/)?.[0] ?? "";
        replaceText = `${leadingIndent}\\item ${innerText}`;
      }
    }

    // Selection snippet boundary check
    if (selStart !== -1) {
      if (matchStart < selStart || matchEnd > selEnd) {
        rejectedEdits.push({ edit, reason: "Edit falls outside the selected text range" });
        continue;
      }
    }

    candidates.push({
      id: editId,
      find: findText,
      replace: replaceText,
      reason: edit.reason,
      start: matchStart,
      end: matchEnd,
      rawEdit: edit,
    });
  }

  // 3. Overlap check: sort candidates ascending by start offset
  candidates.sort((a, b) => a.start - b.start || a.end - b.end);

  let lastEnd = -1;
  for (const cand of candidates) {
    if (cand.start < lastEnd) {
      rejectedEdits.push({
        edit: cand.rawEdit,
        reason: `Overlapping edit: start offset (${cand.start}) overlaps with previous edit range ending at ${lastEnd}`,
      });
    } else {
      validEdits.push({
        id: cand.id,
        find: cand.find,
        replace: cand.replace,
        reason: cand.reason,
        start: cand.start,
        end: cand.end,
      });
      lastEnd = cand.end;
    }
  }

  return { validEdits, rejectedEdits };
}

/**
 * Trims common leading and trailing lines from oldText and newText for clean diff display.
 */
function trimCommonLines(
  oldText: string,
  newText: string,
  start: number,
  end: number,
  baseText: string,
): { oldText: string; newText: string; start: number; end: number } {
  let oldLines = oldText.split("\n");
  let newLines = newText.split("\n");

  let curStart = start;
  let curEnd = end;

  // Trim common prefix lines
  while (oldLines.length > 1 && newLines.length > 1 && oldLines[0] === newLines[0]) {
    const prefixLen = oldLines[0].length + 1; // + 1 for \n
    curStart += prefixLen;
    oldLines.shift();
    newLines.shift();
  }

  // Trim common suffix lines
  while (
    oldLines.length > 1 &&
    newLines.length > 1 &&
    oldLines[oldLines.length - 1] === newLines[newLines.length - 1]
  ) {
    const suffixLen = oldLines[oldLines.length - 1].length + 1;
    curEnd -= suffixLen;
    oldLines.pop();
    newLines.pop();
  }

  const slicedOld = baseText.slice(curStart, curEnd);
  // Verify slice matches oldLines joined
  if (slicedOld.replace(/\r\n/g, "\n") === oldLines.join("\n")) {
    return {
      oldText: slicedOld,
      newText: newLines.join("\n"),
      start: curStart,
      end: curEnd,
    };
  }

  // Fallback to untrimmed if line endings or bounds differ
  return { oldText, newText, start, end };
}

/**
 * Converts validated edits to interactive hunks with line numbers and trimmed diffs.
 */
export function editsToHunks(baseText: string, edits: ValidatedEdit[]): CodeHunk[] {
  const hunks: CodeHunk[] = [];
  let currentLineOffset = 0;

  for (const edit of edits) {
    const rawOld = baseText.slice(edit.start, edit.end);
    const trimmed = trimCommonLines(rawOld, edit.replace, edit.start, edit.end, baseText);

    const oldStartLine = baseText.slice(0, trimmed.start).split("\n").length;
    const newStartLine = oldStartLine + currentLineOffset;

    const oldLinesCount = trimmed.oldText.split("\n").length;
    const newLinesCount = trimmed.newText.split("\n").length;
    currentLineOffset += newLinesCount - oldLinesCount;

    hunks.push({
      id: edit.id,
      reason: edit.reason,
      start: trimmed.start,
      end: trimmed.end,
      oldText: trimmed.oldText,
      newText: trimmed.newText,
      oldStartLine,
      newStartLine,
    });
  }

  return hunks;
}

/**
 * Applies accepted hunk decisions to baseText in bottom-up (descending offset) order.
 * Ensures character offsets of preceding hunks remain completely unaffected.
 */
export function applyDecisions(
  baseText: string,
  hunks: CodeHunk[],
  decisions: Map<string, HunkDecision> | Record<string, HunkDecision>,
): ApplyDecisionsResult {
  const getDecision = (id: string): HunkDecision | undefined => {
    if (decisions instanceof Map) {
      return decisions.get(id);
    }
    return decisions[id];
  };

  const accepted = hunks.filter((h) => getDecision(h.id) === "accepted");
  if (accepted.length === 0) {
    return { code: baseText, changed: false };
  }

  // Sort descending by start offset (bottom-up application)
  const sorted = [...accepted].sort((a, b) => b.start - a.start);

  let code = baseText;
  for (const hunk of sorted) {
    code = code.slice(0, hunk.start) + hunk.newText + code.slice(hunk.end);
  }

  const braceCheck = checkLatexBraceBalance(code);
  let warning: string | undefined;
  if (!braceCheck.balanced) {
    warning = `Mismatched curly braces detected in result (depth diff: ${braceCheck.diff})`;
  }

  return {
    code,
    changed: code !== baseText,
    warning,
  };
}
