"use client";

import { useTransition, useState, useRef } from "react";
import { Sparkles, RotateCcw, Copy, Check, Building2, Briefcase, MailCheck, Mail, FileText } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { interpolateTemplate } from "@/lib/outreach/template";
import type { ProfileData } from "@/lib/profile";
import {
  DEFAULT_BASE_COVER_LETTER_BODY,
  DEFAULT_BASE_COVER_LETTER_SUBJECT,
  DEFAULT_BASE_EMAIL_BODY,
  DEFAULT_BASE_EMAIL_SUBJECT,
  DEFAULT_BASE_ROLE,
  EMAIL_TRACK_PRESETS,
  type OutreachTrack,
} from "@/lib/settings";

import {
  generateBaseCoverLetterAction,
  generateBaseEmailAction,
  saveBaseCoverLetter,
  saveBaseEmail,
} from "./actions";

export type LetterWorkspaceProps = {
  profile: ProfileData;
  initialTab?: "email" | "letter";
  initialEmailTrack?: OutreachTrack;
  initialEmailSubject?: string;
  initialEmailBody?: string;
  initialCoverLetterSubject?: string;
  initialCoverLetterBody?: string;
  initialRole?: string;
  /** Legacy prop support */
  initialSubject?: string;
  initialBody?: string;
};

