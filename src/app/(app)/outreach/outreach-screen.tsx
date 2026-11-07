"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Info,
  Link2,
  Loader2,
  Mail,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Search,
  SendHorizontal,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { AlertDialog } from "radix-ui";
import { useMemo, useState, useTransition } from "react";

import { toast } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GoogleConnection } from "@/lib/google/account";
import type { DedupeSummary } from "@/lib/outreach/dedupe";

import {
  clearOutreachDataAction,
  loadStoredOutreachContacts,
  parseSheetFromFile,
  parseSheetFromUrl,
  resetOutreachSentAction,
} from "./actions";
import { SendDialog } from "./send-dialog";

export type StoredContact = {
  id: string;
  company: string;
  email: string;
  contactPerson: string;
  phone: string;
  role: string;
  notes: string;
  sheetName: string;
  source: string;
  status: string;
  sentAt: Date | string | null;
  applicationId?: string | null;
  gmailThreadId?: string | null;
};

export type StoredPendingCompany = {
  id: string;
  company: string;
  contactPerson: string;
  phone: string;
  notes: string;
  sheetName: string;
  source: string;
};

export type OutreachScreenProps = {
  initialContacts: StoredContact[];
  initialPendingCompanies?: StoredPendingCompany[];
  initialSheetNames?: string[];
  google: GoogleConnection;
  settings: {
    baseEmailSubject?: string;
    baseEmailBody?: string;
    baseCoverLetterSubject: string;
    baseCoverLetterBody: string;
    baseCoverLetterRole: string;
  };
  profileName: string;
};

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1E6KMrKNyGJzgKMemfsWDGL4Jb6bhO32ylfYsWiXNAM8/edit?gid=0#gid=0";

