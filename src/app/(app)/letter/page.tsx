import type { Metadata } from "next";

import { loadProfile } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { LetterWorkspace } from "./letter-workspace";

export const metadata: Metadata = { title: "Base cover letter & cold email" };

export default async function BaseLetterPage() {
  const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
  return (
    <LetterWorkspace
      profile={profile}
      initialEmailTrack={settings.baseEmailTrack}
      initialEmailSubject={settings.baseEmailSubject}
      initialEmailBody={settings.baseEmailBody}
      initialCoverLetterSubject={settings.baseCoverLetterSubject}
      initialCoverLetterBody={settings.baseCoverLetterBody}
      initialRole={settings.baseCoverLetterRole}
    />
  );
}
