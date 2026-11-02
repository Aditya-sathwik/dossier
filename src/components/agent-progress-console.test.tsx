import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentProgressConsole, type AgentComment, type AgentProgressStep } from "./agent-progress-console";

describe("AgentProgressConsole", () => {
  const steps: AgentProgressStep[] = [
    { name: "Reading your comments and instructions", status: "done" },
    { name: "Tailoring your LaTeX resume", status: "running" },
    { name: "Writing your cover letter", status: "pending" },
  ];

  const comments: AgentComment[] = [
    { id: "1", label: "JavaScript requirement", text: "Built React Native apps with offline sync." },
  ];

  it("renders steps with status indicators", () => {
    render(<AgentProgressConsole steps={steps} comments={comments} />);

    expect(screen.getByText("[Agent] Reading your comments and instructions")).toBeInTheDocument();
    expect(screen.getByText("[Agent] Tailoring your LaTeX resume")).toBeInTheDocument();
    expect(screen.getByText("[Agent] Writing your cover letter")).toBeInTheDocument();
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });

  it("renders candidate comments read section", () => {
    render(<AgentProgressConsole steps={steps} comments={comments} />);

    expect(screen.getByText(/Candidate instructions read/)).toBeInTheDocument();
    expect(screen.getByText("JavaScript requirement:")).toBeInTheDocument();
    expect(screen.getByText("Built React Native apps with offline sync.")).toBeInTheDocument();
  });

  it("renders fallback notice when latexStatus is fallback", () => {
    render(
      <AgentProgressConsole
        steps={steps}
        latexStatus="fallback"
        latexError="Syntax error on line 42"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("LaTeX tailoring failed compilation; using base resume.");
    expect(screen.getByText("Syntax error on line 42")).toBeInTheDocument();
  });

  it("renders line diff when originalCode and updatedCode are provided", () => {
    const original = "Line 1\nLine 2";
    const updated = "Line 1\nAdded line\nLine 2";

    render(
      <AgentProgressConsole
        steps={steps}
        originalCode={original}
        updatedCode={updated}
        isDone={true}
      />,
    );

    expect(screen.getByText("Tailored LaTeX changes")).toBeInTheDocument();
    expect(screen.getByText("Added line")).toBeInTheDocument();
  });

  it("triggers onCompleteAction when completion button is clicked", () => {
    const onComplete = vi.fn();
    render(
      <AgentProgressConsole
        steps={steps}
        isDone={true}
        onCompleteAction={onComplete}
        completeActionLabel="View application →"
      />,
    );

    const button = screen.getByRole("button", { name: "View application →" });
    fireEvent.click(button);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
