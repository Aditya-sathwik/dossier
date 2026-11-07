import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OutreachScreen, type StoredContact } from "./outreach-screen";
import * as actions from "./actions";

vi.mock("./actions", () => ({
  parseSheetFromUrl: vi.fn(),
  parseSheetFromFile: vi.fn(),
  saveOutreachContacts: vi.fn(async () => ({ ok: true, data: { savedCount: 1 } })),
  resetOutreachSentAction: vi.fn(async () => ({ ok: true, data: { resetCount: 1 } })),
  loadStoredOutreachContacts: vi.fn(async () => ({ ok: false })),
  prepareResumeAttachmentAction: vi.fn(async () => ({
    ok: true,
    data: {
      fileName: "Aditya - Resume.pdf",
      contentType: "application/pdf",
      base64: "cGRmZGF0YQ==",
    },
  })),
  sendOutreachEmailAction: vi.fn(async () => ({
    ok: true,
    data: {
      success: true,
      threadId: "t_123",
      gmailId: "m_123",
      applicationId: "a_123",
    },
  })),
}));

vi.mock("@/components/toast", () => ({
  toast: vi.fn(),
}));

const mockContacts: StoredContact[] = [
  {
    id: "c1",
    company: "Tessolve Semiconductor",
    email: "gopi.c@tessolve.com",
    contactPerson: "Gopi",
    phone: "7624937351",
    role: "Embedded Engineer",
    notes: "",
    sheetName: "Sheet1",
    source: "Google Sheet",
    status: "NEW",
    sentAt: null,
  },
  {
    id: "c2",
    company: "Acme Corp",
    email: "hr@acme.com",
    contactPerson: "Alice",
    phone: "",
    role: "Full Stack Engineer",
    notes: "",
    sheetName: "Sheet2",
    source: "Upload",
    status: "SENT",
    sentAt: "2026-11-01T10:00:00.000Z",
    applicationId: "app_acme_1",
    gmailThreadId: "th_acme_1",
  },
];

const mockConnectedGoogle = {
  status: "connected" as const,
  email: "aditya@gmail.com",
  canSend: true,
  canRead: true,
  canUseCalendar: true,
  lastSyncAt: new Date(),
  syncProblem: null,
};

const mockSettings = {
  baseCoverLetterSubject: "Application for {{role}} at {{company}} - {{my_name}}",
  baseCoverLetterBody: "Hi {{name}},\n\nI am excited to apply for {{role}} at {{company}}.\n\nBest,\n{{my_name}}",
  baseCoverLetterRole: "Software Engineer",
};

