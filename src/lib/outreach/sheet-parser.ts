import "server-only";

import * as XLSX from "xlsx";

import { findEmails } from "@/lib/startups/text";

export type ExtractedContact = {
  company: string;
  email: string;
  secondaryEmails: string[];
  phone: string;
  contactPerson: string;
  role: string;
  notes: string;
  sourceRow: number;
  sheetName?: string;
  rawText: string;
};

export type ParseSheetResult = {
  source: string;
  sheetNames: string[];
  totalRows: number;
  contactsWithEmail: ExtractedContact[];
  contactsWithoutEmail: ExtractedContact[];
};

/**
 * Extracts Google Spreadsheet ID and GID from any Google Docs/Sheets URL.
 * e.g. https://docs.google.com/spreadsheets/d/1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8/edit?gid=0#gid=0
 */
export function parseGoogleSheetUrl(url: string): { id: string; gid: string } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("docs.google.com") || !parsed.pathname.includes("/spreadsheets/d/")) {
      return null;
    }
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match?.[1]) return null;

    let gid = "0";
    const gidParam = parsed.searchParams.get("gid");
    if (gidParam) {
      gid = gidParam;
    } else if (parsed.hash) {
      const hashMatch = parsed.hash.match(/gid=(\d+)/);
      if (hashMatch?.[1]) gid = hashMatch[1];
    }
    return { id: match[1], gid };
  } catch {
    return null;
  }
}

/**
 * Fetches a public or shared Google Sheet as an XLSX workbook buffer (containing all tabs),
 * falling back to CSV export if XLSX format is unavailable.
 */
export async function fetchGoogleSpreadsheetBuffer(
  url: string,
  signal?: AbortSignal,
): Promise<{ buffer: Uint8Array; format: "xlsx" | "csv" }> {
  const parsed = parseGoogleSheetUrl(url);
  if (!parsed) throw new Error("Invalid Google Sheet URL.");

  // 1. Try XLSX export to download all worksheets in the workbook
  const xlsxUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=xlsx`;
  try {
    const xlsxRes = await fetch(xlsxUrl, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 Dossier/1.0" },
      signal,
    });
    if (xlsxRes.ok) {
      const arrayBuffer = await xlsxRes.arrayBuffer();
      return { buffer: new Uint8Array(arrayBuffer), format: "xlsx" };
    }
  } catch {
    // fallback to csv below
  }

  // 2. Fallback to CSV export for single sheet
  const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv&gid=${parsed.gid}`;
  const csvRes = await fetch(csvUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 Dossier/1.0" },
    signal,
  });
  if (!csvRes.ok) {
    if (csvRes.status === 404) throw new Error("Google Sheet not found. Please verify the URL.");
    if (csvRes.status === 403 || csvRes.status === 401) {
      throw new Error(
        "Access denied. Please ensure the Google Sheet's sharing is set to 'Anyone with the link can view'.",
      );
    }
    throw new Error(`Failed to download Google Sheet (HTTP ${csvRes.status}).`);
  }
  const arrayBuffer = await csvRes.arrayBuffer();
  return { buffer: new Uint8Array(arrayBuffer), format: "csv" };
}

