import { describe, expect, it } from "vitest";

import type { Match } from "@/lib/application-data";
import type { FactItem } from "@/lib/profile";
import { deriveTailoringPrefill } from "./tailoring-prefill";

describe("deriveTailoringPrefill", () => {
  it("formats candidate comments and facts into actionable bullet points", () => {
    const match: Match = {
      items: [
        {
          requirement: "TypeScript and React",
          result: "covered",
          skill: "TypeScript",
          experienceIds: ["exp-1"],
          note: null,
          comment: "I led the frontend architecture and migrated to Next.js 14",
        },
        {
          requirement: "Kubernetes & Docker",
          result: "gap",
          skill: null,
          experienceIds: [],
          note: null,
          // No comment on this one
        },
        {
          requirement: "Distributed Systems",
          result: "partial",
          skill: "Microservices",
          experienceIds: ["exp-2"],
          note: null,
          comment: "Managed a cluster processing 10k req/sec",
        },
      ],
    };

    const facts: FactItem[] = [
      { id: "f-1", text: "Open to remote work worldwide" },
    ];

    const result = deriveTailoringPrefill(match, facts);

    expect(result).toContain('Please tailor my LaTeX resume for this role based on my notes:');
    expect(result).toContain('- For "TypeScript and React": I led the frontend architecture and migrated to Next.js 14');
    expect(result).toContain('- For "Distributed Systems": Managed a cluster processing 10k req/sec');
    expect(result).toContain('- Note: Open to remote work worldwide');
    expect(result).not.toContain('Kubernetes & Docker');
  });

  it("falls back to top requirements when no comments or facts exist", () => {
    const match: Match = {
      items: [
        {
          requirement: "5+ years of Python",
          result: "covered",
          skill: "Python",
          experienceIds: ["exp-1"],
          note: null,
        },
        {
          requirement: "PostgreSQL optimization",
          result: "covered",
          skill: "PostgreSQL",
          experienceIds: ["exp-1"],
          note: null,
        },
      ],
    };

    const result = deriveTailoringPrefill(match, []);

    expect(result).toContain("Please tailor my LaTeX resume for this role, focusing on:");
    expect(result).toContain("- 5+ years of Python");
    expect(result).toContain("- PostgreSQL optimization");
  });

  it("returns fallback prompt when match is empty or null", () => {
    expect(deriveTailoringPrefill(null, [])).toBe(
      "Please tailor my LaTeX resume for this role. Update the relevant experience and summary bullet points in the LaTeX code to align with the job description.",
    );
  });
});

