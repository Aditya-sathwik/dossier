import type { Metadata } from "next";

import { googleConnection } from "@/lib/google/account";
import { prisma } from "@/lib/prisma";
import { loadProfileName } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";

import { OutreachScreen } from "./outreach-screen";

export const metadata: Metadata = {
  title: "Outreach · Dossier",
};

export default async function OutreachPage() {
  const [google, settings, profileName, contacts, pending] = await Promise.all([
    googleConnection(),
    loadSettings(),
    loadProfileName(),
    prisma.outreachContact.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.outreachPendingCompany.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const detectedSheets = new Set<string>();
  contacts.forEach((c) => {
    if (c.sheetName) detectedSheets.add(c.sheetName);
  });
  pending.forEach((p) => {
    if (p.sheetName) detectedSheets.add(p.sheetName);
  });

  const initialContacts = contacts.map((c) => ({
    id: c.id,
    company: c.company,
    email: c.email,
    contactPerson: c.contactPerson,
    phone: c.phone,
    role: c.role,
    notes: c.notes,
    sheetName: c.sheetName || "Sheet1",
    source: c.source,
    status: c.status,
    sentAt: c.sentAt,
    applicationId: c.applicationId,
    gmailThreadId: c.gmailThreadId,
  }));

  const initialPendingCompanies = pending.map((p) => ({
    id: p.id,
    company: p.company,
    contactPerson: p.contactPerson,
    phone: p.phone,
    notes: p.notes,
    sheetName: p.sheetName || "Sheet1",
    source: p.source,
  }));

  return (
    <OutreachScreen
      initialContacts={initialContacts}
      initialPendingCompanies={initialPendingCompanies}
      initialSheetNames={Array.from(detectedSheets)}
      google={google}
      settings={{
        baseEmailSubject: settings.baseEmailSubject,
        baseEmailBody: settings.baseEmailBody,
        baseCoverLetterSubject: settings.baseCoverLetterSubject,
        baseCoverLetterBody: settings.baseCoverLetterBody,
        baseCoverLetterRole: settings.baseCoverLetterRole,
      }}
      profileName={profileName}
    />
  );
}
