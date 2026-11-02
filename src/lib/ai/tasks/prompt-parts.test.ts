import { describe, expect, it } from "vitest";

import { generatedMatchItemSchema, generatedMatchSchema, type Extracted, type Match } from "@/lib/application-data";
import { demoProfile } from "@/lib/demo-profile";

import {
  applicationFacts,
  candidateFacts,
  COMMENT_RULES_BASE,
  COVER_LETTER_COMMENT_RULES,
  EMAIL_COMMENT_RULES,
  FACTS_HEADING,
  jobForPrompt,
  RESUME_COMMENT_RULES,
} from "./prompt-parts";

const extracted: Extracted = {
  title: "Systems Engineer",
  company: "Tech Corp",
  role: "Systems Engineer",
  location: "Remote",
  mode: "Remote",
  salary: null,
  deadline: null,
  requirements: [
    { text: "Experience with Rust", kind: "skill", skill: "Rust", years: null, language: null },
    { text: "Experience with Docker", kind: "skill", skill: "Docker", years: null, language: null },
  ],
  asksForReferences: false,
  language: "English",
};

describe("jobForPrompt candidateComment propagation", () => {
  it("includes candidateComment when comment is present on a match item", () => {
    const match: Match = {
      items: [
        {
          requirement: "Experience with Rust",
          result: "gap",
          skill: null,
          experienceIds: [],
          note: "Not in your profile",
          comment: "I built an open-source CLI tool in Rust with 500 stars",
        },
      ],
    };

    const parsed = JSON.parse(jobForPrompt(extracted, match));
    expect(parsed.requirements[0]).toEqual({
      requirement: "Experience with Rust",
      inProfile: "gap",
      note: "Not in your profile",
      candidateComment: "I built an open-source CLI tool in Rust with 500 stars",
    });
  });

  it("omits candidateComment when comment is not set or undefined", () => {
    const match: Match = {
      items: [
        {
          requirement: "Experience with Docker",
          result: "covered",
          skill: "Docker",
          experienceIds: ["e1"],
          note: "Used at Northwind Logistics",
        },
      ],
    };

    const parsed = JSON.parse(jobForPrompt(extracted, match));
    expect(parsed.requirements[0]).toEqual({
      requirement: "Experience with Docker",
      inProfile: "covered",
      note: "Used at Northwind Logistics",
    });
    expect("candidateComment" in parsed.requirements[0]).toBe(false);
  });
});

describe("generatedMatchItemSchema (negative test)", () => {
  it("strictly strips comment so LLMs cannot emit comments", () => {
    const raw = {
      requirement: "Experience with Rust",
      result: "gap" as const,
      skill: null,
      experienceIds: [],
      note: "Not in profile",
      comment: "Model trying to inject a comment",
    };

    const parsedItem = generatedMatchItemSchema.parse(raw);
    expect("comment" in parsedItem).toBe(false);

    const parsedMatch = generatedMatchSchema.parse({ items: [raw] });
    expect("comment" in parsedMatch.items[0]).toBe(false);
  });
});

describe("applicationFacts and candidateFacts", () => {
  it("uses the exported FACTS_HEADING in applicationFacts", () => {
    const facts = ["Relocating to Amsterdam in January", "Met the engineering team at RustConf"];
    const formatted = applicationFacts(facts);
    expect(formatted).toBe(
      `${FACTS_HEADING}:\n- Relocating to Amsterdam in January\n- Met the engineering team at RustConf`,
    );
  });

  it("interpolates FACTS_HEADING into COMMENT_RULES_BASE and domain rules", () => {
    expect(COMMENT_RULES_BASE).toContain(FACTS_HEADING);
    expect(RESUME_COMMENT_RULES).toContain(COMMENT_RULES_BASE);
    expect(COVER_LETTER_COMMENT_RULES).toContain(COMMENT_RULES_BASE);
    expect(EMAIL_COMMENT_RULES).toContain(COMMENT_RULES_BASE);
    expect(COMMENT_RULES_BASE).toContain("take precedence over \"not in profile\"");
  });

  it("does not duplicate raw fact texts in candidateFacts instructions", () => {
    const profile = demoProfile();
    const facts = ["Specific secret fact 12345"];
    const instructions = candidateFacts(profile, facts);
    expect(instructions).not.toBeNull();
    // candidateFacts should contain guidance on HOW to use facts, not the fact texts themselves
    expect(instructions).not.toContain("Specific secret fact 12345");
  });
});

