import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  extractContactPerson,
  parseCsvText,
  parseGoogleSheetUrl,
  parseSheetGrid,
  parseSpreadsheetBuffer,
} from "./sheet-parser";

describe("sheet-parser", () => {
  describe("parseGoogleSheetUrl", () => {
    it("parses standard Google Sheet edit URLs", () => {
      const url = "https://docs.google.com/spreadsheets/d/1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8/edit?gid=0#gid=0";
      const result = parseGoogleSheetUrl(url);
      expect(result).toEqual({ id: "1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8", gid: "0" });
    });

    it("parses Google Sheet URLs with custom gid in search param", () => {
      const url = "https://docs.google.com/spreadsheets/d/abc123XYZ_456/edit?gid=123456";
      const result = parseGoogleSheetUrl(url);
      expect(result).toEqual({ id: "abc123XYZ_456", gid: "123456" });
    });

    it("returns null for non-Google-Sheet URLs", () => {
      expect(parseGoogleSheetUrl("https://example.com/sheet.xlsx")).toBeNull();
      expect(parseGoogleSheetUrl("not a url")).toBeNull();
    });
  });

  describe("extractContactPerson", () => {
    it("extracts named contact with organization and phone", () => {
      const sample = "Gopi (tessolve):- 7624937351";
      const res = extractContactPerson(sample);
      expect(res.contactPerson).toBe("Gopi (tessolve)");
      expect(res.phone).toBe("7624937351");
    });

    it("extracts contact name with complex name and phone", () => {
      const sample = "Swapna (gleecus):-7672034797";
      const res = extractContactPerson(sample);
      expect(res.contactPerson).toBe("Swapna (gleecus)");
      expect(res.phone).toBe("7672034797");
    });

    it("extracts simple phone number when no name is present", () => {
      const sample = "Call at +919949495174 for queries";
      const res = extractContactPerson(sample);
      expect(res.phone).toBe("+919949495174");
    });
  });

  describe("parseSheetGrid", () => {
    it("parses grid matching the user's spreadsheet structure", () => {
      const rows = [
        ["", "rating_text", "careersUrl", "", "status/call", "emails", "careersPage", "", "", ""],
        ["AdvantEdge Healthcare Solutions", "3.7", "", "", "", "", "", "", "", ""],
        ["ZINFI Technologies", "2.4", "hrteam@zinfitech.com", "", "", "", "", "Gopi (tessolve):- 7624937351", "", ""],
        ["Moofwd Technologies India", "4", "careers@moofwd.com, job@moofwd.com", "", "", "", "", "", "", ""],
        ["Bharuwa Solutions", "3", "info@bharuwasolutions.com, career@bharuwasolutions.com", "", "", "", "", "", "", ""],
      ];

      const result = parseSheetGrid(rows, "Test Sheet");
      expect(result.totalRows).toBe(4);
      expect(result.contactsWithEmail).toHaveLength(3);
      expect(result.contactsWithoutEmail).toHaveLength(1);

      // Check without email
      expect(result.contactsWithoutEmail[0].company).toBe("AdvantEdge Healthcare Solutions");

      // Check ZINFI
      const zinfi = result.contactsWithEmail.find((c) => c.company === "ZINFI Technologies");
      expect(zinfi).toBeDefined();
      expect(zinfi?.email).toBe("hrteam@zinfitech.com");
      expect(zinfi?.contactPerson).toBe("Gopi (tessolve)");
      expect(zinfi?.phone).toBe("7624937351");

      // Check Moofwd (multiple emails, careers prioritized)
      const moofwd = result.contactsWithEmail.find((c) => c.company === "Moofwd Technologies India");
      expect(moofwd).toBeDefined();
      expect(moofwd?.email).toBe("careers@moofwd.com");
      expect(moofwd?.secondaryEmails).toContain("job@moofwd.com");

      // Check Bharuwa
      const bharuwa = result.contactsWithEmail.find((c) => c.company === "Bharuwa Solutions");
      expect(bharuwa).toBeDefined();
      expect(bharuwa?.email).toBe("career@bharuwasolutions.com");
      expect(bharuwa?.secondaryEmails).toContain("info@bharuwasolutions.com");
    });
  });

  describe("parseCsvText", () => {
    it("parses CSV text into contacts", () => {
      const csv = `Company,Email,Notes\nAcme Corp,careers@acme.example,Good fit\nBeta Ltd,,Pending`;
      const res = parseCsvText(csv, "upload.csv");
      expect(res.contactsWithEmail).toHaveLength(1);
      expect(res.contactsWithEmail[0].company).toBe("Acme Corp");
      expect(res.contactsWithEmail[0].email).toBe("careers@acme.example");
      expect(res.contactsWithoutEmail).toHaveLength(1);
      expect(res.contactsWithoutEmail[0].company).toBe("Beta Ltd");
    });
  });

  describe("parseSpreadsheetBuffer with multiple sheets", () => {
    it("extracts contacts across multiple worksheets and tags their sheetName", () => {
      const wb = XLSX.utils.book_new();

      const sheet1Data = [
        ["Company", "Email"],
        ["Alpha Tech", "jobs@alpha.example"],
      ];
      const sheet2Data = [
        ["Company", "Email"],
        ["Beta Systems", "contact@beta.example"],
        ["Gamma Labs", ""],
      ];

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), "Sheet1");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), "Sheet2");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const res = parseSpreadsheetBuffer(buffer, "multi.xlsx");

      expect(res.sheetNames).toEqual(["Sheet1", "Sheet2"]);
      expect(res.contactsWithEmail).toHaveLength(2);
      expect(res.contactsWithoutEmail).toHaveLength(1);

      const alpha = res.contactsWithEmail.find((c) => c.company === "Alpha Tech");
      expect(alpha?.sheetName).toBe("Sheet1");

      const beta = res.contactsWithEmail.find((c) => c.company === "Beta Systems");
      expect(beta?.sheetName).toBe("Sheet2");

      const gamma = res.contactsWithoutEmail.find((c) => c.company === "Gamma Labs");
      expect(gamma?.sheetName).toBe("Sheet2");
    });
  });
});

