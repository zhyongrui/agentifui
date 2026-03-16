import type {
  KnowledgeRetrievalMatch,
  KnowledgeRetrievalQuery,
} from '@agentifui/shared';

export const KNOWLEDGE_RETRIEVAL_DEFAULT_LIMIT = 4;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function tokenizeQuery(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => token.trim())
    .filter(Boolean);
}

function clampLimit(value: number | null | undefined) {
  if (!value || Number.isNaN(value)) {
    return KNOWLEDGE_RETRIEVAL_DEFAULT_LIMIT;
  }

  return Math.min(8, Math.max(1, Math.trunc(value)));
}

export function buildKnowledgeRetrievalQuery(input: {
  appId: string;
  conversationId: string | null;
  groupId: string | null;
  latestPrompt: string;
  limit?: number | null;
}): KnowledgeRetrievalQuery {
  return {
    appId: input.appId,
    conversationId: input.conversationId,
    groupId: input.groupId,
    queryText: normalizeWhitespace(input.latestPrompt),
    limit: clampLimit(input.limit),
  };
}

export function scoreKnowledgeMatch(
  query: KnowledgeRetrievalQuery,
  candidate: Pick<
    KnowledgeRetrievalMatch,
    'content' | 'headingPath' | 'labels' | 'preview' | 'title'
  >,
) {
  const normalizedQuery = query.queryText.toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const tokens = tokenizeQuery(query.queryText);
  const body = [candidate.title, candidate.preview, candidate.content, ...candidate.headingPath]
    .join(' ')
    .toLowerCase();
  const labelBody = candidate.labels.join(' ').toLowerCase();
  let score = 0;

  if (body.includes(normalizedQuery)) {
    score += 10;
  }

  for (const token of tokens) {
    if (body.includes(token)) {
      score += 2;
    }

    if (labelBody.includes(token)) {
      score += 1;
    }
  }

  if (candidate.headingPath.some(heading => normalizedQuery.includes(heading.toLowerCase()))) {
    score += 2;
  }

  return score;
}

export function rankKnowledgeMatches(
  query: KnowledgeRetrievalQuery,
  matches: KnowledgeRetrievalMatch[],
) {
  return matches
    .map(match => ({
      ...match,
      score: scoreKnowledgeMatch(query, match),
    }))
    .filter(match => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.headingPath.length !== left.headingPath.length) {
        return right.headingPath.length - left.headingPath.length;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, query.limit)
    .map(({ score, ...match }) => ({
      ...match,
      score,
    }));
}
