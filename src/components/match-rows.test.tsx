import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Match, Requirement } from "@/lib/application-data";
import { withSkillAdded } from "@/lib/application-data";
import { MatchRows } from "./match-rows";

const requirements: Requirement[] = [
  { text: "Experience with Rust", kind: "skill", skill: "Rust", years: null, language: null },
  { text: "Experience with Rust", kind: "skill", skill: "Rust", years: null, language: null },
];

const match: Match = {
  items: [
    {
      requirement: "Experience with Rust",
      result: "gap",
      skill: "Rust",
      experienceIds: [],
      note: "Nothing in profile",
      comment: "First row comment",
    },
    {
      requirement: "Experience with Rust",
      result: "gap",
      skill: "Rust",
      experienceIds: [],
      note: "Nothing in profile",
    },
  ],
};

describe("MatchRows comments integration", () => {
  it("renders existing comments and '+ Comment' for items without comments", () => {
    const onCommentChange = vi.fn();
    render(
      <MatchRows
        match={match}
        requirements={requirements}
        onAddSkill={vi.fn()}
        onCommentChange={onCommentChange}
      />,
    );

    expect(screen.getByText("First row comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Comment" })).toBeInTheDocument();
  });

  it("targets exact row by index even with duplicate requirement text", async () => {
    const user = userEvent.setup();
    const onCommentChange = vi.fn();
    render(
      <MatchRows
        match={match}
        requirements={requirements}
        onAddSkill={vi.fn()}
        onCommentChange={onCommentChange}
      />,
    );

    // Click + Comment on the second row (which has no comment)
    await user.click(screen.getByRole("button", { name: "+ Comment" }));
    const textarea = screen.getByLabelText("Comment for this requirement");
    await user.type(textarea, "Second row unique comment");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onCommentChange).toHaveBeenCalledWith(1, "Experience with Rust", "Second row unique comment");
  });

  it("renders readOnly mode without '+ Comment' or edit buttons", () => {
    render(
      <MatchRows
        match={match}
        requirements={requirements}
        onAddSkill={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByText("First row comment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("preserves comment when adding skill via withSkillAdded", () => {
    const itemWithComment = match.items[0];
    const updated = withSkillAdded(itemWithComment, "Rust");
    expect(updated.comment).toBe("First row comment");
    expect(updated.result).toBe("partial");
  });
});

