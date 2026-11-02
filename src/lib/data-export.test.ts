import { describe, expect, it } from "vitest";
import { EXPORT_SCHEMA_VERSION, exportSchema } from "./data-export";

describe("exportSchema v8", () => {
  it("validates export payload with version 8 and latex fields", () => {
    const validExport = {
      format: "dossier-export",
      schemaVersion: EXPORT_SCHEMA_VERSION,
      appVersion: "1.11.0",
      exportedAt: new Date().toISOString(),
      profile: {
        fields: [{ key: "name", value: "Jane Doe" }],
        skills: [],
        languages: [],
        experience: [],
        projects: [],
        education: [],
        publications: [],
        references: [],
        facts: [],
      },
      themes: [],
      settings: [
        { key: "resumeFormat", value: "latex" },
        { key: "baseResumeLatex", value: "\\begin{document}Base\\end{document}" },
      ],
      applications: [
        {
          id: "app-1",
          title: "Engineer",
          company: "Acme",
          role: "Engineer",
          location: "Remote",
          mode: "Remote",
          salary: "",
          deadline: null,
          postingUrl: "https://example.com/job",
          postingText: "Job description",
          extracted: null,
          extractedWith: null,
          match: null,
          matchedWith: null,
          status: "DRAFT",
          furthestStage: null,
          sentAt: null,
          tone: "WARM",
          language: "English",
          followThemeLayout: true,
          showPhoto: null,
          resumeFormat: "latex",
          latexCode: "\\begin{document}Tailored\\end{document}",
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          events: [],
          documents: [],
          messages: [],
          notes: [],
          facts: [],
        },
      ],
    };

    const parsed = exportSchema.safeParse(validExport);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(8);
      expect(parsed.data.applications[0].resumeFormat).toBe("latex");
      expect(parsed.data.applications[0].latexCode).toBe("\\begin{document}Tailored\\end{document}");
    }
  });

  it("handles exports where resumeFormat is absent (pre-v8)", () => {
    const exportWithoutLatex = {
      format: "dossier-export",
      schemaVersion: 7,
      appVersion: "1.10.0",
      exportedAt: new Date().toISOString(),
      profile: {
        fields: [{ key: "name", value: "Jane Doe" }],
        skills: [],
        languages: [],
        experience: [],
        projects: [],
        education: [],
        publications: [],
        references: [],
        facts: [],
      },
      themes: [],
      settings: [],
      applications: [
        {
          id: "app-2",
          title: "Designer",
          company: "Beta",
          role: "Designer",
          location: "NYC",
          mode: "On-site",
          salary: "$100k",
          deadline: null,
          postingUrl: "",
          postingText: "",
          extracted: null,
          extractedWith: null,
          match: null,
          matchedWith: null,
          status: "DRAFT",
          furthestStage: null,
          sentAt: null,
          tone: "WARM",
          language: "English",
          followThemeLayout: true,
          showPhoto: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          events: [],
          documents: [],
          messages: [],
          notes: [],
          facts: [],
        },
      ],
    };

    const parsed = exportSchema.safeParse(exportWithoutLatex);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(7);
      expect(parsed.data.applications[0].resumeFormat).toBeUndefined();
      expect(parsed.data.applications[0].latexCode).toBeUndefined();
    }
  });
});
