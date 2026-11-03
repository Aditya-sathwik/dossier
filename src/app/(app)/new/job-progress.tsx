"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressSteps } from "@/components/ui/progress-steps";
import type { JobView } from "@/lib/jobs/runner";

/** The step a job is on: its own last-named step, or past the end once it's done. */
export function jobStep(steps: readonly string[], job: Pick<JobView, "status" | "step"> | null): number {
  if (job?.status === "DONE") return steps.length;
  return Math.max(0, steps.indexOf(job?.step ?? ""));
}

/**
 * Named steps of the work in progress (NEW-2, NEW-7), advanced by the job
 * itself, with a real percentage progress bar, plain-language error, Retry and a way back.
 */
export function JobProgress({
  title,
  steps,
  current,
  error,
  onRetry,
  onBack,
  backLabel = "← Back to the posting",
  isLocalProvider = false,
  children,
}: {
  title: string;
  steps: readonly string[];
  current: number;
  /** Why it stopped, if it did. */
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  backLabel?: string;
  isLocalProvider?: boolean;
  children?: React.ReactNode;
}) {
  const percent = steps.length > 0 ? Math.min(100, Math.round((current / steps.length) * 100)) : 0;

  return (
    <Card className="flex flex-col gap-[22px] px-9 py-10">
      {/* Takes focus when its step starts (E11-3). */}
      <div className="flex items-center justify-between gap-4">
        <h2 tabIndex={-1} className="font-serif text-section">
          {title}
        </h2>
        <span className="text-sm font-mono font-medium text-muted">
          {percent}%
        </span>
      </div>

      {/* Percentage Progress Bar */}
      <div className="w-full bg-border-subtle h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ProgressSteps steps={steps} current={current} />
      {children}
      {error ? (
        <div role="alert" className="flex flex-col gap-3.5">
          <p className="text-control text-error">{error}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onRetry}>Retry</Button>
            <Button variant="text" onClick={onBack}>
              {backLabel}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-meta text-muted">This can take a little longer on a local model.</p>
      )}
    </Card>
  );
}
