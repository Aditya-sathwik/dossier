import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SendDialog, type OutreachTarget } from "./send-dialog";
import * as actions from "./actions";

vi.mock("./actions", () => ({
  prepareResumeAttachmentAction: vi.fn(async () => ({
    ok: true,
    data: {
      fileName: "Aditya_Resume.pdf",
      contentType: "application/pdf",
      base64: "cGRmZGF0YQ==",
    },
  })),
  sendOutreachEmailAction: vi.fn(async () => ({
    ok: true,
    data: {
      success: true,
      threadId: "th_1",
      gmailId: "gm_1",
      applicationId: "app_1",
    },
  })),
}));

vi.mock("@/components/toast", () => ({
  toast: vi.fn(),
}));

const mockTargets: OutreachTarget[] = [
  {
    id: "c1",
    company: "Google",
    email: "careers@google.com",
    contactPerson: "Sundar",
    role: "Staff Engineer",
  },
  {
    id: "c2",
    company: "Meta",
    email: "careers@meta.com",
    contactPerson: "Mark",
    role: "AI Engineer",
  },
];

describe("SendDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders review dialog with recipients, attachment, and sample preview", async () => {
    render(
      <SendDialog
        open={true}
        onOpenChange={vi.fn()}
        selectedContacts={mockTargets}
        senderEmail="aditya@gmail.com"
        canSend={true}
        baseSubject="Application: {{role}} - {{my_name}}"
        baseBody="Hi {{name}}, applying to {{company}}."
        profileName="Aditya"
        onFinished={vi.fn()}
      />,
    );

    expect(screen.getByText("Review & Dispatch Outreach")).toBeInTheDocument();
    expect(screen.getByText("aditya@gmail.com")).toBeInTheDocument();
    expect(screen.getByText(/2 companies/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Aditya_Resume.pdf")).toBeInTheDocument();
    });

    expect(screen.getByText("Application: Staff Engineer - Aditya")).toBeInTheDocument();
    expect(screen.getByText("Hi Sundar, applying to Google.")).toBeInTheDocument();
  });

  it("executes batch send through pacing and marks completion", async () => {
    // Fast-forward or mock timeouts if needed, but for 2 targets we can test execution
    const onFinished = vi.fn();
    const user = userEvent.setup();

    render(
      <SendDialog
        open={true}
        onOpenChange={vi.fn()}
        selectedContacts={mockTargets}
        senderEmail="aditya@gmail.com"
        canSend={true}
        baseSubject="Application: {{role}}"
        baseBody="Hello {{company}}"
        profileName="Aditya"
        onFinished={onFinished}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start batch send \(2\)/i })).toBeEnabled();
    });

    const startBtn = screen.getByRole("button", { name: /start batch send \(2\)/i });
    await user.click(startBtn);

    expect(screen.getByText("Sending Cold Outreach")).toBeInTheDocument();
    expect(actions.sendOutreachEmailAction).toHaveBeenCalledTimes(1);

    // Stop sending button is accessible
    const stopBtn = screen.getByRole("button", { name: /stop sending/i });
    await user.click(stopBtn);

    await waitFor(() => {
      expect(screen.getByText("Outreach Batch Complete")).toBeInTheDocument();
      expect(onFinished).toHaveBeenCalledTimes(1);
    });
  });
});

