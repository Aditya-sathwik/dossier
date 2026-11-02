"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { PageHeader } from "@/components/page-header";
import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import type { Tone } from "@/generated/prisma/enums";
import { useJob } from "@/hooks/use-job";
import { withSkillAdded, type Extracted } from "@/lib/application-data";
import { cancel, retry } from "@/lib/jobs/actions";
import { READ_POSTING_STEPS, WRITE_DOCUMENTS_STEPS, writeDocumentsSteps } from "@/lib/jobs/application-steps";
import { AgentProgressConsole, type AgentComment, type AgentProgressStep } from "@/components/agent-progress-console";
import type { ReadPostingResult } from "@/lib/jobs/read-posting";
import type { WriteDocumentsResult } from "@/lib/jobs/write-documents";

import { openPendingTab, sendPendingTab } from "@/lib/claude-tab";

import { addSkill } from "../profile/actions";

import { createApplication, fetchPostingText, handOffToClaude, startReadingPosting, startWritingDocuments } from "./actions";
import { DetailsCard } from "./details-card";
import { createDraftStore } from "./draft-store";
import { MatchCard } from "./match-card";
import { TailoringCard } from "./tailoring-card";
import { JobProgress, jobStep } from "./job-progress";

const STEPS = ["Paste the posting", "Check the details", "Tailored documents"] as const;

/** The editable details of "The application" (NEW-3). */
export type Details = {
  title: string;
  company: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  /** YYYY-MM-DD or empty. */
  deadline: string;
};

/** Everything the flow knows so far; nothing reaches the server as an application until the end. */
export type Draft = {
  step: "paste" | "reading" | "review" | "creating";
  posting: string;
  postingUrl: string;
  readJobId: string | null;
  /** The posting text that was read, so going back and on again doesn't read it twice. */
  readFor: string | null;
  read: ReadPostingResult | null;
  details: Details;
  tone: Tone;
  note: string;
  writeJobId: string | null;
  /** The Find jobs posting it was started from (E14-8); missing in drafts from before. */
  postingId?: string | null;
  /** The startup it was started from with "Write to them" (#222). */
  startupId?: string | null;
};

/** A posting handed over by "Start application" on Find jobs (E14-8), or by "Write to them" on Startups (#222). */
export type FromPosting = {
  /** The Find jobs posting; null for a startup. */
  id: string | null;
  /** The startup and its name, from Startups. */
  startup?: { id: string; company: string };
  text: string;
  url: string;
  /** False when only the start of the posting came through. */
  complete: boolean;
};

export function detailsFrom(extracted: Extracted): Details {
  return {
    title: extracted.title ?? "",
    company: extracted.company ?? "",
    role: extracted.role ?? "",
    location: extracted.location ?? "",
    mode: extracted.mode ?? "",
    salary: extracted.salary ?? "",
    deadline: extracted.deadline ?? "",
  };
}

const EMPTY_DETAILS: Details = { title: "", company: "", role: "", location: "", mode: "", salary: "", deadline: "" };

// One draft per tab, in sessionStorage (E7-7); none while rendering on the server.
const draftStore = typeof window === "undefined" ? null : createDraftStore<Draft>();
const noStore = () => () => {};

const LEAVE_WARNING = "Leave now? I'll stop working on this application, and nothing will be created.";

/**
 * While `active`, leaving the page asks first (E7-7): the browser's own
 * prompt for closing or reloading, a confirm for links inside the app. A
 * confirmed in-app leave calls `onLeave`.
 */
function useLeaveGuard(active: boolean, onLeave: () => void) {
  const leave = useRef(onLeave);
  useLayoutEffect(() => {
    leave.current = onLeave;
  });
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      if (!window.confirm(LEAVE_WARNING)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      leave.current();
    };
    window.addEventListener("beforeunload", beforeUnload);
    // Capture, so it runs before Next.js' own link handling.
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [active]);
}

