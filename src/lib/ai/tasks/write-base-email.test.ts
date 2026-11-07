import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import { EMAIL_TRACK_PRESETS } from "@/lib/settings";

import { MockProvider } from "../providers/mock";
import { writeBaseEmail, WRITE_BASE_EMAIL_VERSION } from "./write-base-email";

describe("writeBaseEmail", () => {
  const profile = demoProfile();
  const options = { creativity: "BALANCED" as const, strict: true, language: null };

  it("generates a short cold outreach email with proof points", async () => {
    const mockReply = {
      proofPoints: ["DMRC Momentum 2.0 20% speedup", "AP ASTraM React Native app", "Node.js & PostgreSQL backend"],
      subject: "full-stack / software engineering at {{company}}",
      greeting: "Hi {{contactPerson}},",
      paragraphs: [
        "I'm a Full-Stack Developer with 2 years of experience shipping React.js, Node.js, and React Native systems, reaching out about engineering openings at {{company}}.",
        "Recently, I reduced load times by 20% on the DMRC transit platform and engineered multi-tenant Node.js services with real-time Socket.IO sync.",
        "I've attached my resume. Are you folks hiring for full-stack, frontend, or backend roles right now?",
      ],
      signOff: "Thanks,",
    };

    const provider = new MockProvider({ reply: () => mockReply });

    const result = await writeBaseEmail(
      provider,
      { profile, track: "fullstack", tone: "WARM" },
      options,
    );

    expect(result.promptVersion).toBe(WRITE_BASE_EMAIL_VERSION);
    expect(result.data.subject).toBe("full-stack / software engineering at {{company}}");
    expect(result.data.body).toContain("Hi {{contactPerson}},");
    expect(result.data.body).toContain("DMRC transit platform");
    expect(result.data.body).toContain("Thanks,\n{{name}}");
    expect(provider.calls[0].system).toContain("70 to 90 words");
  });

  it("falls back to track preset when model generates buzzwords after retry", async () => {
    const mockReplyWithBuzzwords = {
      proofPoints: ["Test", "Metric", "Stack"],
      subject: "full-stack engineering at {{company}}",
      greeting: "Hi {{contactPerson}},",
      paragraphs: [
        "I am a passionate engineer who thrives in cross-functional Agile environments.",
        "I build adept clean code and create synergy across teams.",
        "Let me know if you are hiring.",
      ],
      signOff: "Thanks,",
    };

    const provider = new MockProvider({ reply: () => mockReplyWithBuzzwords });

    const result = await writeBaseEmail(
      provider,
      { profile, track: "frontend", tone: "WARM" },
      options,
    );

    expect(result.promptVersion).toBe(WRITE_BASE_EMAIL_VERSION);
    expect(result.data.subject).toBe(EMAIL_TRACK_PRESETS.frontend.subject);
    expect(result.data.body).toBe(EMAIL_TRACK_PRESETS.frontend.body);
  });
});

