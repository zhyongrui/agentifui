import type { WorkspaceCommentMention } from "@agentifui/shared/apps";

const WORKSPACE_COMMENT_MENTION_EMAIL_PATTERN =
  /(^|[\s([<{])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

export function normalizeWorkspaceCommentContent(content: string) {
  return content.trim().replace(/\s+\n/g, "\n").slice(0, 2000);
}

export function extractWorkspaceCommentMentionEmails(content: string): string[] {
  const normalized = normalizeWorkspaceCommentContent(content);
  const emails = new Set<string>();

  for (const match of normalized.matchAll(WORKSPACE_COMMENT_MENTION_EMAIL_PATTERN)) {
    const email = match[2]?.trim().toLowerCase();

    if (email) {
      emails.add(email);
    }
  }

  return [...emails];
}

export function buildWorkspaceCommentPreview(content: string, maxLength = 160) {
  const compact = normalizeWorkspaceCommentContent(content).replace(/\s+/g, " ");

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function dedupeWorkspaceCommentMentions(
  mentions: WorkspaceCommentMention[],
): WorkspaceCommentMention[] {
  const mentionsByUserId = new Map<string, WorkspaceCommentMention>();

  for (const mention of mentions) {
    if (!mentionsByUserId.has(mention.userId)) {
      mentionsByUserId.set(mention.userId, mention);
    }
  }

  return [...mentionsByUserId.values()];
}
