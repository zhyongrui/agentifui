"use client";

import { useState } from "react";

import type { WorkspaceComment } from "@agentifui/shared/apps";

type WorkspaceCommentThreadProps = {
  comments: WorkspaceComment[];
  emptyText: string;
  helperText?: string;
  isSubmitting?: boolean;
  locale: string;
  readOnly?: boolean;
  submitError?: string | null;
  submitLabel: string;
  submittingLabel: string;
  textareaLabel: string;
  title: string;
  onSubmit?: (content: string) => Promise<void>;
};

export function WorkspaceCommentThread(props: WorkspaceCommentThreadProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit() {
    const nextDraft = draft.trim();

    if (!nextDraft || !props.onSubmit) {
      return;
    }

    await props.onSubmit(nextDraft);
    setDraft("");
  }

  return (
    <section className="workspace-comment-thread">
      <div className="workspace-comment-thread-header">
        <h3>{props.title}</h3>
        <span>{props.comments.length}</span>
      </div>
      {props.comments.length > 0 ? (
        <div className="workspace-comment-list">
          {props.comments.map((comment) => (
            <article key={comment.id} className="workspace-comment-card">
              <div className="workspace-comment-meta">
                <strong>{comment.authorDisplayName ?? "Unknown user"}</strong>
                <span>{new Date(comment.createdAt).toLocaleString(props.locale)}</span>
              </div>
              {comment.mentions && comment.mentions.length > 0 ? (
                <div className="workspace-comment-mentions">
                  {comment.mentions.map((mention) => (
                    <span key={`${comment.id}:${mention.userId}`} className="tag tag-muted">
                      @{mention.displayName ?? mention.email}
                    </span>
                  ))}
                </div>
              ) : null}
              <p>{comment.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="workspace-comment-empty">{props.emptyText}</p>
      )}
      {props.readOnly || !props.onSubmit ? null : (
        <div className="workspace-comment-composer">
          <label className="field">
            {props.textareaLabel}
            <textarea
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {props.helperText ? (
            <p className="workspace-comment-helper">{props.helperText}</p>
          ) : null}
          {props.submitError ? <div className="notice error">{props.submitError}</div> : null}
          <button
            className="primary"
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={draft.trim().length === 0 || props.isSubmitting}
          >
            {props.isSubmitting ? props.submittingLabel : props.submitLabel}
          </button>
        </div>
      )}
    </section>
  );
}
