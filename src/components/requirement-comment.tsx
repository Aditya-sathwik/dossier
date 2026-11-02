"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type RequirementCommentProps = {
  value?: string;
  onSave?: (text: string) => void;
  onRemove?: () => void;
  readOnly?: boolean;
};

export function RequirementComment({
  value,
  readOnly = false,
  onSave,
  onRemove,
}: RequirementCommentProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setText(value ?? "");
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  const startEdit = () => {
    setText(value ?? "");
    setEditing(true);
  };

  const handleCancel = () => {
    setText(value ?? "");
    setEditing(false);
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onRemove?.();
    } else {
      onSave?.(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  if (readOnly) {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2.5 rounded-r-card border border-line-card border-l-2 border-l-primary bg-card/60 p-2.5 text-sm">
        <MessageSquare className="mt-0.5 size-3.5 flex-none text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-ink">Note: </span>
          <span className="whitespace-pre-wrap text-muted">{value}</span>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-line-input bg-input p-2.5">
        <textarea
          ref={textareaRef}
          aria-label="Comment for this requirement"
          rows={2}
          maxLength={1000}
          placeholder="Add a note or instruction for this requirement (e.g. project to highlight, specific tech)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full resize-y bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
          <span className="text-meta text-muted">
            {text.length}/1,000 characters
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="text" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-r-card border border-line-card border-l-2 border-l-primary bg-card/60 p-2.5 text-sm">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <MessageSquare className="mt-0.5 size-3.5 flex-none text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-ink">Note: </span>
            <span className="whitespace-pre-wrap text-muted">{value}</span>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <Button type="button" variant="text" size="sm" onClick={startEdit}>
            Edit
          </Button>
          <Button
            type="button"
            variant="text"
            size="sm"
            onClick={() => onRemove?.()}
            className="text-danger hover:text-error-strong"
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="inline-flex items-center gap-1.5 text-meta text-muted transition-colors hover:text-ink hover:underline"
    >
      <MessageSquare className="size-3.5 text-muted" aria-hidden="true" />
      <span>+ Comment</span>
    </button>
  );
}

