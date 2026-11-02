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
});
