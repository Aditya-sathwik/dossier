import type { ProfileData } from "@/lib/profile";
import type { SettingsData } from "@/lib/settings";
import { generateLatexFromProfile } from "./template";

/**
 * Returns the saved base LaTeX resume code or generates a default template from the profile if empty.
 */
export function baseLatexOrGenerated(settings: SettingsData, profile: ProfileData): string {
  if (settings.baseResumeLatex && settings.baseResumeLatex.trim()) {
    return settings.baseResumeLatex;
  }
  return generateLatexFromProfile(profile, { paper: settings.paper });
}

/**
 * Returns the LaTeX code for an application: its custom application code, or falls back to the base template.
 */
export function latexSourceOf(
  application: { latexCode?: string | null },
  settings: SettingsData,
  profile: ProfileData,
): string {
  if (application.latexCode && application.latexCode.trim()) {
    return application.latexCode;
  }
  return baseLatexOrGenerated(settings, profile);
}
