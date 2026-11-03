import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CodeHunk } from "@/lib/diff";
import { LatexDiffViewer } from "./latex-diff-viewer";

const sampleHunks: CodeHunk[] = [
  {
    id: "hunk-1",
    reason: "Highlight Go microservices experience",
    oldText: "Built backend services with Node.js.",
    newText: "Built high-throughput microservices using Go and Node.js.",
    start: 10,
    end: 46,
    oldStartLine: 4,
    newStartLine: 4,
  },
  {
    id: "hunk-2",
    reason: "Add Kubernetes and Docker to skills",
    oldText: "Skills: React, Node.js",
    newText: "Skills: React, Node.js, Docker, Kubernetes",
    start: 80,
    end: 102,
    oldStartLine: 12,
    newStartLine: 12,
  },
];

describe("LatexDiffViewer", () => {
  it("renders hunk cards with reason, old text, and new text", () => {
    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{}}
        onDecideHunk={vi.fn()}
        onAcceptAll={vi.fn()}
        onRejectAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("AI Proposed Changes")).toBeInTheDocument();
    expect(screen.getByText("2 changes")).toBeInTheDocument();
    expect(screen.getByText("Highlight Go microservices experience")).toBeInTheDocument();
    expect(screen.getByText("Add Kubernetes and Docker to skills")).toBeInTheDocument();
    expect(screen.getByText("Built backend services with Node.js.")).toBeInTheDocument();
    expect(screen.getByText("Built high-throughput microservices using Go and Node.js.")).toBeInTheDocument();
  });

  it("calls onAcceptAll when clicking 'Accept all'", async () => {
    const user = userEvent.setup();
    const onAcceptAll = vi.fn();

    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{}}
        onDecideHunk={vi.fn()}
        onAcceptAll={onAcceptAll}
        onRejectAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Accept all/i }));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
  });

  it("calls onRejectAll when clicking 'Reject all'", async () => {
    const user = userEvent.setup();
    const onRejectAll = vi.fn();

    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{}}
        onDecideHunk={vi.fn()}
        onAcceptAll={vi.fn()}
        onRejectAll={onRejectAll}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Reject all/i }));
    expect(onRejectAll).toHaveBeenCalledTimes(1);
  });

  it("calls onDecideHunk when accepting or rejecting individual hunks", async () => {
    const user = userEvent.setup();
    const onDecideHunk = vi.fn();

    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{}}
        onDecideHunk={onDecideHunk}
        onAcceptAll={vi.fn()}
        onRejectAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const acceptBtn1 = screen.getByRole("button", { name: "Accept change 1" });
    await user.click(acceptBtn1);
    expect(onDecideHunk).toHaveBeenCalledWith("hunk-1", "accepted");

    const rejectBtn2 = screen.getByRole("button", { name: "Reject change 2" });
    await user.click(rejectBtn2);
    expect(onDecideHunk).toHaveBeenCalledWith("hunk-2", "rejected");
  });

  it("calls onApply when clicking 'Done / Apply'", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{ "hunk-1": "accepted" }}
        onDecideHunk={vi.fn()}
        onAcceptAll={vi.fn()}
        onRejectAll={vi.fn()}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Done \/ Apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("calls onDiscard when clicking 'Cancel'", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();

    render(
      <LatexDiffViewer
        hunks={sampleHunks}
        decisions={{}}
        onDecideHunk={vi.fn()}
        onAcceptAll={vi.fn()}
        onRejectAll={vi.fn()}
        onApply={vi.fn()}
        onDiscard={onDiscard}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});