export type NewApplicationProps = {
  /** Whether an AI provider is set up; without one, the page points to Settings. */
  aiReady: boolean;
  /** The Claude connector is on and Dossier has no usable AI model: a Claude chat writes it instead (#221). */
  writeInClaude?: boolean;
  /** Offered through "Use a sample posting" before the first application. */
  samplePosting: string | null;
  /** Settings → default cover letter tone (SET-6). */
  defaultTone: Tone;
  /** "+ New application": start over, whatever the tab kept. */
  fresh?: boolean;
  /** "Start application" on Find jobs: start over from this posting. */
  fromPosting?: FromPosting | null;
  /** Format of resume (standard | latex). */
  resumeFormat?: "standard" | "latex";
  /** Base LaTeX resume template if configured. */
  baseResumeLatex?: string;
};

/** The new application flow (E7): paste → read → review → create. */
export function NewApplication({
  aiReady,
  writeInClaude = false,
  samplePosting,
  defaultTone,
  fresh = false,
  fromPosting = null,
  resumeFormat = "standard",
  baseResumeLatex = "",
}: NewApplicationProps) {
  const [initial] = useState<Draft>(() => ({
    step: "paste",
    posting: "",
    postingUrl: "",
    readJobId: null,
    readFor: null,
    read: null,
    details: EMPTY_DETAILS,
    tone: defaultTone,
    note: "",
    writeJobId: null,
    postingId: null,
  }));
  // The server renders a fresh draft; the tab's own draft takes over once the page is live.
  const stored = useSyncExternalStore(draftStore?.subscribe ?? noStore, () => draftStore?.get() ?? null, () => null);
  const draft = stored ?? initial;
  // Set when a change here moves to another step; the tab's draft taking over on load doesn't count.
  const stepChanged = useRef(false);
  const setDraft = (next: (current: Draft) => Draft) => {
    const current = draftStore?.get() ?? initial;
    const updated = next(current);
    if (updated.step !== current.step) stepChanged.current = true;
    draftStore?.set(updated);
  };
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const router = useRouter();
  useEffect(() => {
    if (!fresh) return;
    draftStore?.clear();
    router.replace("/new");
  }, [fresh, router]);
  // E14-8: a posting from Find jobs replaces the tab's draft, as "+ New
  // application" would, at the paste step, to check before reading it.
  useEffect(() => {
    if (!fromPosting) return;
    draftStore?.set({ ...initial, posting: fromPosting.text, postingUrl: fromPosting.url, postingId: fromPosting.id, startupId: fromPosting.startup?.id ?? null });
    toast(
      fromPosting.startup
        ? `Here's what Startups knows about ${fromPosting.startup.company}, without its addresses. Add the role you're after if it doesn't say, then read it.`
        : fromPosting.complete
          ? "Here's the posting from Find jobs. Check it, then read it."
          : "Only the start of this posting came through. Paste the rest from the posting's page, then read it.",
    );
    router.replace("/new");
  }, [fromPosting, initial, router]);
  const [starting, setStarting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [readRevision, setReadRevision] = useState(0);

  // E11-3: a new step replaces the controls of the last one, so focus moves to
  // its heading (or the posting field) instead of getting lost.
  const stepArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    stepArea.current?.querySelector<HTMLElement>("h2[tabindex], textarea")?.focus();
  }, [draft.step]);

  // Reading ends on its own; move on to the review with what it found (E7-2).
  const readJob = useJob<ReadPostingResult>(draft.readJobId, readRevision, (job) => {
    if (job.status !== "DONE" || !job.result) return;
    const read = job.result;
    setDraft((current) => {
      if (current.step !== "reading" || current.readJobId !== job.id) return current;
      // Preserve existing comments on matching requirements if re-reading
      const existingComments = new Map(
        current.read?.match.items
          .filter((item) => item.comment)
          .map((item) => [item.requirement, item.comment as string]) ?? [],
      );
      const items = existingComments.size > 0
        ? read.match.items.map((item) =>
            existingComments.has(item.requirement)
              ? { ...item, comment: existingComments.get(item.requirement) }
              : item,
          )
        : read.match.items;
      return {
        ...current,
        step: "review",
        read: { ...read, match: { ...read.match, items } },
        details: detailsFrom(read.extracted),
      };
    });
  });

  const read = async () => {
    if (!draft.posting.trim()) {
      toast(samplePosting ? "Paste a job posting first, or try the sample." : "Paste a job posting first.");
      return;
    }
    // Back and on again with the same posting: keep what was read and edited.
    if (draft.read && draft.readFor === draft.posting.trim()) {
      update({ step: "review" });
      return;
    }
    setStarting(true);
    const result = toastResult(await startReadingPosting({ posting: draft.posting }));
    setStarting(false);
    if (result.ok) update({ step: "reading", readJobId: result.data, readFor: draft.posting.trim(), read: draft.read });
  };

  // #221: Claude chat writes it on the user's own Claude plan, through the
  // connector, and saves it here as a Draft application.
  const writeWithClaude = async () => {
    if (!draft.posting.trim()) return toast("Paste a job posting first.");
    // Opened now, while the click still counts: a tab opened after waiting is blocked as a pop-up.
    const chat = openPendingTab();
    setStarting(true);
    const result = toastResult(await handOffToClaude({ posting: draft.posting, postingUrl: draft.postingUrl }));
    setStarting(false);
    if (!result.ok) return void chat?.close();
    sendPendingTab(chat, result.data.url);
    toast("Writing it in Claude. It shows up under Applications as a Draft once Claude has saved it.");
  };

  // E7-8: the posting's text from its link, to check before reading it.
  const fetchFromLink = async () => {
    if (!draft.postingUrl.trim()) return toast("Enter the link to the posting first.");
    setFetching(true);
    const result = toastResult(await fetchPostingText({ link: draft.postingUrl }));
    setFetching(false);
    if (!result.ok) return;
    const previous = draft.posting;
    update({ posting: result.data.text });
    const site = new URL(result.data.url).hostname.replace(/^www\./, "");
    toast(
      `Fetched the posting from ${site}. Check it before reading it.`,
      previous.trim() ? { action: { label: "Undo", onClick: () => update({ posting: previous }) } } : {},
    );
  };

  // NEW-5: a missing skill goes into the profile, and the row becomes partly covered.
  const addToProfile = async (index: number, skill: string) => {
    const result = toastResult(await addSkill({ name: skill }));
    if (!result.ok) return;
    const name = result.data.skill.name;
    setDraft((current) => {
      if (!current.read) return current;
      const items = current.read.match.items.map((item, position) => (position === index ? withSkillAdded(item, name) : item));
      return { ...current, read: { ...current.read, match: { ...current.read.match, items } } };
    });
    toast(`Added “${name}” to your skills. Attach it to a role under Experience to make it count.`);
  };

  const updateComment = (index: number, requirement: string, comment?: string) => {
    setDraft((current) => {
      if (!current.read) return current;
      const items = current.read.match.items.map((item, i) =>
        i === index && item.requirement === requirement
          ? { ...item, comment: comment?.trim() || undefined }
          : item,
      );
      return { ...current, read: { ...current.read, match: { ...current.read.match, items } } };
    });
  };

  // E7-6: write the documents, then create the application from them.
  const [writeRevision, setWriteRevision] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);

  const save = async (writeJobId: string) => {
    if (saving.current) return;
    saving.current = true;
    setSaveError(null);
    const result = await createApplication({
      writeJobId,
      details: draft.details,
      postingUrl: draft.postingUrl,
      postingId: draft.postingId ?? null,
      startupId: draft.startupId ?? null,
    });
    saving.current = false;
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    toast("Your application is ready. Nothing gets sent until you say so.");
    draftStore?.clear();
    router.push(`/applications/${result.data}`);
  };

  const isLatex = resumeFormat === "latex" && !!baseResumeLatex;
  const hasComments = Boolean(draft.read?.match.items.some((i) => i.comment) || draft.note.trim());
  const creatingSteps = useMemo(
    () => writeDocumentsSteps({ hasComments, latex: isLatex }),
    [hasComments, isLatex],
  );

  const writeJob = useJob<WriteDocumentsResult>(draft.writeJobId, writeRevision, (job) => {
    // If not LaTeX or no diff to inspect, save immediately as before
    if (job.status === "DONE" && job.id === draft.writeJobId) {
      if (!isLatex) {
        void save(job.id);
      }
    }
  });

  const commentsForConsole: AgentComment[] = useMemo(() => {
    const list: AgentComment[] = [];
    if (draft.read?.match.items) {
      for (const item of draft.read.match.items) {
        if (item.comment?.trim()) {
          list.push({
            id: item.requirement,
            label: item.requirement,
            text: item.comment.trim(),
          });
        }
      }
    }
    if (draft.note.trim()) {
      list.push({
        id: "general-note",
        label: "General tailoring note",
        text: draft.note.trim(),
      });
    }
    return list;
  }, [draft.read?.match.items, draft.note]);

  const consoleSteps: AgentProgressStep[] = useMemo(() => {
    const activeIndex = writeJob?.status === "DONE" ? creatingSteps.length : jobStep(creatingSteps, writeJob);
    return creatingSteps.map((name, index) => {
      let status: AgentProgressStep["status"] = "pending";
      if (writeJob?.status === "FAILED" && index === activeIndex) {
        status = "error";
      } else if (index < activeIndex || writeJob?.status === "DONE") {
        status = "done";
      } else if (index === activeIndex && writeJob?.status === "RUNNING") {
        status = "running";
      }
      return { name, status };
    });
  }, [creatingSteps, writeJob]);

  const create = async () => {
    if (!draft.read || !draft.readJobId || starting) return;
    setStarting(true);
    const result = toastResult(
      await startWritingDocuments({ readJobId: draft.readJobId, details: draft.details, match: draft.read.match, tone: draft.tone, note: draft.note }),
    );
    setStarting(false);
    if (!result.ok) return;
    setSaveError(null);
    update({ step: "creating", writeJobId: result.data });
  };

  // Leaving while the AI works stops it; nothing gets created either way.
  const working =
    (draft.step === "reading" && readJob?.status !== "DONE" && readJob?.status !== "FAILED") ||
    (draft.step === "creating" && writeJob?.status !== "FAILED" && !saveError);
  useLeaveGuard(working, () => {
    const id = draft.step === "reading" ? draft.readJobId : draft.writeJobId;
    if (id) void cancel({ id });
  });

  const retryCreating = async () => {
    if (!draft.writeJobId) return;
    if (writeJob?.status === "DONE") return save(draft.writeJobId);
    if (toastResult(await retry({ id: draft.writeJobId })).ok) setWriteRevision((count) => count + 1);
  };

  const retryReading = async () => {
    if (!draft.readJobId) return;
    if (toastResult(await retry({ id: draft.readJobId })).ok) setReadRevision((count) => count + 1);
  };

  return (
    <>
      <PageHeader
        title="New application"
        description="Paste a job posting. I'll pull out the details, check it against your profile, and draft a tailored resume and cover letter."
      />
      <div className="flex max-w-[816px] flex-col gap-6 px-10 pb-20">
        <Stepper
          steps={STEPS}
          current={draft.step === "creating" ? 2 : draft.step === "review" ? 1 : 0}
          aria-label="New application steps"
        />

        <div ref={stepArea} className="contents">
          {draft.step === "paste" && (
            <>
              {writeInClaude ? (
                <p role="note" className="rounded-card border border-line-card bg-card px-4 py-3 text-meta text-muted">
                  Dossier has no AI model of its own, so Claude writes this one: <strong className="text-ink">Write it with Claude</strong> opens a
                  chat in Claude that uses your Claude plan and the Dossier connector, and saves the resume and cover letter here as a Draft. To
                  have Dossier write it instead,{" "}
                  <Link href="/settings?section=ai" className="font-medium text-ink underline underline-offset-2">
                    choose a model in Settings → AI provider
                  </Link>
                  .
                </p>
              ) : !aiReady && (
                <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning">
                  No AI provider is set up yet, so nothing can read the posting.{" "}
                  <Link href="/settings?section=ai" className="font-medium text-warning underline underline-offset-2">
                    Choose one in Settings → AI provider
                  </Link>
                </p>
              )}
              <Card className="flex flex-col gap-5">
                <Textarea
                  label="Job posting"
                  rows={14}
                  placeholder="Paste the full posting here: title, company, requirements, the lot."
                  value={draft.posting}
                  onChange={(event) => update({ posting: event.target.value })}
                />
                <div className="flex flex-col gap-2">
                  <div className="flex items-end gap-3">
                    <Input
                      className="flex-1"
                      label={
                        <>
                          Link to the posting <span className="text-muted">(optional, saved with the application)</span>
                        </>
                      }
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={draft.postingUrl}
                      onChange={(event) => update({ postingUrl: event.target.value })}
                    />
                    <Button
                      variant="secondary"
                      className="mb-px"
                      aria-disabled={fetching || undefined}
                      onClick={() => void (fetching ? undefined : fetchFromLink())}
                    >
                      {fetching ? "Fetching…" : "Fetch"}
                    </Button>
                  </div>
                  <p className="text-meta text-muted">
                    Fetch asks the job site for the page from your server, so it needs internet access. Check what it brings before reading it.
                  </p>
                </div>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {samplePosting ? (
                  <Button variant="text" className="underline underline-offset-[3px]" onClick={() => update({ posting: samplePosting })}>
                    Use a sample posting
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  aria-disabled={!draft.posting.trim() || starting || undefined}
                  onClick={() => void (starting ? undefined : writeInClaude ? writeWithClaude() : read())}
                >
                  {writeInClaude ? "Write it with Claude →" : "Read the posting →"}
                </Button>
              </div>
            </>
          )}

          {draft.step === "reading" && (
            <JobProgress
              title="Reading the posting…"
              steps={READ_POSTING_STEPS}
              current={jobStep(READ_POSTING_STEPS, readJob)}
              error={readJob?.status === "FAILED" ? readJob.error : null}
              onRetry={() => void retryReading()}
              onBack={() => update({ step: "paste" })}
            />
          )}

          {draft.step === "review" && draft.read && (
            <>
              <DetailsCard details={draft.details} onChange={(details) => update({ details })} />
              <MatchCard
                match={draft.read.match}
                requirements={draft.read.extracted.requirements}
                onAddSkill={(index, skill) => void addToProfile(index, skill)}
                onCommentChange={updateComment}
              />
              <TailoringCard tone={draft.tone} note={draft.note} onTone={(tone) => update({ tone })} onNote={(note) => update({ note })} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="text" onClick={() => update({ step: "paste" })}>
                  ← Back to the posting
                </Button>
                <Button aria-disabled={starting || undefined} onClick={() => void create()}>
                  Create application →
                </Button>
              </div>
            </>
          )}

          {draft.step === "creating" && (
            <div className="flex flex-col gap-6">
              <JobProgress
                title="Putting your application together…"
                steps={creatingSteps}
                // "Saving the application" is the last step, once the documents are written.
                current={writeJob?.status === "DONE" ? creatingSteps.length - 1 : jobStep(creatingSteps, writeJob)}
                error={writeJob?.status === "FAILED" ? writeJob.error : saveError}
                onRetry={() => void retryCreating()}
                onBack={() => update({ step: "review" })}
                backLabel="← Back to the details"
              />
              <AgentProgressConsole
                title="Application Tailoring Console"
                agentName="Tailor Agent"
                steps={consoleSteps}
                comments={commentsForConsole}
                originalCode={writeJob?.result?.baseLatex ?? (isLatex ? baseResumeLatex : null)}
                updatedCode={writeJob?.result?.latex ?? null}
                latexStatus={writeJob?.result?.latexStatus ?? "none"}
                latexError={writeJob?.result?.latexError ?? null}
                isDone={writeJob?.status === "DONE"}
                onCompleteAction={() => {
                  if (draft.writeJobId) void save(draft.writeJobId);
                }}
                completeActionLabel="View application →"
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
