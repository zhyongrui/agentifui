import type {
  KnowledgeChunkingStrategy,
  KnowledgeSourceChunk,
  KnowledgeSourceKind,
} from '@agentifui/shared';

type KnowledgeChunkDraft = Omit<
  KnowledgeSourceChunk,
  'createdAt' | 'id' | 'sourceId' | 'updatedAt'
>;

type KnowledgeChunkingPlan = {
  strategy: KnowledgeChunkingStrategy;
  targetChunkChars: number;
  overlapChars: number;
  chunks: KnowledgeChunkDraft[];
};

type ChunkingProfile = Omit<KnowledgeChunkingPlan, 'chunks'>;

const CHUNKING_PROFILES: Record<KnowledgeSourceKind, ChunkingProfile> = {
  url: {
    strategy: 'paragraph_windows',
    targetChunkChars: 1000,
    overlapChars: 120,
  },
  file: {
    strategy: 'paragraph_windows',
    targetChunkChars: 1000,
    overlapChars: 120,
  },
  markdown: {
    strategy: 'markdown_sections',
    targetChunkChars: 1200,
    overlapChars: 160,
  },
};

function normalizeContent(value: string) {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildPreview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function tailOverlap(text: string, overlapChars: number) {
  if (overlapChars <= 0 || text.length <= overlapChars) {
    return text;
  }

  return text.slice(text.length - overlapChars).trim();
}

function buildChunkDraft(
  sequence: number,
  strategy: KnowledgeChunkingStrategy,
  headingPath: string[],
  content: string,
): KnowledgeChunkDraft {
  return {
    sequence,
    strategy,
    headingPath,
    preview: buildPreview(content),
    content,
    charCount: content.length,
    tokenEstimate: estimateTokenCount(content),
  };
}

function packParagraphs(
  paragraphs: string[],
  profile: ChunkingProfile,
  headingPath: string[],
  sequenceStart: number,
) {
  const chunks: KnowledgeChunkDraft[] = [];
  let sequence = sequenceStart;
  let current = '';

  for (const paragraph of paragraphs) {
    const nextCandidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (current && nextCandidate.length > profile.targetChunkChars) {
      chunks.push(buildChunkDraft(sequence, profile.strategy, headingPath, current));
      sequence += 1;

      const overlap = tailOverlap(current, profile.overlapChars);
      current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
      continue;
    }

    current = nextCandidate;
  }

  if (current) {
    chunks.push(buildChunkDraft(sequence, profile.strategy, headingPath, current));
  }

  return chunks;
}

function chunkParagraphWindows(content: string, profile: ChunkingProfile, headingPath: string[] = []) {
  const paragraphs = normalizeContent(content)
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [] as KnowledgeChunkDraft[];
  }

  return packParagraphs(paragraphs, profile, headingPath, 0);
}

function chunkMarkdownSections(content: string, profile: ChunkingProfile) {
  const normalized = normalizeContent(content);
  const lines = normalized.split('\n');
  const sections: Array<{ headingPath: string[]; text: string }> = [];
  let headingPath: string[] = [];
  let buffer: string[] = [];

  function flushBuffer() {
    const text = buffer.join('\n').trim();

    if (!text) {
      buffer = [];
      return;
    }

    sections.push({
      headingPath: [...headingPath],
      text,
    });
    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line.trim());

    if (!headingMatch) {
      buffer.push(line);
      continue;
    }

    flushBuffer();

    const hashes = headingMatch[1];
    const rawTitle = headingMatch[2];

    if (!hashes || rawTitle === undefined) {
      buffer.push(line);
      continue;
    }

    const level = hashes.length;
    const title = rawTitle.trim();

    headingPath = [...headingPath.slice(0, level - 1), title];
    buffer.push(line);
  }

  flushBuffer();

  if (sections.length === 0) {
    return chunkParagraphWindows(normalized, profile);
  }

  const chunks: KnowledgeChunkDraft[] = [];
  let nextSequence = 0;

  for (const section of sections) {
    const sectionChunks = packParagraphs(
      section.text.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean),
      profile,
      section.headingPath,
      nextSequence,
    );

    chunks.push(...sectionChunks);
    nextSequence = chunks.length;
  }

  return chunks;
}

function resolveChunkingProfile(sourceKind: KnowledgeSourceKind, content: string): ChunkingProfile {
  if (sourceKind === 'markdown') {
    return CHUNKING_PROFILES.markdown;
  }

  if (/^#{1,6}\s/m.test(content)) {
    return CHUNKING_PROFILES.markdown;
  }

  return CHUNKING_PROFILES[sourceKind];
}

function buildKnowledgeChunkPlan(input: {
  content: string;
  sourceKind: KnowledgeSourceKind;
}): KnowledgeChunkingPlan {
  const normalized = normalizeContent(input.content);

  if (!normalized) {
    const profile = resolveChunkingProfile(input.sourceKind, '');

    return {
      ...profile,
      chunks: [],
    };
  }

  const profile = resolveChunkingProfile(input.sourceKind, normalized);
  const chunks =
    profile.strategy === 'markdown_sections'
      ? chunkMarkdownSections(normalized, profile)
      : chunkParagraphWindows(normalized, profile);

  return {
    ...profile,
    chunks,
  };
}

export {
  CHUNKING_PROFILES,
  buildKnowledgeChunkPlan,
  buildPreview,
  chunkMarkdownSections,
  chunkParagraphWindows,
  estimateTokenCount,
  normalizeContent,
  resolveChunkingProfile,
};
export type { KnowledgeChunkDraft, KnowledgeChunkingPlan };