/** Substitutes template variables with preview values. */
export function resolveTemplateVariables(
  template: string,
  vars: { company: string; role: string; name: string; contactPerson: string },
): string {
  return interpolateTemplate(template, {
    company: vars.company,
    role: vars.role,
    contactPerson: vars.contactPerson,
    name: vars.name,
    myName: vars.name,
  });
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function LetterWorkspace({
  profile,
  initialTab,
  initialEmailTrack = "fullstack",
  initialEmailSubject,
  initialEmailBody,
  initialCoverLetterSubject,
  initialCoverLetterBody,
  initialRole,
  initialSubject,
  initialBody,
}: LetterWorkspaceProps) {
  const defaultTab = initialTab || (initialSubject && !initialEmailSubject ? "letter" : "email");
  const [activeTab, setActiveTab] = useState<"email" | "letter">(defaultTab);

  // Email Tab State
  const [emailTrack, setEmailTrack] = useState<OutreachTrack>(initialEmailTrack);
  const [emailSubject, setEmailSubject] = useState(
    initialEmailSubject || EMAIL_TRACK_PRESETS[initialEmailTrack]?.subject || DEFAULT_BASE_EMAIL_SUBJECT,
  );
  const [emailBody, setEmailBody] = useState(
    initialEmailBody || EMAIL_TRACK_PRESETS[initialEmailTrack]?.body || DEFAULT_BASE_EMAIL_BODY,
  );

  // Cover Letter Tab State (also handles legacy initialSubject/initialBody)
  const [letterSubject, setLetterSubject] = useState(
    initialCoverLetterSubject || initialSubject || DEFAULT_BASE_COVER_LETTER_SUBJECT,
  );
  const [letterBody, setLetterBody] = useState(
    initialCoverLetterBody || initialBody || DEFAULT_BASE_COVER_LETTER_BODY,
  );
  const [role, setRole] = useState(initialRole || DEFAULT_BASE_ROLE);

  const [previewCompany, setPreviewCompany] = useState("Acme Corp");
  const [previewContact, setPreviewContact] = useState("Jane");
  const [copied, setCopied] = useState(false);

  const [savingEmail, startSavingEmail] = useTransition();
  const [generatingEmail, startGeneratingEmail] = useTransition();
  const [savingLetter, startSavingLetter] = useTransition();
  const [generatingLetter, startGeneratingLetter] = useTransition();

  const emailBodyRef = useRef<HTMLTextAreaElement>(null);
  const letterBodyRef = useRef<HTMLTextAreaElement>(null);

  const candidateName = profile.basics.name.trim() || "Your Name";

  // Active inputs depending on tab
  const currentSubject = activeTab === "email" ? emailSubject : letterSubject;
  const currentBody = activeTab === "email" ? emailBody : letterBody;
  const activeBodyRef = activeTab === "email" ? emailBodyRef : letterBodyRef;

  const resolvedSubject = resolveTemplateVariables(currentSubject, {
    company: previewCompany,
    role,
    name: candidateName,
    contactPerson: previewContact,
  });

  const resolvedBody = resolveTemplateVariables(currentBody, {
    company: previewCompany,
    role,
    name: candidateName,
    contactPerson: previewContact,
  });

  const emailWordCount = countWords(emailBody);
  const letterWordCount = countWords(letterBody);

  const handleSelectTrack = (track: OutreachTrack) => {
    setEmailTrack(track);
    const preset = EMAIL_TRACK_PRESETS[track];
    if (preset) {
      setEmailSubject(preset.subject);
      setEmailBody(preset.body);
      setRole(preset.role);
      toast(`Loaded ${preset.role} preset.`);
    }
  };

  const handleSave = () => {
    if (activeTab === "email") {
      startSavingEmail(async () => {
        const res = await saveBaseEmail({ subject: emailSubject, body: emailBody, track: emailTrack });
        toastResult(res);
      });
    } else {
      startSavingLetter(async () => {
        const res = await saveBaseCoverLetter({ subject: letterSubject, body: letterBody, role });
        toastResult(res);
      });
    }
  };

  const handleGenerate = () => {
    if (activeTab === "email") {
      startGeneratingEmail(async () => {
        const res = await generateBaseEmailAction({ track: emailTrack, role });
        if (!res.ok) {
          toast(res.error);
          return;
        }
        setEmailSubject(res.data.subject);
        setEmailBody(res.data.body);
        toast("Generated 80-word cold outreach email with AI.");
      });
    } else {
      startGeneratingLetter(async () => {
        const res = await generateBaseCoverLetterAction({ role });
        if (!res.ok) {
          toast(res.error);
          return;
        }
        setLetterSubject(res.data.subject);
        setLetterBody(res.data.body);
        toast("Generated portal cover letter with AI.");
      });
    }
  };

  const handleReset = () => {
    if (activeTab === "email") {
      const preset = EMAIL_TRACK_PRESETS[emailTrack];
      setEmailSubject(preset.subject);
      setEmailBody(preset.body);
      toast(`Reset to ${preset.role} preset.`);
    } else {
      setLetterSubject(DEFAULT_BASE_COVER_LETTER_SUBJECT);
      setLetterBody(DEFAULT_BASE_COVER_LETTER_BODY);
      toast("Reset cover letter to default template.");
    }
  };

  const insertVariable = (tag: string) => {
    const el = activeBodyRef.current;
    if (!el) {
      if (activeTab === "email") setEmailBody((prev) => `${prev} ${tag}`);
      else setLetterBody((prev) => `${prev} ${tag}`);
      return;
    }
    const targetStateSetter = activeTab === "email" ? setEmailBody : setLetterBody;
    const targetValue = activeTab === "email" ? emailBody : letterBody;

    if (document.activeElement !== el && targetValue.length > 0) {
      targetStateSetter(`${targetValue} ${tag}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const nextText = targetValue.substring(0, start) + tag + targetValue.substring(end);
    targetStateSetter(nextText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleCopyPreview = async () => {
    await navigator.clipboard.writeText(`${resolvedSubject}\n\n${resolvedBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Copied preview to clipboard.");
  };

  const isSaving = savingEmail || savingLetter;
  const isGenerating = generatingEmail || generatingLetter;

  return (
    <div className="flex flex-col min-h-full pb-16">
      <PageHeader
        title="Outreach Templates"
        description="Your universal email pitch and cover letter for company outreach. Direct outreach uses the 80-word email note with your Base Resume attached."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              title="Reset current tab to preset"
            >
              <RotateCcw size={14} className="mr-1" />
              Reset
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isGenerating}
              onClick={handleGenerate}
              title={activeTab === "email" ? "Polish cold outreach email with AI" : "Generate cover letter with AI"}
            >
              <Sparkles size={14} className={cn("mr-1 text-primary", isGenerating && "animate-spin")} />
              {isGenerating ? "Generating…" : "Generate with AI"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving…" : "Save template"}
            </Button>
          </div>
        }
      />

      <div className="px-6 lg:px-10 flex flex-col gap-6">
        {/* Tab Switcher */}
        <div className="flex border-b border-line gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("email")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "email"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Mail size={16} />
            <span>Cold Outreach Email</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Used in /outreach
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("letter")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "letter"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <FileText size={16} />
            <span>Portal Cover Letter</span>
            <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-medium text-muted">
              ATS portals only
            </span>
          </button>
        </div>

        {/* Tab 1: Cold Outreach Email */}
        {activeTab === "email" && (
          <div className="flex flex-col gap-4">
            {/* Track Switcher Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card/60 p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Role Track:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: "fullstack", label: "Full-Stack (Default)" },
                      { key: "frontend", label: "Frontend" },
                      { key: "backend", label: "Backend" },
                      { key: "mobile", label: "Mobile" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectTrack(key)}
                      className={cn(
                        "rounded-control px-3 py-1 text-xs font-medium transition-all cursor-pointer",
                        emailTrack === key
                          ? "bg-primary text-on-primary shadow-xs font-semibold"
                          : "bg-card border border-line text-muted hover:text-ink hover:border-primary/50",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Word Count Indicator with 6-Second Rule Feedback */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">6-Sec Rule:</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-control px-2.5 py-0.5 font-semibold text-xs border",
                    emailWordCount <= 90
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                      : emailWordCount <= 110
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
                  )}
                >
                  {emailWordCount} words {emailWordCount <= 90 ? "✓ (Optimal)" : emailWordCount <= 110 ? "⚠ (Slightly long)" : "✕ (Too long)"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid: Editor on Left, Live Simulated Preview on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Column: Template Editor */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="outreach-role" className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Target Role
                </label>
                <div className="relative">
                  <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="outreach-role"
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Full-Stack Engineer"
                    className="w-full rounded-control border border-line bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="outreach-subject" className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Subject Line Template
                </label>
                <input
                  id="outreach-subject"
                  type="text"
                  value={activeTab === "email" ? emailSubject : letterSubject}
                  onChange={(e) => {
                    if (activeTab === "email") setEmailSubject(e.target.value);
                    else setLetterSubject(e.target.value);
                  }}
                  placeholder={activeTab === "email" ? "full-stack / software engineering at {{company}}" : "Full-Stack Engineer application: {{role}} – {{name}}"}
                  className="w-full rounded-control border border-line bg-card py-2 px-3 text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm font-mono text-xs"
                />
              </div>
            </div>

            {/* Variable chips */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs font-medium text-muted">Insert dynamic placeholders:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "{{company}}", label: "Company", desc: "Target company name" },
                  { tag: "{{role}}", label: "Role", desc: "Job title" },
                  { tag: "{{name}}", label: "Candidate Name", desc: "Your name for sign-off" },
                  { tag: "{{contactPerson}}", label: "Recipient", desc: "Recipient name; falls back to 'Company team'" },
                ].map(({ tag, label, desc }) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertVariable(tag)}
                    title={desc}
                    className="inline-flex items-center gap-1 rounded-control bg-hover border border-line px-2.5 py-1 text-xs font-mono text-ink hover:border-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-primary">{tag}</span>
                    <span className="text-[11px] text-muted">({label})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Body Editor */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="outreach-body" className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {activeTab === "email" ? "Email Body (Template)" : "Letter Body (Template)"}
                </label>
                <span className="text-xs text-muted">
                  {activeTab === "email" ? emailWordCount : letterWordCount} words
                </span>
              </div>
              <textarea
                id="outreach-body"
                ref={activeBodyRef}
                rows={activeTab === "email" ? 12 : 18}
                value={activeTab === "email" ? emailBody : letterBody}
                onChange={(e) => {
                  if (activeTab === "email") setEmailBody(e.target.value);
                  else setLetterBody(e.target.value);
                }}
                className="w-full rounded-control border border-line bg-card p-4 text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm resize-y font-sans"
                placeholder={activeTab === "email" ? "Write or load an 80-word cold outreach email..." : "Write or generate your portal cover letter..."}
              />
            </div>
          </div>

          {/* Right Column: Live Preview */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Preview with:
                </span>
                <div className="relative">
                  <Building2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={previewCompany}
                    onChange={(e) => setPreviewCompany(e.target.value)}
                    placeholder="Company name"
                    className="rounded-control border border-line bg-card py-1 pl-7 pr-2.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyPreview}
                title="Copy preview text"
              >
                {copied ? <Check size={13} className="mr-1 text-green-600" /> : <Copy size={13} className="mr-1" />}
                {copied ? "Copied" : "Copy preview"}
              </Button>
            </div>

            {/* Simulated Email Envelope */}
            <div className="rounded-card border border-line bg-card p-6 shadow-sm flex flex-col gap-4">
              <div className="border-b border-line pb-3 flex flex-col gap-1.5 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <span className="w-20 font-medium text-ink">To:</span>
                  <span className="rounded bg-hover px-2 py-0.5 font-mono text-[11px] text-ink">
                    careers@{previewCompany.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.example
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-20 font-medium text-ink">Subject:</span>
                  <span className="font-semibold text-ink font-sans text-sm">{resolvedSubject}</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="w-20 font-medium text-ink">Attachment:</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                    <MailCheck size={12} />
                    {candidateName} – Base Resume.pdf
                    <span className="text-[10px] text-muted ml-1">(Single attachment · 6-sec rule)</span>
                  </span>
                </div>
              </div>

              {/* Resolved Body */}
              <div className="prose prose-sm max-w-none text-ink whitespace-pre-wrap leading-relaxed text-sm font-sans">
                {resolvedBody}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
