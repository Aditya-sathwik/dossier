import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import { DEFAULT_BASE_COVER_LETTER_BODY, DEFAULT_BASE_COVER_LETTER_SUBJECT } from "@/lib/settings";

import { MockProvider } from "../providers/mock";
import { writeBaseCoverLetter, WRITE_BASE_COVER_LETTER_VERSION } from "./write-base-cover-letter";

describe("writeBaseCoverLetter", () => {
  const profile = demoProfile();
  const options = { creativity: "BALANCED" as const, strict: true, language: null };

  it("generates a base cover letter with dynamic variables", async () => {
    const mockReply = {
      proofPoints: ["DMRC Momentum 2.0 20% speedup", "AP ASTraM Kotlin modules", "Node.js & PostgreSQL APIs"],
      subject: "Full-Stack Engineer application: {{role}} – {{name}}",
      greeting: "Dear {{contactPerson}},",
      paragraphs: [
        "I am writing to explore {{role}} opportunities at {{company}} as a Full-Stack Engineer with 2 years of experience shipping production software.",
        "Over the past 2 years, I have architected and scaled full-stack web applications and React Native systems. On the DMRC Momentum 2.0 platform, I reduced page load times by 20% through dynamic content loading and modular architecture.",
        "My core stack includes React.js, Node.js, and TypeScript, focusing on clean architecture, reliable APIs, and maintainable systems.",
        "I would welcome the opportunity to discuss how my background aligns with {{company}}'s engineering goals. My resume is attached for your review.",
      ],
      signOff: "Warm regards,",
    };

    const provider = new MockProvider({ reply: () => mockReply });

    const result = await writeBaseCoverLetter(
      provider,
      { profile, targetRole: "Full-Stack Engineer", tone: "WARM" },
      options,
    );

    expect(result.promptVersion).toBe(WRITE_BASE_COVER_LETTER_VERSION);
    expect(result.data.subject).toBe("Full-Stack Engineer application: {{role}} – {{name}}");
    expect(result.data.body).toContain("Dear {{contactPerson}},");
    expect(result.data.body).toContain("explore {{role}} opportunities at {{company}}");
    expect(result.data.body).toContain("Warm regards,\n{{name}}");

    expect(provider.calls[0].system).toContain("proofPoints: 3 items");
    expect(provider.calls[0].system).toContain("{{company}}");
    expect(provider.calls[0].messages[0].content).toContain(profile.basics.name);
  });

  it("falls back to default cover letter template if output contains banned buzzwords after retry", async () => {
    const mockReplyWithBuzzwords = {
      proofPoints: ["P1", "P2", "P3"],
      subject: "Application: {{role}} – {{name}}",
      greeting: "Dear {{contactPerson}},",
      paragraphs: [
        "I am a passionate software engineer who thrives in cross-functional Agile environments.",
        "I create adept synergy across engineering teams.",
        "Resume is attached.",
      ],
      signOff: "Best,",
    };

    const provider = new MockProvider({ reply: () => mockReplyWithBuzzwords });

    const result = await writeBaseCoverLetter(
      provider,
      { profile, targetRole: "Full-Stack Engineer", tone: "WARM" },
      options,
    );

    expect(result.promptVersion).toBe(WRITE_BASE_COVER_LETTER_VERSION);
    expect(result.data.subject).toBe(DEFAULT_BASE_COVER_LETTER_SUBJECT);
    expect(result.data.body).toBe(DEFAULT_BASE_COVER_LETTER_BODY);
  });
});