describe("OutreachScreen", () => {
  it("renders header, sender status and contact tabs with multi-sheet tabs", () => {
    render(
      <OutreachScreen
        initialContacts={mockContacts}
        initialSheetNames={["Sheet1", "Sheet2"]}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    expect(screen.getByRole("heading", { name: /cold outreach/i })).toBeInTheDocument();
    expect(screen.getByText(/aditya@gmail\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready to Send \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Previously Sent \(1\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All Sheets \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sheet1 \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sheet2 \(1\)/i })).toBeInTheDocument();
  });

  it("filters by sheet tab when clicking a sheet button", async () => {
    const user = userEvent.setup();
    render(
      <OutreachScreen
        initialContacts={mockContacts}
        initialSheetNames={["Sheet1", "Sheet2"]}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    // Click Sheet2: only Acme Corp is in Sheet2 (and it is SENT, not NEW), so Ready to Send becomes 0
    const sheet2Btn = screen.getByRole("button", { name: /Sheet2 \(1\)/i });
    await user.click(sheet2Btn);

    expect(screen.getByText(/Ready to Send \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Previously Sent \(1\)/i)).toBeInTheDocument();

    // Click Sheet1: Tessolve is in Sheet1 (status: NEW)
    const sheet1Btn = screen.getByRole("button", { name: /Sheet1 \(1\)/i });
    await user.click(sheet1Btn);

    expect(screen.getByText(/Ready to Send \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Previously Sent \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText("Tessolve Semiconductor")).toBeInTheDocument();
  });

  it("displays ready contacts in table and allows row selection", async () => {
    const user = userEvent.setup();
    render(
      <OutreachScreen
        initialContacts={mockContacts}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    expect(screen.getByText("Tessolve Semiconductor")).toBeInTheDocument();
    expect(screen.getByText("gopi.c@tessolve.com")).toBeInTheDocument();

    const selectAllBtn = screen.getByRole("button", { name: /select all/i });
    await user.click(selectAllBtn);

    expect(screen.getByRole("button", { name: /send outreach \(1\)/i })).toBeEnabled();
  });

  it("filters contacts via search input", async () => {
    const user = userEvent.setup();
    render(
      <OutreachScreen
        initialContacts={mockContacts}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    const searchInput = screen.getByPlaceholderText(/search companies or emails/i);
    await user.type(searchInput, "NonexistentCorp");

    expect(screen.getByText(/no matching contacts found/i)).toBeInTheDocument();
    expect(screen.queryByText("Tessolve Semiconductor")).not.toBeInTheDocument();
  });

  it("switches to Previously Sent tab, shows conversation & Gmail links, and handles single reset", async () => {
    const user = userEvent.setup();
    render(
      <OutreachScreen
        initialContacts={mockContacts}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    const sentTab = screen.getByRole("tab", { name: /previously sent/i });
    await user.click(sentTab);

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("hr@acme.com")).toBeInTheDocument();
    expect(screen.getByText(/View Conversation/i)).toHaveAttribute("href", "/applications/app_acme_1?tab=conversation");
    expect(screen.getByText(/Open in Gmail/i)).toHaveAttribute("href", "https://mail.google.com/mail/u/0/#inbox/th_acme_1");

    // Click Reset to Ready
    const resetBtn = screen.getByRole("button", { name: /reset to ready/i });
    await user.click(resetBtn);

    expect(actions.resetOutreachSentAction).toHaveBeenCalledWith({
      mode: "single",
      contactId: "c2",
      email: "hr@acme.com",
    });
  });

  it("triggers sync when clicking Sync Google Sheet and updates sheets list", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.parseSheetFromUrl).mockResolvedValueOnce({
      ok: true,
      data: {
        source: "https://docs.google.com/spreadsheets/d/test",
        sheetNames: ["Sheet1", "Sheet2", "Sheet3"],
        summary: {
          total: 2,
          readyCount: 1,
          alreadySentCount: 0,
          noEmailCount: 1,
          duplicateInSheetCount: 0,
          sheetNames: ["Sheet1", "Sheet2", "Sheet3"],
          contacts: [
            {
              category: "READY",
              company: "New Corp",
              email: "careers@newcorp.com",
              contactPerson: "Recruiter",
              phone: "",
              role: "Dev",
              notes: "",
              sheetName: "Sheet1",
              secondaryEmails: [],
              sourceRow: 1,
              rawText: "",
            },
            {
              category: "NO_EMAIL",
              company: "Stealth Startup",
              email: "",
              contactPerson: "CEO",
              phone: "123456",
              role: "",
              notes: "https://stealth.com",
              sheetName: "Sheet3",
              secondaryEmails: [],
              sourceRow: 2,
              rawText: "",
            },
          ],
        },
      },
    });

    render(
      <OutreachScreen
        initialContacts={mockContacts}
        google={mockConnectedGoogle}
        settings={mockSettings}
        profileName="Aditya"
      />,
    );

    const syncBtn = screen.getByRole("button", { name: /sync google sheet/i });
    await user.click(syncBtn);

    await waitFor(() => {
      expect(actions.parseSheetFromUrl).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Ready to Send \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Missing Email \(1\)/i)).toBeInTheDocument();
    });
  });
});
