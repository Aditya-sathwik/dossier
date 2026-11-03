import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LatexEditor } from "./latex-editor";

describe("LatexEditor", () => {
  it("renders editor textarea and line numbers gutter", () => {
    const value = "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}";
    render(<LatexEditor value={value} onChange={vi.fn()} onCompile={vi.fn()} />);

    const textarea = screen.getByRole("textbox", { name: /latex source code editor/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(value);

    // Should have 4 line numbers
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    render(<LatexEditor value="hello" onChange={onChange} onCompile={vi.fn()} />);

    const textarea = screen.getByRole("textbox", { name: /latex source code editor/i });
    fireEvent.change(textarea, { target: { value: "hello world" } });

    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  it("handles readOnly prop correctly", () => {
    render(<LatexEditor value="test" onChange={vi.fn()} onCompile={vi.fn()} readOnly />);

    const textarea = screen.getByRole("textbox", { name: /latex source code editor/i });
    expect(textarea).toHaveAttribute("readonly");
  });

  it("shows 'Ask AI about selection' button when text is selected and calls callback on click", async () => {
    const onAskAiAboutSelection = vi.fn();
    const value = "Line 1\nLine 2 target\nLine 3";

    render(
      <LatexEditor
        value={value}
        onChange={vi.fn()}
        onCompile={vi.fn()}
        onAskAiAboutSelection={onAskAiAboutSelection}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: /latex source code editor/i }) as HTMLTextAreaElement;

    // Simulate selecting "Line 2 target"
    const start = value.indexOf("Line 2 target");
    const end = start + "Line 2 target".length;
    textarea.selectionStart = start;
    textarea.selectionEnd = end;

    fireEvent.select(textarea);

    const askButton = await screen.findByRole("button", { name: /ask ai about selection/i });
    expect(askButton).toBeInTheDocument();
    expect(askButton).toHaveTextContent("Ask AI about selection (L2)");

    await userEvent.click(askButton);

    expect(onAskAiAboutSelection).toHaveBeenCalledWith({
      text: "Line 2 target",
      startLine: 2,
      endLine: 2,
    });
  });

  it("triggers onCompile on Cmd+Enter", () => {
    const onCompile = vi.fn();
    render(<LatexEditor value="test" onChange={vi.fn()} onCompile={onCompile} />);

    const textarea = screen.getByRole("textbox", { name: /latex source code editor/i });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onCompile).toHaveBeenCalled();
  });
});

