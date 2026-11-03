import type { Match } from "@/lib/application-data";
import type { FactItem } from "@/lib/profile";

/**
 * Derives a structured tailoring prompt prefill for the LaTeX resume AI chatbot.
 * Synthesizes candidate steering comments from match requirements and candidate facts/notes.
 */
export function deriveTailoringPrefill(match: Match | null, facts: FactItem[] = []): string {
  const commentBullets: string[] = [];

  if (match?.items) {
    for (const item of match.items) {
      if (item.comment?.trim()) {
        commentBullets.push(`- For "${item.requirement}": ${item.comment.trim()}`);
      }
    }
  }

  for (const fact of facts) {
    if (fact.text?.trim()) {
      commentBullets.push(`- Note: ${fact.text.trim()}`);
    }
  }

  if (commentBullets.length > 0) {
    return `Please tailor my LaTeX resume for this role based on my notes:\n${commentBullets.join("\n")}\n\nUpdate the relevant experience and summary bullet points in the LaTeX code.`;
  }

  if (match?.items && match.items.length > 0) {
    const focusItems = match.items.slice(0, 5).map((item) => `- ${item.requirement}`);
    return `Please tailor my LaTeX resume for this role, focusing on:\n${focusItems.join("\n")}\n\nUpdate the relevant experience and summary bullet points in the LaTeX code.`;
  }

  return "Please tailor my LaTeX resume for this role. Update the relevant experience and summary bullet points in the LaTeX code to align with the job description.";
}