/** Fetches a public or shared Google Sheet as CSV. */
export async function fetchGoogleSheetCsv(url: string, signal?: AbortSignal): Promise<string> {
  const parsed = parseGoogleSheetUrl(url);
  if (!parsed) throw new Error("Invalid Google Sheet URL.");

  const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv&gid=${parsed.gid}`;
  const response = await fetch(csvUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 Dossier/1.0" },
    signal,
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("Google Sheet not found. Please verify the URL.");
    if (response.status === 403 || response.status === 401) {
      throw new Error(
        "Access denied. Please ensure the Google Sheet's sharing is set to 'Anyone with the link can view'.",
      );
    }
    throw new Error(`Failed to download Google Sheet (HTTP ${response.status}).`);
  }

  return response.text();
}

/**
 * Extracts phone numbers from recruiter notes or strings.
 * e.g. "Gopi (tessolve):- 7624937351" -> { contactPerson: "Gopi", phone: "7624937351" }
 */
export function extractContactPerson(text: string): { contactPerson: string; phone: string } {
  if (!text) return { contactPerson: "", phone: "" };

  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/);
  const phone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, "") : "";

  let contactPerson = "";
  if (text.includes(":") || text.includes("-")) {
    const namePart = text.split(/[:-]/)[0];
    if (namePart && namePart.trim().length > 1 && !/\d{5,}/.test(namePart)) {
      const clean = namePart.trim();
      if (clean.length > 1 && !/^(call|done|sent|email|phone|hr|careers?)$/i.test(clean)) {
        contactPerson = clean;
      }
    }
  }

  return { contactPerson, phone };
}

/**
 * Prioritizes hiring/careers/hr addresses first.
 */
function prioritizeEmail(emails: string[]): { primary: string; secondaries: string[] } {
  if (emails.length === 0) return { primary: "", secondaries: [] };
  if (emails.length === 1) return { primary: emails[0].toLowerCase(), secondaries: [] };

  const sorted = [...emails].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const isHiringA = /^(careers?|jobs?|hiring|hr|talent|people|join|recruit)/.test(aLower);
    const isHiringB = /^(careers?|jobs?|hiring|hr|talent|people|join|recruit)/.test(bLower);
    if (isHiringA && !isHiringB) return -1;
    if (!isHiringA && isHiringB) return 1;
    return 0;
  });

  return {
    primary: sorted[0].toLowerCase(),
    secondaries: sorted.slice(1).map((e) => e.toLowerCase()),
  };
}

/** Parses raw 2D grid of rows into ExtractedContact items. */
export function parseSheetGrid(
  rows: string[][],
  source = "Sheet",
  sheetName = "Sheet1",
): ParseSheetResult {
  if (rows.length === 0) {
    return { source, sheetNames: [sheetName], totalRows: 0, contactsWithEmail: [], contactsWithoutEmail: [] };
  }

  // Detect header row: check first row for typical headers
  let startIndex = 0;
  let companyCol = 0;
  const firstRow = (rows[0] ?? []).map((c) => String(c ?? "").toLowerCase().trim());
  const hasHeader = firstRow.some((col) =>
    ["company", "name", "organization", "rating", "career", "email", "status", "url"].some((kw) =>
      col.includes(kw),
    ),
  );

  if (hasHeader) {
    startIndex = 1;
    const foundCompCol = firstRow.findIndex(
      (col) =>
        col === "company" ||
        col === "company name" ||
        col === "name" ||
        col.includes("company") ||
        col.includes("organization"),
    );
    if (foundCompCol !== -1) companyCol = foundCompCol;
  }

  const contactsWithEmail: ExtractedContact[] = [];
  const contactsWithoutEmail: ExtractedContact[] = [];

  for (let r = startIndex; r < rows.length; r++) {
    const rawRow = rows[r];
    if (!rawRow || rawRow.length === 0) continue;
    const row = rawRow.map((c) => String(c ?? ""));
    if (row.every((c) => !c.trim())) continue;

    // Company is usually in companyCol, or the first non-empty text column
    let company = row[companyCol]?.trim() ?? "";
    if (!company) {
      const firstNonEmpty = row.find(
        (c) => c.trim().length > 0 && !c.includes("@") && !/^\d+(\.\d+)?$/.test(c.trim()),
      );
      company = firstNonEmpty?.trim() ?? "";
    }

    // If still no company name, skip empty placeholder rows
    if (!company) continue;

    // Gather all cell text for regex email & phone scanning
    const rowText = row.join(" ");
    const foundEmails = findEmails(rowText);
    const { primary, secondaries } = prioritizeEmail(foundEmails);

    // Extract contact person, phone info, and URLs from row cells
    let contactPerson = "";
    let phone = "";
    let notes = "";
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      if (cIdx === companyCol) continue;
      const cell = row[cIdx];
      const cellText = cell.trim();
      if (!cellText) continue;
      if (/^https?:\/\//i.test(cellText)) {
        notes = cellText;
      }
      const extracted = extractContactPerson(cellText);
      if (extracted.contactPerson && !contactPerson) contactPerson = extracted.contactPerson;
      if (extracted.phone && !phone) phone = extracted.phone;
    }

    const contact: ExtractedContact = {
      company,
      email: primary,
      secondaryEmails: secondaries,
      phone,
      contactPerson,
      role: "",
      notes,
      sourceRow: r + 1,
      sheetName,
      rawText: row.filter(Boolean).join(" | "),
    };

    if (primary) {
      contactsWithEmail.push(contact);
    } else {
      contactsWithoutEmail.push(contact);
    }
  }

  return {
    source,
    sheetNames: [sheetName],
    totalRows: contactsWithEmail.length + contactsWithoutEmail.length,
    contactsWithEmail,
    contactsWithoutEmail,
  };
}

/** Parses spreadsheet from file buffer (.xlsx, .xls, .csv), extracting ALL sheets. */
export function parseSpreadsheetBuffer(buffer: Uint8Array, source = "upload.xlsx"): ParseSheetResult {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return { source, sheetNames: [], totalRows: 0, contactsWithEmail: [], contactsWithoutEmail: [] };
  }

  const allWithEmail: ExtractedContact[] = [];
  const allWithoutEmail: ExtractedContact[] = [];

  for (const name of sheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;
    const grid = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, blankrows: false, defval: "" });
    const parsed = parseSheetGrid(grid, source, name);
    allWithEmail.push(...parsed.contactsWithEmail);
    allWithoutEmail.push(...parsed.contactsWithoutEmail);
  }

  return {
    source,
    sheetNames,
    totalRows: allWithEmail.length + allWithoutEmail.length,
    contactsWithEmail: allWithEmail,
    contactsWithoutEmail: allWithoutEmail,
  };
}

/** Parses CSV text into grid. */
export function parseCsvText(csvText: string, source = "Google Sheet"): ParseSheetResult {
  const workbook = XLSX.read(csvText, { type: "string", raw: false });
  const sheetNames = workbook.SheetNames || ["Sheet1"];
  const worksheet = workbook.Sheets[sheetNames[0]];
  if (!worksheet) {
    return { source, sheetNames: [], totalRows: 0, contactsWithEmail: [], contactsWithoutEmail: [] };
  }
  const grid = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, blankrows: false, defval: "" });
  return parseSheetGrid(grid, source, sheetNames[0]);
}
