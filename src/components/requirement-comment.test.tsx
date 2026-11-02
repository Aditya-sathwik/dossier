import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RequirementComment } from "./requirement-comment";

describe("RequirementComment", () => {
  it("renders '+ Comment' button when empty and not read-only", () => {
    render(<RequirementComment />);
    expect(screen.getByRole("button", { name: "+ Comment" })).toBeInTheDocument();
  });

  it("clicking '+ Comment' enters editing mode with textarea", async () => {
    const user = userEvent.setup();
    render(<RequirementComment />);
    await user.click(screen.getByRole("button", { name: "+ Comment" }));

    const textarea = screen.getByLabelText("Comment for this requirement");
    expect(textarea).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("saves trimmed comment on Save click", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RequirementComment onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "+ Comment" }));
    const textarea = screen.getByLabelText("Comment for this requirement");
    await user.type(textarea, "  Highlight my Rust CLI project  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("Highlight my Rust CLI project");
  });

  it("routes empty save to onRemove", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onRemove = vi.fn();
    render(<RequirementComment value="Existing note" onSave={onSave} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByLabelText("Comment for this requirement");
    await user.clear(textarea);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });

  it("cancels editing and reverts text without calling onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RequirementComment value="Original note" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByLabelText("Comment for this requirement");
    await user.type(textarea, " modified");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Original note")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comment for this requirement")).not.toBeInTheDocument();
  });

  it("handles Cmd/Ctrl+Enter to save and Escape to cancel", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RequirementComment onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "+ Comment" }));
    const textarea = screen.getByLabelText("Comment for this requirement");
    await user.type(textarea, "Keyboard shortcut note{Enter}");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(onSave).toHaveBeenCalledWith("Keyboard shortcut note");
  });

  it("renders callout with Edit and Remove when value exists", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<RequirementComment value="My comment" onRemove={onRemove} />);

    expect(screen.getByText("My comment")).toBeInTheDocument();
    expect(screen.getByText("Note:")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("in readOnly mode, displays note if present without buttons, or returns null if empty", () => {
    const { unmount } = render(<RequirementComment value="Read only note" readOnly />);
    expect(screen.getByText("Read only note")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    const { container } = render(<RequirementComment readOnly />);
    expect(container).toBeEmptyDOMElement();
  });
});

