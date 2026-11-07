import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import { EMAIL_TRACK_PRESETS } from "@/lib/settings";

import * as actions from "./actions";
import { LetterWorkspace, resolveTemplateVariables } from "./letter-workspace";

vi.mock("./actions", () => ({
  saveBaseCoverLetter: vi.fn(async () => ({ ok: true, data: {}, toast: "Saved." })),
  generateBaseCoverLetterAction: vi.fn(async () => ({
    ok: true,
    data: {
      subject: "AI Subject: {{role}}",
      body: "AI Body for {{company}}",
    },
    toast: "Generated.",
  })),
  saveBaseEmail: vi.fn(async () => ({ ok: true, data: {}, toast: "Saved." })),
  generateBaseEmailAction: vi.fn(async () => ({
    ok: true,
    data: {
      subject: "AI Email Subject: {{role}}",
      body: "AI Email Body for {{company}}",
    },
    toast: "Generated.",
  })),
}));

vi.mock("@/components/toast", () => ({
  toast: vi.fn(),
  toastResult: vi.fn(),
}));

describe("resolveTemplateVariables", () => {
  it("replaces all template variables properly", () => {
    const template = "Hello {{contactPerson}}, I want {{role}} at {{company}}. Signed, {{name}}.";
    const result = resolveTemplateVariables(template, {
      company: "Acme",
      role: "Developer",
      name: "Jane",
      contactPerson: "Bob",
    });
    expect(result).toBe("Hello Bob, I want Developer at Acme. Signed, Jane.");
  });

  it("handles case-insensitive and spaced variables", () => {
    const template = "{{ Company }} - {{  ROLE  }}";
    const result = resolveTemplateVariables(template, {
      company: "Beta",
      role: "Designer",
      name: "Jane",
      contactPerson: "Team",
    });
    expect(result).toBe("Beta - Designer");
  });
});

describe("LetterWorkspace - Cover Letter Tab", () => {
  const profile = demoProfile();

  it("renders editor inputs and resolves live preview for cover letter", () => {
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="letter"
        initialSubject="Application: {{role}} – {{name}}"
        initialBody="Dear {{company}} Team, I want to join {{company}}."
        initialRole="Software Engineer"
      />,
    );

    expect(screen.getByLabelText(/subject line template/i)).toHaveValue("Application: {{role}} – {{name}}");
    expect(screen.getByLabelText(/letter body/i)).toHaveValue("Dear {{company}} Team, I want to join {{company}}.");

    // Check preview resolved with default Acme Corp
    expect(screen.getByText(/Dear Acme Corp Team, I want to join Acme Corp\./)).toBeInTheDocument();
  });

  it("updates live preview when preview company is changed", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="letter"
        initialSubject="Job at {{company}}"
        initialBody="Hello {{company}}"
        initialRole="Engineer"
      />,
    );

    const previewCompanyInput = screen.getByPlaceholderText(/company name/i);
    await user.clear(previewCompanyInput);
    await user.type(previewCompanyInput, "ZINFI Technologies");

    expect(screen.getByText(/Hello ZINFI Technologies/)).toBeInTheDocument();
  });

  it("inserts variable tag when clicking a variable chip", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="letter"
        initialSubject="Subject"
        initialBody="Existing body text"
        initialRole="Dev"
      />,
    );

    const chip = screen.getByRole("button", { name: /\{\{company\}\}/i });
    await user.click(chip);

    const bodyTextarea = screen.getByLabelText(/letter body/i);
    expect(bodyTextarea).toHaveValue("Existing body text {{company}}");
  });

  it("calls saveBaseCoverLetter when clicking Save template on letter tab", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="letter"
        initialSubject="Custom Subject"
        initialBody="Custom Body"
        initialRole="Architect"
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /save template/i });
    await user.click(saveBtn);

    expect(actions.saveBaseCoverLetter).toHaveBeenCalledWith({
      subject: "Custom Subject",
      body: "Custom Body",
      role: "Architect",
    });
  });

  it("calls generateBaseCoverLetterAction when clicking Generate with AI on letter tab", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="letter"
        initialSubject="Old Subject"
        initialBody="Old Body"
        initialRole="Lead Dev"
      />,
    );

    const generateBtn = screen.getByRole("button", { name: /generate with ai/i });
    await user.click(generateBtn);

    expect(actions.generateBaseCoverLetterAction).toHaveBeenCalledWith({
      role: "Lead Dev",
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/subject line template/i)).toHaveValue("AI Subject: {{role}}");
      expect(screen.getByLabelText(/letter body/i)).toHaveValue("AI Body for {{company}}");
    });
  });
});

describe("LetterWorkspace - Cold Outreach Email Tab", () => {
  const profile = demoProfile();

  it("renders 80-word email template and word count meter", () => {
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="email"
        initialEmailTrack="fullstack"
        initialEmailSubject="full-stack engineering at {{company}}"
        initialEmailBody={EMAIL_TRACK_PRESETS.fullstack.body}
      />,
    );

    expect(screen.getByText(/Cold Outreach Email/i)).toBeInTheDocument();
    expect(screen.getByText(/6-Sec Rule:/i)).toBeInTheDocument();
    expect(screen.getByText(/Optimal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email body/i)).toHaveValue(EMAIL_TRACK_PRESETS.fullstack.body);
  });

  it("switches to frontend preset when clicking Frontend track pill", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="email"
        initialEmailTrack="fullstack"
      />,
    );

    const frontendPill = screen.getByRole("button", { name: /^frontend$/i });
    await user.click(frontendPill);

    expect(screen.getByLabelText(/email body/i)).toHaveValue(EMAIL_TRACK_PRESETS.frontend.body);
  });

  it("calls saveBaseEmail when clicking Save template on email tab", async () => {
    const user = userEvent.setup();
    render(
      <LetterWorkspace
        profile={profile}
        initialTab="email"
        initialEmailTrack="fullstack"
        initialEmailSubject="email subject"
        initialEmailBody="email body"
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /save template/i });
    await user.click(saveBtn);

    expect(actions.saveBaseEmail).toHaveBeenCalledWith({
      subject: "email subject",
      body: "email body",
      track: "fullstack",
    });
  });
});
