import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { compileLatexAction } from "@/lib/latex/actions";
import { LatexWorkspace } from "./latex-workspace";

vi.mock("@/lib/latex/actions", () => ({
  compileLatexAction: vi.fn(),
}));

describe("LatexWorkspace", () => {
  beforeEach(() => {
    vi.mocked(compileLatexAction).mockReset();
  });

  it("renders editor and preview with compile and download buttons", async () => {
    vi.mocked(compileLatexAction).mockResolvedValueOnce({
      ok: true,
      data: { success: true, heldId: "held-1", cached: false },
    });

    render(
      <LatexWorkspace
        code="\\documentclass{article}\n\\begin{document}Hello\\end{document}"
        onChange={vi.fn()}
        downloadHref="/api/pdf?doc=base"
      />,
    );

    expect(screen.getByRole("textbox", { name: "LaTeX source code editor" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Compile/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download PDF/i })).toHaveAttribute("href", "/api/pdf?doc=base");
  });

  it("calls onChange when typing in the editor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <LatexWorkspace
        code=""
        onChange={onChange}
        downloadHref="/api/pdf?doc=base"
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "LaTeX source code editor" });
    await user.type(textarea, "A");
    expect(onChange).toHaveBeenCalledWith("A");
  });

  it("compiles on compile button click and displays iframe preview", async () => {
    const user = userEvent.setup();
    vi.mocked(compileLatexAction).mockResolvedValue({
      ok: true,
      data: { success: true, heldId: "pdf-123", cached: false },
    });

    render(
      <LatexWorkspace
        code=""
        onChange={vi.fn()}
        downloadHref="/api/pdf?doc=base"
      />,
    );

    const compileBtn = screen.getByRole("button", { name: /^Compile/i });
    await user.click(compileBtn);

    expect(compileLatexAction).toHaveBeenCalled();
    const iframe = await screen.findByTitle("LaTeX Resume PDF Preview");
    expect(iframe).toHaveAttribute("src", "/api/latex/pdf-123");
  });

  it("displays compiler diagnostics when compilation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(compileLatexAction).mockResolvedValue({
      ok: true,
      data: {
        success: false,
        error: "! Undefined control sequence",
        diagnostics: ["! Undefined control sequence l.5 \\badcommand"],
        unavailable: false,
      },
    });

    render(
      <LatexWorkspace
        code=""
        onChange={vi.fn()}
        downloadHref="/api/pdf?doc=base"
      />,
    );

    const compileBtn = screen.getByRole("button", { name: /^Compile/i });
    await user.click(compileBtn);

    expect(await screen.findByText(/! Undefined control sequence l.5 \\badcommand/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Compiler errors/i)[0]).toBeInTheDocument();
  });

  it("shows unavailable message when tectonic binary is missing", async () => {
    const user = userEvent.setup();
    vi.mocked(compileLatexAction).mockResolvedValue({
      ok: true,
      data: {
        success: false,
        error: "Tectonic compiler is not installed",
        diagnostics: ["Tectonic compiler is not installed or available on PATH."],
        unavailable: true,
      },
    });

    render(
      <LatexWorkspace
        code=""
        onChange={vi.fn()}
        downloadHref="/api/pdf?doc=base"
      />,
    );

    const compileBtn = screen.getByRole("button", { name: /^Compile/i });
    await user.click(compileBtn);

    expect(await screen.findByText(/Tectonic LaTeX Compiler Missing/i)).toBeInTheDocument();
  });

  it("renders review mode when pendingProposal is provided and allows applying changes", async () => {
    const user = userEvent.setup();
    vi.mocked(compileLatexAction).mockResolvedValue({
      ok: true,
      data: { success: true, heldId: "pdf-applied", cached: false },
    });

    const baseLatex = "\\documentclass{article}\n\\begin{document}\nLine 1: Old\n\\end{document}";
    const onChange = vi.fn();
    const onApplyProposal = vi.fn();

    const proposal = {
      baseLatex,
      hunks: [
        {
          id: "hunk-1",
          reason: "Update line 1",
          oldText: "Line 1: Old",
          newText: "Line 1: Tailored",
          start: baseLatex.indexOf("Line 1: Old"),
          end: baseLatex.indexOf("Line 1: Old") + "Line 1: Old".length,
          oldStartLine: 3,
          newStartLine: 3,
        },
      ],
    };

    const { rerender } = render(
      <LatexWorkspace
        code={baseLatex}
        onChange={onChange}
        downloadHref="/api/pdf?doc=base"
        pendingProposal={proposal}
        onApplyProposal={onApplyProposal}
      />,
    );

    // Shows review mode indicator and diff viewer
    expect(screen.getByText("Reviewing AI suggestions")).toBeInTheDocument();
    expect(screen.getByText("AI Proposed Changes")).toBeInTheDocument();
    expect(screen.getByText("Update line 1")).toBeInTheDocument();

    // Wait for initial compilation on mount to settle
    const applyBtn = await screen.findByRole("button", { name: /Done \/ Apply/i });
    await user.click(applyBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("Line 1: Tailored"),
    );
    expect(onApplyProposal).toHaveBeenCalledWith(
      expect.stringContaining("Line 1: Tailored"),
    );
    expect(compileLatexAction).toHaveBeenCalledWith({
      latex: expect.stringContaining("Line 1: Tailored"),
    });

    // Rerender after proposal applied (pendingProposal = null, code updated)
    rerender(
      <LatexWorkspace
        code="\\documentclass{article}\n\\begin{document}\nLine 1: Tailored\n\\end{document}"
        onChange={onChange}
        downloadHref="/api/pdf?doc=base"
        pendingProposal={null}
        onApplyProposal={onApplyProposal}
      />,
    );

    // Undo button is now available
    const undoBtn = screen.getByRole("button", { name: /Undo AI changes/i });
    expect(undoBtn).toBeInTheDocument();

    // Click Undo
    await user.click(undoBtn);
    expect(onChange).toHaveBeenCalledWith(baseLatex);
    expect(compileLatexAction).toHaveBeenCalledWith({ latex: baseLatex });
  });
});
