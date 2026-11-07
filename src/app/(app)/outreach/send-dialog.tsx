"use client";

import { AlertDialog } from "radix-ui";
import { AlertCircle, CheckCircle2, FileText, Loader2, Pause, Play, StopCircle, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { interpolateTemplate } from "@/lib/outreach/template";

import { prepareResumeAttachmentAction, sendOutreachEmailAction } from "./actions";

export type OutreachTarget = {
  id?: string;
  company: string;
  email: string;
  contactPerson?: string;
  role?: string;
};

export type SendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContacts: OutreachTarget[];
  senderEmail: string | null;
  canSend: boolean;
  baseSubject: string;
  baseBody: string;
  profileName: string;
  onFinished: () => void;
};

type SendLog = {
  company: string;
  email: string;
  status: "success" | "error";
  message?: string;
};

export function SendDialog({
  open,
  onOpenChange,
  selectedContacts,
  senderEmail,
  canSend,
  baseSubject,
  baseBody,
  profileName,
  onFinished,
}: SendDialogProps) {
  const [step, setStep] = useState<"review" | "sending" | "complete">("review");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [resumeData, setResumeData] = useState<{ fileName: string; contentType: string; base64: string } | null>(null);

  const stoppedRef = useRef(false);
  const cancelTimerRef = useRef<(() => void) | null>(null);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      cancelTimerRef.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  // Pre-load resume attachment once when opening review
  useEffect(() => {
    if (open) {
      setStep("review");
      setCurrentIndex(0);
      setLogs([]);
      stoppedRef.current = false;

      setIsCompiling(true);
      prepareResumeAttachmentAction({})
        .then((res) => {
          if (res.ok) {
            setResumeData(res.data);
          } else {
            toast(res.error || "Failed to load base resume PDF.");
          }
        })
        .catch(() => {
          toast("Failed to compile base resume attachment.");
        })
        .finally(() => {
          setIsCompiling(false);
        });
    } else {
      setResumeData(null);
    }
  }, [open]);

  const firstContact = selectedContacts[0] || {
    company: "Acme Corp",
    email: "careers@acme.com",
    contactPerson: "Hiring Manager",
    role: "Software Engineer",
  };

  const sampleSubject = interpolateTemplate(baseSubject || "full-stack / software engineering at {{company}}", {
    company: firstContact.company,
    role: firstContact.role,
    contactPerson: firstContact.contactPerson,
    myName: profileName,
  });

  const sampleBody = interpolateTemplate(baseBody || "", {
    company: firstContact.company,
    role: firstContact.role,
    contactPerson: firstContact.contactPerson,
    myName: profileName,
  });

  const handleStartSending = async () => {
    if (!canSend || !senderEmail) {
      toast("Connect your Google account with Gmail sending permission first.");
      return;
    }
    if (!resumeData) {
      toast("Base resume PDF is still compiling. Please wait a moment.");
      return;
    }

    setStep("sending");
    setCurrentIndex(0);
    setLogs([]);
    stoppedRef.current = false;

    const currentLogs: SendLog[] = [];

    for (let i = 0; i < selectedContacts.length; i++) {
      if (stoppedRef.current) break;

      setCurrentIndex(i);
      const contact = selectedContacts[i];

      try {
        const res = await sendOutreachEmailAction({
          contactId: contact.id,
          company: contact.company,
          email: contact.email,
          role: contact.role,
          contactPerson: contact.contactPerson,
          resumeAttachment: resumeData,
        });

        if (res.ok) {
          const entry: SendLog = {
            company: contact.company || "Company",
            email: contact.email,
            status: "success",
            message: "Dispatched & tracked",
          };
          currentLogs.push(entry);
          setLogs([...currentLogs]);
        } else {
          const entry: SendLog = {
            company: contact.company || "Company",
            email: contact.email,
            status: "error",
            message: res.error || "Sending failed",
          };
          currentLogs.push(entry);
          setLogs([...currentLogs]);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unexpected error";
        const entry: SendLog = {
          company: contact.company || "Company",
          email: contact.email,
          status: "error",
          message: errorMsg,
        };
        currentLogs.push(entry);
        setLogs([...currentLogs]);
      }

      // Safe pacing delay of 2.5s between emails to protect account reputation
      if (i < selectedContacts.length - 1 && !stoppedRef.current) {
        await sleep(2500);
      }
    }

    setStep("complete");
    onFinished();
  };

  const handleStop = () => {
    stoppedRef.current = true;
    cancelTimerRef.current?.();
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const failureCount = logs.filter((l) => l.status === "error").length;
  const total = selectedContacts.length;
  const progressPercent = total > 0 ? Math.round(((currentIndex + (step === "complete" ? 1 : 0)) / total) * 100) : 0;

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(620px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-dialog border border-line-popover bg-card p-6 shadow-menu">
          {step === "review" && (
            <>
              <div>
                <AlertDialog.Title className="font-serif text-[22px] leading-tight">
                  Review & Dispatch Outreach
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-sm text-muted">
                  Verify the campaign details below. Each recipient receives a personalized email with your Base Resume attached.
                </AlertDialog.Description>
              </div>

              <div className="flex flex-col gap-3 rounded-control border border-line bg-muted/10 p-4 text-sm">
                <div className="grid grid-cols-[80px_1fr] items-center gap-2">
                  <span className="font-medium text-muted">Sender</span>
                  <span className="font-mono text-ink">{senderEmail || "Not connected"}</span>

                  <span className="font-medium text-muted">Recipients</span>
                  <span className="font-semibold text-ink">
                    {selectedContacts.length} {selectedContacts.length === 1 ? "company" : "companies"}
                  </span>

                  <span className="font-medium text-muted">Attachment</span>
                  <span className="inline-flex items-center gap-1.5 text-ink">
                    <FileText className="size-4 text-muted" />
                    {isCompiling ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Loader2 className="size-3 animate-spin" /> Compiling Base Resume PDF…
                      </span>
                    ) : (
                      <span className="font-mono">{resumeData?.fileName || "Base Resume.pdf"}</span>
                    )}
                  </span>
                </div>

                <div className="mt-2 border-t border-line/50 pt-2">
                  <div className="text-xs font-semibold tracking-wide text-muted uppercase">Sample Subject (Preview)</div>
                  <div className="mt-0.5 font-medium text-ink [overflow-wrap:anywhere]">{sampleSubject}</div>

                  <div className="mt-2 text-xs font-semibold tracking-wide text-muted uppercase">Sample Message Body</div>
                  <div className="mt-0.5 line-clamp-4 text-xs whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">
                    {sampleBody || "No body defined yet."}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-control bg-primary/10 p-3 text-xs text-primary-text">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <span className="font-semibold">Safe Pacing Protection:</span> Emails are sent through your connected Gmail account with a 2.5-second delay between recipients to prevent spam triggers and maintain optimal inbox deliverability.
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <AlertDialog.Cancel className={buttonClassName("secondary", "sm")}>
                  Cancel
                </AlertDialog.Cancel>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canSend || selectedContacts.length === 0 || isCompiling || !resumeData}
                  onClick={handleStartSending}
                >
                  Start Batch Send ({selectedContacts.length})
                </Button>
              </div>
            </>
          )}

          {step === "sending" && (
            <>
              <div>
                <AlertDialog.Title className="font-serif text-[22px] leading-tight">
                  Sending Cold Outreach
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-sm text-muted">
                  Dispatching emails with safe pacing. Please keep this tab open.
                </AlertDialog.Description>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-medium text-muted">
                  <span>
                    Progress: {currentIndex + 1} of {total} ({Math.min(progressPercent, 100)}%)
                  </span>
                  <span>
                    {successCount} sent · {failureCount} failed
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>
                    Sending to <strong className="font-semibold">{selectedContacts[currentIndex]?.company}</strong> ({selectedContacts[currentIndex]?.email})…
                  </span>
                </div>
              </div>

              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-control border border-line bg-card p-3 text-xs">
                {logs.length === 0 && <div className="text-muted">Initiating batch…</div>}
                {logs.map((log, index) => (
                  <div key={index} className="flex items-center justify-between gap-2 border-b border-line/40 pb-1 last:border-0 last:pb-0">
                    <span className="flex items-center gap-1.5">
                      {log.status === "success" ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0 text-danger" />
                      )}
                      <strong className="text-ink">{log.company}</strong>
                      <span className="font-mono text-muted">({log.email})</span>
                    </span>
                    <span className={log.status === "success" ? "text-success font-medium" : "text-danger"}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Button variant="danger-outline" size="sm" onClick={handleStop}>
                  <StopCircle className="size-4" /> Stop Sending
                </Button>
              </div>
            </>
          )}

          {step === "complete" && (
            <>
              <div>
                <AlertDialog.Title className="font-serif text-[22px] leading-tight">
                  Outreach Batch Complete
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-sm text-muted">
                  Batch finished. All sent emails have been recorded and synced with Dossier Inbox.
                </AlertDialog.Description>
              </div>

              <div className="flex flex-col gap-3 rounded-control border border-line p-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-success" />
                  <span className="font-semibold text-ink">
                    Successfully sent {successCount} {successCount === 1 ? "email" : "emails"}.
                  </span>
                </div>
                {failureCount > 0 && (
                  <div className="flex items-center gap-2 text-danger">
                    <XCircle className="size-5" />
                    <span>{failureCount} emails failed to send.</span>
                  </div>
                )}
                {stoppedRef.current && (
                  <div className="text-xs text-muted">
                    Batch was stopped before finishing all recipients.
                  </div>
                )}
              </div>

              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-control border border-line bg-card p-3 text-xs">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      {log.status === "success" ? (
                        <CheckCircle2 className="size-3.5 text-success" />
                      ) : (
                        <XCircle className="size-3.5 text-danger" />
                      )}
                      <span className="font-medium text-ink">{log.company}</span>
                      <span className="text-muted">({log.email})</span>
                    </span>
                    <span className={log.status === "success" ? "text-muted" : "text-danger"}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onFinished();
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
