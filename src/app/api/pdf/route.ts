import { type NextRequest, NextResponse } from "next/server";

import { DocumentKind } from "@/generated/prisma/enums";
import { resolveFileName } from "@/lib/file-name";
import { baseLatexOrGenerated, latexSourceOf } from "@/lib/latex/base";
import { renderLatexPdf, LatexRenderError } from "@/lib/latex/render";
import { holdPdf, pdfDownload } from "@/lib/pdf/downloads";
import { renderPdf } from "@/lib/pdf/render";
import { prisma } from "@/lib/prisma";
import { loadProfile, loadProfileName } from "@/lib/profile-data";
import { loadSettings } from "@/lib/settings-data";
import { route } from "@/lib/route";

/** The documents an application can download, by their `doc=` value. */
const TAILORED = { resume: DocumentKind.RESUME, letter: DocumentKind.COVER_LETTER } as const;

/** Application ids are cuids; anything else never reaches a print path. */
const APPLICATION_ID = /^[a-z0-9]{1,64}$/i;

const notFound = (error: string) => NextResponse.json({ error }, { status: 404 });

/**
 * Downloads a document as a PDF (RES-5, APP-12): `?doc=base` for the base
 * resume, `?doc=resume&application={id}` or `?doc=letter&application={id}`
 * for an application's tailored resume or cover letter. The file is named
 * with Settings → PDF file name (SET-8).
 */
export const GET = route(async (request) => {
  const rendered = await renderRequested(request);
  return rendered instanceof Response ? rendered : pdfDownload(rendered.pdf, rendered.fileName);
});

/**
 * Renders the same documents and holds the PDF for a few minutes, answering
 * with the link to download it from: `{ url }`. The download button uses
 * this, so the browser saves the file from a link of its own.
 */
export const POST = route(async (request) => {
  const rendered = await renderRequested(request);
  if (rendered instanceof Response) return rendered;
  return NextResponse.json({ url: `/api/pdf/${holdPdf(rendered.pdf, rendered.fileName)}` });
});

/** The PDF and file name of the document the query asks for, or a 404 response. */
async function renderRequested(request: NextRequest): Promise<{ pdf: Uint8Array; fileName: string } | Response> {
  const params = request.nextUrl.searchParams;
  const doc = params.get("doc");
  const [name, settings] = await Promise.all([loadProfileName(), loadSettings()]);
  const date = new Date();

  if (doc === "base") {
    const fileName = resolveFileName(settings.fileNamePattern, { name, doc: DocumentKind.RESUME, date });
    if (settings.resumeFormat === "latex") {
      const profile = await loadProfile();
      try {
        const pdf = await renderLatexPdf(baseLatexOrGenerated(settings, profile));
        return { pdf, fileName };
      } catch (err) {
        const message = err instanceof LatexRenderError ? err.message : "Failed to compile base LaTeX resume.";
        return NextResponse.json({ error: message }, { status: 422 });
      }
    }
    return {
      pdf: await renderPdf("/print/base"),
      fileName,
    };
  }

  const id = params.get("application") ?? "";

  if (doc === "custom") {
    const application = APPLICATION_ID.test(id)
      ? await prisma.application.findUnique({
          where: { id },
          select: { customResumeName: true, customResumeData: true },
        })
      : null;
    if (!application || !application.customResumeData) return notFound("This application has no custom resume uploaded.");
    const base64 = application.customResumeData.replace(/^data:[^;]+;base64,/, "");
    return {
      pdf: Buffer.from(base64, "base64"),
      fileName: application.customResumeName || "Resume.pdf",
    };
  }

  if (doc !== "resume" && doc !== "letter") return notFound("There's no such document to download.");
  const application = APPLICATION_ID.test(id)
    ? await prisma.application.findUnique({
        where: { id },
        select: {
          company: true,
          role: true,
          resumeFormat: true,
          latexCode: true,
          documents: { where: { kind: TAILORED[doc] }, select: { id: true } },
        },
      })
    : null;
  if (!application) return notFound("That application no longer exists.");

  const fileName = resolveFileName(settings.fileNamePattern, { name, company: application.company, role: application.role, doc: TAILORED[doc], date });

  if (doc === "resume" && application.resumeFormat === "latex") {
    const profile = await loadProfile();
    try {
      const pdf = await renderLatexPdf(latexSourceOf(application, settings, profile));
      return { pdf, fileName };
    } catch (err) {
      const message = err instanceof LatexRenderError ? err.message : "Failed to compile tailored LaTeX resume.";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  if (application.documents.length === 0) {
    return notFound(doc === "resume" ? "This application has no tailored resume." : "This application has no cover letter.");
  }

  return {
    pdf: await renderPdf(`/print/${doc}/${id}`),
    fileName,
  };
}
