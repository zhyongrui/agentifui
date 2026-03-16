# P3-C Collaboration Semantics And Known Limits

## Scope

This guide describes the collaboration model currently shipped across:

- owner conversation surfaces
- shared read-only transcript surfaces
- presence
- comment threads
- `@email` mentions
- review inbox notifications

It is the reference point for future work in `P3-C-06` and `P3-C-07`.

## Current Roles

There are currently two effective collaboration access modes:

- owner
  - the conversation owner can edit conversation metadata
  - can create comments on message, run, and artifact targets
  - can create and revoke shared group links
- shared reviewer
  - access is granted through an active conversation share to one group
  - can open the shared transcript and shared artifact preview
  - can publish presence heartbeats on shared surfaces
  - cannot create comments yet
  - cannot send new chat messages
  - cannot change metadata, shares, or permissions

The future `commenter / editor / owner` split is not implemented yet.

## Presence Model

Presence is intentionally ephemeral.

- presence entries are session-based, not durable records
- owner and shared surfaces both heartbeat into the same conversation-scoped presence set
- stale presence is pruned by TTL rather than explicit disconnect
- the UI should treat presence as advisory, not transactional state

This means presence can lag or disappear without affecting the durable conversation record.

## Conversation Refresh Model

Conversation consistency is currently polling-based.

- `/chat/[conversationId]` refreshes durable state through periodic reads
- shared transcript surfaces refresh through the same read-side pattern
- there is no push transport or websocket channel yet

Implications:

- durable state is eventually consistent across viewers
- comments, run replay, transcript content, and notifications should be modeled as read-after-write durable records
- presence is the only intentionally soft state

## Comment Model

Comments are conversation-scoped durable records stored outside transcript/run JSON payloads.

- targets:
  - `message`
  - `run`
  - `artifact`
- comments are persisted in `workspace_comments`
- comments are projected back onto:
  - conversation messages
  - run detail
  - artifact preview
- shared surfaces can render comments read-only from the same durable payloads

Important:

- comments are not edited or deleted yet
- thread order is append-only by `created_at`
- comments survive app restarts because they are not embedded inside regenerated run/message payloads

## Mention Semantics

Mentions are intentionally simple for the first release.

- syntax is email-based only:
  - `@user@example.com`
- free-form display-name parsing is not implemented
- mention resolution is same-tenant only
- duplicate mentions are deduped by user
- self-mentions do not create notifications

Mentions only generate notifications when the mentioned user can already access the conversation:

- the owner always qualifies
- a reviewer qualifies when they belong to a currently active shared group for that conversation
- unresolved or inaccessible mentions stay as plain text in the comment body

This avoids creating review inbox links that lead to unauthorized conversations.

## Notification Model

Notifications are durable per-user records stored in `workspace_notifications`.

- current notification type:
  - `comment_mention`
- current states:
  - `unread`
  - `read`
- current surfaces:
  - `GET /workspace/notifications`
  - `PUT /workspace/notifications/:notificationId/read`
  - `/apps` review inbox

The inbox is intentionally lightweight:

- there is no global nav badge yet
- opening a conversation does not auto-mark notifications as read
- read-state changes are explicit

## Shared Surface Rules

Shared transcript and shared artifact routes are read-only by design.

- they can display:
  - transcript
  - presence chips
  - citations
  - safety summaries
  - artifacts
  - comments
- they cannot:
  - create comments
  - send messages
  - mutate conversation metadata
  - change read-state for owner-only collaboration controls

This keeps the current security boundary easy to reason about while collaboration write permissions are still coarse.

## Audit And Operational Notes

- comment creation is audited through `workspace.comment.created`
- the audit payload now includes:
  - `mentionCount`
  - `mentionedUserIds`
- notification reads are not separately audited yet
- backups must include:
  - `workspace_comments`
  - `workspace_notifications`

## Known Limits

- no `commenter / editor / owner` permission split yet
- no concurrent edit conflict detection for conversation metadata yet
- no comment edit/delete/reply model yet
- no nav-level unread badge yet
- no notification batching or digesting
- no auto-read on open
- no browser autocomplete for mention candidates
- no push transport; all durable collaboration updates are polling-based
- email mention syntax is strict and intentionally plain

## What To Update Next

When `P3-C-06` lands, update this guide first:

- access matrix
- which surfaces can write comments
- whether shared reviewers can mutate metadata

When `P3-C-07` lands, update:

- conflict-resolution rules
- merge/retry strategy
- any ETag or optimistic concurrency requirements
