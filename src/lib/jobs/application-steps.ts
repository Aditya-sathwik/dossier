// The named steps of the new application flow's jobs (NEW-2, NEW-7), shared
// by the jobs that report them and the page that shows them.

export const READ_POSTING_STEPS = [
  "Reading the posting",
  "Picking out the role, company and requirements",
  "Comparing it with your profile",
] as const;

export function writeDocumentsSteps({
  hasComments,
  latex,
}: {
  hasComments: boolean;
  latex: boolean;
}): readonly string[] {
  return [
    ...(hasComments ? ["Reading your comments and instructions"] : []),
    ...(latex ? ["Tailoring your LaTeX resume", "Compiling LaTeX preview"] : ["Tailoring your resume"]),
    "Writing your cover letter",
    "Saving the application",
  ];
}

/** Default steps for backwards compatibility when options are not known. */
export const WRITE_DOCUMENTS_STEPS = [
  "Tailoring your resume",
  "Writing your cover letter",
  "Saving the application",
] as const;
