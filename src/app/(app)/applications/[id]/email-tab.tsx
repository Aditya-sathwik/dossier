"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { UnitRenderer } from "@/components/documents/document-page";
import { DownloadPdfButton } from "@/components/documents/download-pdf-button";
import { toast, toastResult } from "@/components/toast";
import { Button, buttonClassName } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Unit } from "@/lib/application-data";
import { emailParts, mailtoHref } from "@/lib/application-email";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/copy-text";

import { removeCustomResume, setResumeChoice, uploadCustomResume } from "./actions";
import { SendWithGmail, type GmailSender } from "./send-with-gmail";
import { aboutWords } from "./tabs";

/** The PDFs to attach, by their file names; null when the application doesn't have one. */
export type Attachments = {
  resume: string | null;
  baseResume?: string | null;
  customResume?: string | null;
  resumeChoice?: "tailored" | "base" | "custom";
  letter: string | null;
};

/**
 * The Email tab: the email to send the application with, to whoever the
 * posting says to send it to. Each part copies on its own for a mail app's
 * fields, or the whole email opens in the mail app, and the resume and cover
 * letter it mentions download right below it. Its parts are edited,
 * regenerated and refined like the documents' (`renderUnit`). Before it's
 * written, the tab offers to write it.
 */
export function EmailTab({
  applicationId,
  units,
  renderUnit,
  history,
  hint,
  notice,
  writing,
  onWrite,
  attachments,
  gmail,
}: {
  applicationId: string;
  /** The email's units; null until it's written. */
  units: Unit[] | null;
  renderUnit: UnitRenderer;
  /** The History button. */
  history: ReactNode;
  /** How to change it, while the current version is shown. */
  hint?: string;
  /** Above the email, e.g. the banner over an earlier version. */
  notice?: ReactNode;
  /** It's being written or rewritten. */
  writing: boolean;
  /** "Write the email" and "Rewrite". */
  onWrite: () => void;
  attachments: Attachments;
  /** Sending with Gmail (E15-2): who it sends from, and whether it went out that way before. */
  gmail?: { sender: GmailSender; sentBefore: boolean };
}) {
  const initialChoice: "tailored" | "base" | "custom" =
    attachments.resumeChoice && (attachments.resumeChoice !== "tailored" || attachments.resume)
      ? attachments.resumeChoice
      : attachments.resume
        ? "tailored"
        : attachments.baseResume
          ? "base"
          : "custom";

  const [choice, setChoice] = useState<"tailored" | "base" | "custom">(initialChoice);
  const [customResumeName, setCustomResumeName] = useState<string | null>(attachments.customResume ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (attachments.resumeChoice) {
      setChoice(attachments.resumeChoice);
    }
  }, [attachments.resumeChoice]);

  useEffect(() => {
    setCustomResumeName(attachments.customResume ?? null);
  }, [attachments.customResume]);

  if (!units) {
    return (
      <div className="flex flex-1 flex-col items-center overflow-auto bg-canvas px-10 pt-11 pb-16">
        <div className="flex w-full max-w-[560px] flex-col items-start gap-3 rounded-panel border border-line-card bg-card px-7 py-7">
          <h2 className="font-serif text-section">An email to send it with</h2>
          <p className="text-sm text-muted">
            I&apos;ll write a short email to go with your resume and cover letter, to whoever the posting says to send applications
            to. Copy it into your mail app or open it there, and attach the PDFs.
          </p>
          <Button className="mt-1" aria-disabled={writing || undefined} onClick={() => !writing && onWrite()}>
            {writing ? "Writing the email…" : "Write the email"}
          </Button>
        </div>
      </div>
    );
  }

  const { to, subject, body } = emailParts(units);
  const copy = async (text: string, what: string) =>
    toast((await copyText(text)) ? `Copied the ${what}.` : "That didn't copy. Select the text and copy it yourself.");

  const handleChoiceChange = async (newChoice: "tailored" | "base" | "custom") => {
    setChoice(newChoice);
    await setResumeChoice({ id: applicationId, choice: newChoice });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast("Please choose a PDF file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("PDF must be smaller than 10 MB.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const result = toastResult(
          await uploadCustomResume({
            id: applicationId,
            name: file.name,
            dataUrl,
          }),
        );
        if (result.ok) {
          setCustomResumeName(file.name);
          setChoice("custom");
        }
      } catch {
        toast("Failed to upload custom resume.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      setIsUploading(false);
      toast("Failed to read file.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustom = async () => {
    const result = toastResult(await removeCustomResume({ id: applicationId }));
    if (result.ok) {
      setCustomResumeName(null);
      setChoice(attachments.resume ? "tailored" : "base");
    }
  };

  const resumeOptions: { value: "tailored" | "base" | "custom"; label: string }[] = [
    ...(attachments.resume ? [{ value: "tailored" as const, label: "Tailored" }] : []),
    ...(attachments.baseResume ? [{ value: "base" as const, label: "Base" }] : []),
    { value: "custom" as const, label: "Custom" },
  ];

  const activeResumeName =
    choice === "base"
      ? attachments.baseResume
      : choice === "custom"
        ? customResumeName
        : attachments.resume;

  const activeAttachments = [activeResumeName, attachments.letter].filter((name): name is string => Boolean(name));

  return (
    <div className="flex flex-1 flex-col items-center gap-4 overflow-auto bg-canvas px-10 pt-11 pb-16">
      <div className="flex w-full max-w-[680px] flex-wrap items-center justify-between gap-x-3 gap-y-1 text-meta text-muted">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Email · {aboutWords([body])}</span>
          {history}
        </span>
        {hint && <span>{hint}</span>}
      </div>
      {notice && <div className="w-full max-w-[680px]">{notice}</div>}

      <article
        aria-label="Email"
        aria-busy={writing || undefined}
        // The parts' highlight and toolbar are measured in page units, which are pixels here.
        style={{ "--u": "1px" } as CSSProperties}
        className={cn("w-full max-w-[680px] rounded-panel border border-line-card bg-card motion-safe:transition-opacity", writing && "opacity-50")}
      >
        <Field label="To" onCopy={to ? () => void copy(to, "recipient") : undefined}>
          {renderUnit({
            id: "to",
            children: to || <span className="text-muted">The posting doesn&apos;t give an address. Edit to add one.</span>,
          })}
        </Field>
        <Field label="Subject" onCopy={subject ? () => void copy(subject, "subject") : undefined}>
          {renderUnit({ id: "subject", children: subject })}
        </Field>
        <div className="px-7 pt-6 pb-7">
          {renderUnit({ id: "body", className: "text-field leading-[1.6] break-words whitespace-pre-wrap", children: body })}
        </div>

        {(attachments.resume || attachments.baseResume || attachments.letter || customResumeName) && (
          <div className="flex flex-col gap-3 border-t border-line px-7 pt-4 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-meta text-muted">Attach</h3>
              {resumeOptions.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-meta text-muted">Resume:</span>
                  <SegmentedControl
                    size="sm"
                    aria-label="Resume attachment"
                    value={choice}
                    onValueChange={(val) => void handleChoiceChange(val as "tailored" | "base" | "custom")}
                    options={resumeOptions}
                  />
                </div>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {choice === "tailored" && attachments.resume && (
                <Attachment name={attachments.resume} href={`/api/pdf?doc=resume&application=${applicationId}`} what="tailored resume" />
              )}
              {choice === "base" && attachments.baseResume && (
                <Attachment name={attachments.baseResume} href="/api/pdf?doc=base" what="base resume" />
              )}
              {choice === "custom" && customResumeName && (
                <Attachment
                  name={customResumeName}
                  href={`/api/pdf?doc=custom&application=${applicationId}`}
                  what="custom resume"
                  onReplace={() => fileInputRef.current?.click()}
                  onRemove={() => void handleRemoveCustom()}
                />
              )}
              {choice === "custom" && !customResumeName && (
                <li
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-control border border-dashed border-line-card bg-input/40 py-5 px-4 text-center cursor-pointer hover:bg-input transition-colors"
                >
                  <p className="text-sm text-muted">Upload an existing resume PDF to attach with this application.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-disabled={isUploading || undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    {isUploading ? "Uploading…" : "Upload PDF resume"}
                  </Button>
                </li>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                aria-label="Upload custom resume"
                onChange={handleFileChange}
              />
              {attachments.letter && (
                <Attachment name={attachments.letter} href={`/api/pdf?doc=letter&application=${applicationId}`} what="cover letter" />
              )}
            </ul>
          </div>
        )}
      </article>

      <div className="flex w-full max-w-[680px] flex-wrap items-center gap-3">
        {gmail && (
          <SendWithGmail
            applicationId={applicationId}
            sender={gmail.sender}
            to={to}
            subject={subject}
            attachments={activeAttachments}
            sentBefore={gmail.sentBefore}
          />
        )}
        <Button variant={gmail?.sender.from ? "secondary" : "primary"} onClick={() => void copy(body, "message")}>
          Copy message
        </Button>
        {/* Mail apps can't take attachments from a link: the PDFs are attached by hand. */}
        <a href={mailtoHref({ to, subject, body })} className={buttonClassName("secondary", "md")}>
          Open in mail app
        </a>
        <Button variant="text" className="ml-auto" aria-disabled={writing || undefined} onClick={() => !writing && onWrite()}>
          {writing ? "Rewriting…" : "Rewrite"}
        </Button>
      </div>
    </div>
  );
}

/** A header line of the email, "To" or "Subject", with its Copy button. */
function Field({ label, onCopy, children }: { label: string; onCopy?: () => void; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-line px-7 py-3.5">
      <span className="w-14 shrink-0 text-meta text-muted">{label}</span>
      <div className="min-w-0 flex-1 text-field break-words">{children}</div>
      {onCopy && (
        <Button variant="text" size="sm" className="py-0!" aria-label={`Copy the ${label === "To" ? "recipient" : label.toLowerCase()}`} onClick={onCopy}>
          Copy
        </Button>
      )}
    </div>
  );
}

/** A PDF to attach, with its download. */
function Attachment({
  name,
  href,
  what,
  onReplace,
  onRemove,
}: {
  name: string;
  href: string;
  what: string;
  onReplace?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-line-card bg-input py-2 pr-2 pl-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="rounded-[5px] bg-danger-surface px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-danger">
          PDF
        </span>
        <span className="truncate text-control">{name}</span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <DownloadPdfButton variant="secondary" size="sm" href={href} progress={`Rendering your ${what} as a PDF…`}>
          Download <span className="sr-only">{name}</span>
        </DownloadPdfButton>
        {onReplace && (
          <Button variant="secondary" size="sm" onClick={onReplace}>
            Replace
          </Button>
        )}
        {onRemove && (
          <Button variant="danger-text" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}
