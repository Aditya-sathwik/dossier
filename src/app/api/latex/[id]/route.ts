import { NextResponse } from "next/server";

import { heldPdf } from "@/lib/pdf/downloads";
import { route } from "@/lib/route";

const GONE = "That preview has expired. Recompile to preview again.";

/**
 * Serves a held compiled LaTeX PDF inline for the preview iframe.
 */
export const GET = route<RouteContext<"/api/latex/[id]">>(async (_request, { params }) => {
  const held = heldPdf((await params).id);
  if (!held) {
    return NextResponse.json({ error: GONE }, { status: 404 });
  }

  return new Response(Buffer.from(held.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${held.fileName || "preview.pdf"}"`,
      "cache-control": "private, no-store",
    },
  });
});

