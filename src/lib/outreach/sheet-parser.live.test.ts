import { describe, expect, it } from "vitest";

import { dedupeContacts } from "./dedupe";
import { fetchGoogleSheetCsv, fetchGoogleSpreadsheetBuffer, parseCsvText, parseSpreadsheetBuffer } from "./sheet-parser";

describe("live Google Sheet ingestion", () => {
  it("fetches and parses the user live Google Sheet as CSV", async () => {
    const url = "https://docs.google.com/spreadsheets/d/1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8/edit?gid=0#gid=0";
    const csv = await fetchGoogleSheetCsv(url);
    expect(csv).toBeDefined();
    expect(csv.length).toBeGreaterThan(1000);

    const parsed = parseCsvText(csv, "Google Sheet (Live)");
    expect(parsed.totalRows).toBeGreaterThan(1000);
    expect(parsed.contactsWithEmail.length).toBeGreaterThan(80);
    expect(parsed.contactsWithoutEmail.length).toBeGreaterThan(900);

    // Mock DB for dedupe verification
    const mockDb = {
      outreachContact: { findMany: async () => [] },
      emailMessage: { findMany: async () => [] },
    } as any;

    const summary = await dedupeContacts(parsed.contactsWithEmail, parsed.contactsWithoutEmail, mockDb);
    expect(summary.readyCount).toBe(parsed.contactsWithEmail.length);
    expect(summary.noEmailCount).toBe(parsed.contactsWithoutEmail.length);
  }, 30_000);

  it("fetches the user live Google Sheet as XLSX and parses all 5 sheets", async () => {
    const url = "https://docs.google.com/spreadsheets/d/1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8/edit?gid=0#gid=0";
    const res = await fetchGoogleSpreadsheetBuffer(url);
    expect(res.format).toBe("xlsx");
    expect(res.buffer.byteLength).toBeGreaterThan(50000);

    const parsed = parseSpreadsheetBuffer(res.buffer, url);
    expect(parsed.sheetNames).toEqual(expect.arrayContaining(["Sheet1", "Sheet2", "Sheet3", "Sheet4", "Sheet5"]));
    expect(parsed.totalRows).toBeGreaterThan(1500);
  }, 30_000);
});