export function OutreachScreen({
  initialContacts,
  initialPendingCompanies = [],
  initialSheetNames = [],
  google,
  settings,
  profileName,
}: OutreachScreenProps) {
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [activeTab, setActiveTab] = useState<"ready" | "sent" | "missing">("ready");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<string>("all");

  const [isSyncing, startSync] = useTransition();
  const [isResetting, startReset] = useTransition();

  // Stored state backed by PostgreSQL
  const [storedContacts, setStoredContacts] = useState<StoredContact[]>(initialContacts);
  const [storedPending, setStoredPending] = useState<StoredPendingCompany[]>(initialPendingCompanies);

  // Selection states
  const [selectedReadyEmails, setSelectedReadyEmails] = useState<Set<string>>(new Set());
  const [selectedSentIds, setSelectedSentIds] = useState<Set<string>>(new Set());

  // Modal states
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [hardResetDialogOpen, setHardResetDialogOpen] = useState(false);
  const [dateResetDialogOpen, setDateResetDialogOpen] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [rangeEndDate, setRangeEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Compute available worksheet names
  const availableSheets = useMemo(() => {
    const set = new Set<string>(initialSheetNames);
    storedContacts.forEach((c) => {
      if (c.sheetName) set.add(c.sheetName);
    });
    storedPending.forEach((p) => {
      if (p.sheetName) set.add(p.sheetName);
    });
    return Array.from(set).filter(Boolean);
  }, [initialSheetNames, storedContacts, storedPending]);

  // Sheet-filtered base lists
  const sheetContacts = useMemo(() => {
    if (selectedSheet === "all") return storedContacts;
    return storedContacts.filter((c) => (c.sheetName || "Sheet1") === selectedSheet);
  }, [storedContacts, selectedSheet]);

  const sheetPending = useMemo(() => {
    if (selectedSheet === "all") return storedPending;
    return storedPending.filter((p) => (p.sheetName || "Sheet1") === selectedSheet);
  }, [storedPending, selectedSheet]);

  // Tab categorization
  const readyContacts = useMemo(
    () => sheetContacts.filter((c) => c.status !== "SENT" && c.email.includes("@")),
    [sheetContacts],
  );

  const sentContacts = useMemo(
    () => sheetContacts.filter((c) => c.status === "SENT"),
    [sheetContacts],
  );

  // Search-filtered views
  const filteredReady = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return readyContacts;
    return readyContacts.filter(
      (c) =>
        c.company.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q),
    );
  }, [readyContacts, searchQuery]);

  const filteredSent = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sentContacts;
    return sentContacts.filter(
      (c) =>
        c.company.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [sentContacts, searchQuery]);

  const filteredMissing = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sheetPending;
    return sheetPending.filter(
      (p) =>
        p.company.toLowerCase().includes(q) ||
        p.contactPerson.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q),
    );
  }, [sheetPending, searchQuery]);

  // Count matching contacts for date-range reset preview
  const matchingDateRangeCount = useMemo(() => {
    if (!rangeStartDate || !rangeEndDate) return 0;
    const start = new Date(rangeStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeEndDate);
    end.setHours(23, 59, 59, 999);
    return sentContacts.filter((c) => {
      if (!c.sentAt) return false;
      const sentTime = new Date(c.sentAt).getTime();
      return sentTime >= start.getTime() && sentTime <= end.getTime();
    }).length;
  }, [sentContacts, rangeStartDate, rangeEndDate]);

  // Ingestion handler: Google Sheet Sync
  const handleSyncGoogleSheet = () => {
    if (!sheetUrl.trim()) {
      toast("Please enter a Google Sheet URL.");
      return;
    }

    startSync(async () => {
      try {
        const res = await parseSheetFromUrl({ url: sheetUrl.trim() });
        if (!res.ok) {
          toast(res.error || "Failed to fetch spreadsheet.");
          return;
        }

        const summary: DedupeSummary = res.data.summary;
        const readyList = summary.contacts.filter((c) => c.category === "READY");
        const alreadySentList = summary.contacts.filter((c) => c.category === "ALREADY_SENT");
        const noEmailList = summary.contacts.filter((c) => c.category === "NO_EMAIL");

        // Update local state map
        const updatedMap = new Map<string, StoredContact>();
        storedContacts.forEach((c) => updatedMap.set(c.email.toLowerCase(), c));

        readyList.forEach((c) => {
          const key = c.email.toLowerCase();
          const existing = updatedMap.get(key);
          if (existing) {
            updatedMap.set(key, {
              ...existing,
              company: c.company || existing.company,
              sheetName: c.sheetName || existing.sheetName || "Sheet1",
            });
          } else {
            updatedMap.set(key, {
              id: `db_${Date.now()}_${Math.random()}`,
              company: c.company,
              email: c.email,
              contactPerson: c.contactPerson,
              phone: c.phone,
              role: c.role,
              notes: c.notes,
              sheetName: c.sheetName || "Sheet1",
              source: res.data.source,
              status: "NEW",
              sentAt: null,
            });
          }
        });

        alreadySentList.forEach((c) => {
          const key = c.email.toLowerCase();
          const existing = updatedMap.get(key);
          if (existing) {
            updatedMap.set(key, {
              ...existing,
              status: "SENT",
              sentAt: c.alreadySentAt || existing.sentAt,
            });
          }
        });

        // Reload persisted state from DB so records have real database IDs
        const reloadRes = await loadStoredOutreachContacts({});
        if (reloadRes.ok && reloadRes.data) {
          setStoredContacts(reloadRes.data.contacts);
          setStoredPending(reloadRes.data.pending);
        } else {
          setStoredContacts(Array.from(updatedMap.values()));
          setStoredPending(
            noEmailList.map((c, i) => ({
              id: `pending_${Date.now()}_${i}`,
              company: c.company,
              contactPerson: c.contactPerson,
              phone: c.phone,
              notes: c.notes,
              sheetName: c.sheetName || "Sheet1",
              source: res.data.source,
            })),
          );
        }

        toast(
          `Synced: ${readyList.length} ready, ${alreadySentList.length} already sent, ${noEmailList.length} pending research across ${res.data.sheetNames.length} sheets.`,
        );
      } catch {
        toast("An error occurred while syncing the spreadsheet.");
      }
    });
  };

  // Ingestion handler: File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    startSync(async () => {
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result as string;
          const res = await parseSheetFromFile({ base64Data, fileName: file.name });
          if (!res.ok) {
            toast(res.error || "Failed to parse file.");
            return;
          }

          const summary: DedupeSummary = res.data.summary;
          const reloadRes = await loadStoredOutreachContacts({});
          if (reloadRes.ok && reloadRes.data) {
            setStoredContacts(reloadRes.data.contacts);
            setStoredPending(reloadRes.data.pending);
          }

          toast(`Imported ${summary.readyCount} ready contacts from ${res.data.sheetNames.length} sheets.`);
        };
        reader.readAsDataURL(file);
      } catch {
        toast("Failed to read file.");
      }
    });
  };

  // RESET HANDLER 1: Single contact reset (inline button or search target)
  const handleResetSingle = (contact: StoredContact) => {
    startReset(async () => {
      const res = await resetOutreachSentAction({
        mode: "single",
        contactId: contact.id.startsWith("db_") ? undefined : contact.id,
        email: contact.email,
      });
      if (res.ok) {
        setStoredContacts((prev) =>
          prev.map((c) => (c.email === contact.email ? { ...c, status: "NEW", sentAt: null } : c)),
        );
        setSelectedSentIds((prev) => {
          const next = new Set(prev);
          next.delete(contact.id);
          return next;
        });
      }
    });
  };

  // RESET HANDLER 1B: Reset selected sent contacts
  const handleResetSelected = () => {
    if (selectedSentIds.size === 0) return;
    const ids = Array.from(selectedSentIds).filter((id) => !id.startsWith("db_"));
    const emails = Array.from(
      new Set(storedContacts.filter((c) => selectedSentIds.has(c.id)).map((c) => c.email)),
    );

    startReset(async () => {
      const res = await resetOutreachSentAction({
        mode: "selected",
        contactIds: ids.length > 0 ? ids : undefined,
        emails: emails.length > 0 ? emails : undefined,
      });
      if (res.ok) {
        const emailSet = new Set(emails);
        setStoredContacts((prev) =>
          prev.map((c) => (emailSet.has(c.email) ? { ...c, status: "NEW", sentAt: null } : c)),
        );
        setSelectedSentIds(new Set());
      }
    });
  };

  // RESET HANDLER 2: Date-range reset
  const handleResetDateRange = () => {
    if (!rangeStartDate || !rangeEndDate) return;
    startReset(async () => {
      const res = await resetOutreachSentAction({
        mode: "date_range",
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      });
      if (res.ok) {
        const start = new Date(rangeStartDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(rangeEndDate);
        end.setHours(23, 59, 59, 999);

        setStoredContacts((prev) =>
          prev.map((c) => {
            if (c.status === "SENT" && c.sentAt) {
              const time = new Date(c.sentAt).getTime();
              if (time >= start.getTime() && time <= end.getTime()) {
                return { ...c, status: "NEW", sentAt: null };
              }
            }
            return c;
          }),
        );
        setDateResetDialogOpen(false);
      }
    });
  };

  // RESET HANDLER 3: Hard reset all sent contacts
  const handleHardResetAll = () => {
    startReset(async () => {
      const res = await resetOutreachSentAction({ mode: "all" });
      if (res.ok) {
        setStoredContacts((prev) =>
          prev.map((c) => (c.status === "SENT" ? { ...c, status: "NEW", sentAt: null } : c)),
        );
        setHardResetDialogOpen(false);
      }
    });
  };

  // Selection helpers for Ready to Send
  const toggleSelectReadyEmail = (email: string) => {
    setSelectedReadyEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSelectAllReady = () => {
    setSelectedReadyEmails(new Set(filteredReady.map((c) => c.email)));
  };

  const handleDeselectAllReady = () => {
    setSelectedReadyEmails(new Set());
  };

  // Selection helpers for Sent tab
  const toggleSelectSentId = (id: string) => {
    setSelectedSentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllSent = () => {
    setSelectedSentIds(new Set(filteredSent.map((c) => c.id)));
  };

  const handleDeselectAllSent = () => {
    setSelectedSentIds(new Set());
  };

  // Export missing emails list as CSV
  const handleExportMissingCsv = () => {
    if (filteredMissing.length === 0) return;
    const header = "Company,Contact Person,Phone,Notes,Sheet,Source\n";
    const rows = filteredMissing
      .map(
        (c) =>
          `"${(c.company || "").replace(/"/g, '""')}","${(c.contactPerson || "").replace(/"/g, '""')}","${(c.phone || "").replace(/"/g, '""')}","${(c.notes || "").replace(/"/g, '""')}","${(c.sheetName || "").replace(/"/g, '""')}","${(c.source || "").replace(/"/g, '""')}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `missing_emails_${selectedSheet}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedReadyTargets = useMemo(
    () => readyContacts.filter((c) => selectedReadyEmails.has(c.email)),
    [readyContacts, selectedReadyEmails],
  );

  const isConnected = google.status === "connected" && google.canSend;
  const senderEmail = google.status === "connected" ? google.email : null;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-normal tracking-tight text-ink">Cold Outreach</h1>
          <p className="mt-1 text-sm text-muted">
            Import companies from Excel or Google Sheets, prevent duplicate sends, and dispatch personalized applications with your Base Resume.
          </p>
        </div>

        {/* Sender status badge */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3.5 py-1.5 text-xs font-medium text-success-text">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              <span>
                Sending from <strong>{senderEmail}</strong>
              </span>
            </div>
          ) : (
            <Link
              href="/settings?section=google"
              className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-3.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/15 transition-colors"
            >
              <Info className="size-3.5" />
              <span>Connect Gmail to enable sending</span>
            </Link>
          )}
        </div>
      </div>

      {/* Spreadsheet Ingestion Card */}
      <Card padding="default" className="flex flex-col gap-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileSpreadsheet className="size-4 text-primary" />
            <span>Import Spreadsheet Data</span>
          </div>
          <span className="text-xs text-muted">
            Local copy saved in database · Switching pages never resets your data
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] items-center gap-3">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Paste Google Sheet URL..."
              className="h-10 w-full pl-9 pr-3 rounded-control border border-line-control bg-input text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-hidden"
            />
          </div>

          <Button
            variant="primary"
            size="md"
            disabled={isSyncing || !sheetUrl.trim()}
            onClick={handleSyncGoogleSheet}
          >
            {isSyncing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Syncing All Sheets…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" /> Sync Google Sheet
              </>
            )}
          </Button>

          <label className={buttonClassName("secondary", "md", "cursor-pointer")}>
            <UploadCloud className="size-4" />
            <span>Upload File</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={handleFileUpload}
              disabled={isSyncing}
            />
          </label>
        </div>

        {/* Multi-Sheet Selector Bar */}
        {availableSheets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-line/50">
            <span className="text-xs font-semibold text-muted mr-1.5">Worksheets:</span>
            <button
              onClick={() => setSelectedSheet("all")}
              className={`rounded-control px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                selectedSheet === "all"
                  ? "bg-primary text-on-primary shadow-xs"
                  : "bg-muted/15 text-muted hover:bg-muted/25 hover:text-ink"
              }`}
            >
              All Sheets ({storedContacts.length + storedPending.length})
            </button>
            {availableSheets.map((sheet) => {
              const count =
                storedContacts.filter((c) => (c.sheetName || "Sheet1") === sheet).length +
                storedPending.filter((p) => (p.sheetName || "Sheet1") === sheet).length;
              return (
                <button
                  key={sheet}
                  onClick={() => setSelectedSheet(sheet)}
                  className={`rounded-control px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    selectedSheet === sheet
                      ? "bg-primary text-on-primary shadow-xs"
                      : "bg-muted/15 text-muted hover:bg-muted/25 hover:text-ink"
                  }`}
                >
                  {sheet} ({count})
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Main Contact Management Card */}
      <Card padding="none" className="flex flex-col shadow-xs overflow-hidden">
        {/* Navigation Tabs and Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-line p-4 bg-muted/5">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)}>
            <TabsList variant="segmented">
              <TabsTrigger value="ready">
                Ready to Send ({readyContacts.length})
              </TabsTrigger>
              <TabsTrigger value="sent">
                Previously Sent ({sentContacts.length})
              </TabsTrigger>
              <TabsTrigger value="missing">
                Missing Email ({sheetPending.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                placeholder={
                  activeTab === "sent"
                    ? "Search sent companies or emails…"
                    : "Search companies or emails…"
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full pl-8 pr-3 rounded-control border border-line-control bg-input text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-hidden"
              />
            </div>

            {/* Actions for Tab 1: Ready to Send */}
            {activeTab === "ready" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={
                    selectedReadyEmails.size === filteredReady.length
                      ? handleDeselectAllReady
                      : handleSelectAllReady
                  }
                  disabled={filteredReady.length === 0}
                >
                  {selectedReadyEmails.size === filteredReady.length && filteredReady.length > 0
                    ? "Deselect All"
                    : `Select All (${filteredReady.length})`}
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedReadyEmails.size === 0 || !isConnected}
                  onClick={() => setSendDialogOpen(true)}
                >
                  <SendHorizontal className="size-3.5" />
                  <span>Send Outreach ({selectedReadyEmails.size})</span>
                </Button>
              </div>
            )}

            {/* Actions for Tab 2: Previously Sent (The 3 Reset Modes) */}
            {activeTab === "sent" && sentContacts.length > 0 && (
              <div className="flex items-center gap-2">
                {/* Reset selected specific rows */}
                {selectedSentIds.size > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleResetSelected}
                    disabled={isResetting}
                  >
                    <RotateCcw className="size-3.5" />
                    <span>Reset Selected ({selectedSentIds.size})</span>
                  </Button>
                )}

                {/* Reset by Date Range button */}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDateResetDialogOpen(true)}
                  disabled={isResetting}
                >
                  <Calendar className="size-3.5" />
                  <span>Reset by Date Range</span>
                </Button>

                {/* Hard Reset All button */}
                <Button
                  variant="danger-outline"
                  size="sm"
                  onClick={() => setHardResetDialogOpen(true)}
                  disabled={isResetting}
                >
                  <RotateCcw className="size-3.5" />
                  <span>Reset All Sent</span>
                </Button>
              </div>
            )}

            {/* Actions for Tab 3: Missing Email */}
            {activeTab === "missing" && filteredMissing.length > 0 && (
              <Button variant="secondary" size="sm" onClick={handleExportMissingCsv}>
                <Download className="size-3.5" /> Export Missing CSV
              </Button>
            )}
          </div>
        </div>

        {/* Tab 1: Ready to Send */}
        {activeTab === "ready" && (
          <div className="overflow-x-auto">
            {filteredReady.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">
                {searchQuery
                  ? "No matching contacts found for search."
                  : "No contacts ready to send. Sync your spreadsheet or upload a file above."}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-muted/10 font-semibold text-muted">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          selectedReadyEmails.size === filteredReady.length && filteredReady.length > 0
                        }
                        onChange={(e) =>
                          e.target.checked ? handleSelectAllReady() : handleDeselectAllReady()
                        }
                        className="size-4 rounded-xs accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Contact / Recruiter</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Sheet</th>
                    <th className="py-3 px-4">Role / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredReady.map((contact) => {
                    const isSelected = selectedReadyEmails.has(contact.email);
                    return (
                      <tr
                        key={contact.email}
                        className={`hover:bg-muted/10 transition-colors cursor-pointer ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                        onClick={() => toggleSelectReadyEmail(contact.email)}
                      >
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectReadyEmail(contact.email)}
                            className="size-4 rounded-xs accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-ink">{contact.company || "—"}</td>
                        <td className="py-3 px-4 text-muted">{contact.contactPerson || "—"}</td>
                        <td className="py-3 px-4 font-mono text-ink">{contact.email}</td>
                        <td className="py-3 px-4">
                          <span className="rounded-xs bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-muted">
                            {contact.sheetName || "Sheet1"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted max-w-xs truncate">
                          {contact.notes || contact.role || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Previously Sent (with the 3 Reset Types & Direct Links) */}
        {activeTab === "sent" && (
          <div className="overflow-x-auto">
            {filteredSent.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">
                {searchQuery ? "No matching sent contacts found." : "No outreach sent yet."}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-muted/10 font-semibold text-muted">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          selectedSentIds.size === filteredSent.length && filteredSent.length > 0
                        }
                        onChange={(e) =>
                          e.target.checked ? handleSelectAllSent() : handleDeselectAllSent()
                        }
                        className="size-4 rounded-xs accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Sent Date</th>
                    <th className="py-3 px-4">Direct Conversation</th>
                    <th className="py-3 px-4">Gmail Thread</th>
                    <th className="py-3 px-4 text-right">Reset Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredSent.map((contact) => (
                    <tr key={contact.email} className="hover:bg-muted/5 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedSentIds.has(contact.id)}
                          onChange={() => toggleSelectSentId(contact.id)}
                          className="size-4 rounded-xs accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-medium text-ink">{contact.company || "—"}</td>
                      <td className="py-3 px-4 font-mono text-ink">{contact.email}</td>
                      <td className="py-3 px-4 text-muted">
                        {contact.sentAt
                          ? new Date(contact.sentAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Sent"}
                      </td>
                      <td className="py-3 px-4">
                        {contact.applicationId ? (
                          <Link
                            href={`/applications/${contact.applicationId}?tab=conversation`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            <MessageSquareText className="size-3.5" /> View Conversation
                          </Link>
                        ) : (
                          <Link
                            href="/inbox"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Mail className="size-3.5" /> Dossier Inbox
                          </Link>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {contact.gmailThreadId ? (
                          <a
                            href={`https://mail.google.com/mail/u/0/#inbox/${contact.gmailThreadId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-muted hover:text-ink hover:underline"
                          >
                            <ExternalLink className="size-3" /> Open in Gmail ↗
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {/* Mode 1: Targeted Row Reset button */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResetSingle(contact)}
                          disabled={isResetting}
                        >
                          <RotateCcw className="size-3" /> Reset to Ready
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Missing Email */}
        {activeTab === "missing" && (
          <div className="overflow-x-auto">
            {filteredMissing.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted">
                {searchQuery
                  ? "No matching records found."
                  : "No missing emails. Sync a sheet to populate pending companies."}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-line bg-muted/10 font-semibold text-muted">
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Contact / Phone</th>
                    <th className="py-3 px-4">Sheet</th>
                    <th className="py-3 px-4">Careers / Website URL</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredMissing.map((item, index) => (
                    <tr key={index} className="hover:bg-muted/5 transition-colors">
                      <td className="py-3 px-4 font-medium text-ink">{item.company || "—"}</td>
                      <td className="py-3 px-4 text-muted">{item.phone || item.contactPerson || "—"}</td>
                      <td className="py-3 px-4">
                        <span className="rounded-xs bg-muted/15 px-2 py-0.5 text-[11px] font-medium text-muted">
                          {item.sheetName || "Sheet1"}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm truncate">
                        {item.notes && item.notes.startsWith("http") ? (
                          <a
                            href={item.notes}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <span className="truncate">{item.notes}</span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-muted">{item.notes || "—"}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted">
                        {item.notes && !item.notes.startsWith("http") ? item.notes : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {/* Send Batch Modal */}
      <SendDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        selectedContacts={selectedReadyTargets}
        senderEmail={senderEmail}
        canSend={Boolean(isConnected)}
        baseSubject={settings.baseEmailSubject || settings.baseCoverLetterSubject}
        baseBody={settings.baseEmailBody || settings.baseCoverLetterBody}
        profileName={profileName}
        onFinished={() => {
          setStoredContacts((prev) =>
            prev.map((c) =>
              selectedReadyEmails.has(c.email)
                ? { ...c, status: "SENT", sentAt: new Date() }
                : c,
            ),
          );
          setSelectedReadyEmails(new Set());
        }}
      />

      {/* Mode 2: Reset by Date Range Dialog */}
      <AlertDialog.Root open={dateResetDialogOpen} onOpenChange={setDateResetDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-dialog border border-line-popover bg-card p-6 shadow-menu">
            <div>
              <AlertDialog.Title className="font-serif text-[22px] leading-tight">
                Reset Sent by Date Range
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted">
                Choose the start and end dates. All contacts sent within this window will be reset back to Ready to Send.
              </AlertDialog.Description>
            </div>

            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">From Date</label>
                <input
                  type="date"
                  value={rangeStartDate}
                  onChange={(e) => setRangeStartDate(e.target.value)}
                  className="h-9 w-full px-2.5 rounded-control border border-line-control bg-input text-xs text-ink focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">To Date</label>
                <input
                  type="date"
                  value={rangeEndDate}
                  onChange={(e) => setRangeEndDate(e.target.value)}
                  className="h-9 w-full px-2.5 rounded-control border border-line-control bg-input text-xs text-ink focus:border-primary focus:outline-hidden"
                />
              </div>
            </div>

            <div className="rounded-control bg-muted/15 p-3 text-xs text-ink flex items-center gap-2">
              <Clock className="size-4 text-primary shrink-0" />
              <span>
                Found <strong className="font-semibold">{matchingDateRangeCount}</strong> matching sent{" "}
                {matchingDateRangeCount === 1 ? "contact" : "contacts"} in this date range.
              </span>
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Cancel className={buttonClassName("secondary", "sm")}>
                Cancel
              </AlertDialog.Cancel>
              <Button
                variant="primary"
                size="sm"
                disabled={matchingDateRangeCount === 0 || isResetting}
                onClick={handleResetDateRange}
              >
                Reset {matchingDateRangeCount} Contacts
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Mode 3: Hard Reset All Dialog */}
      <ConfirmDialog
        open={hardResetDialogOpen}
        onOpenChange={setHardResetDialogOpen}
        title="Reset all sent contacts?"
        description={`This will reset all ${sentContacts.length} sent contacts back to Ready to Send. Their sent dates and thread links will be cleared so you can re-contact them.`}
        confirmLabel="Reset All to Ready"
        onConfirm={handleHardResetAll}
      />
    </div>
  );
}
