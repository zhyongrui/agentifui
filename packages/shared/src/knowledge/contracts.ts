export type KnowledgeSourceKind = 'url' | 'markdown' | 'file';

export type KnowledgeSourceScope = 'tenant' | 'group';

export type KnowledgeIngestionStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed';

export type KnowledgeChunkingStrategy = 'markdown_sections' | 'paragraph_windows';

export type KnowledgeSourceOwner = {
  userId: string;
  email: string;
  displayName: string | null;
};

export type KnowledgeSourceChunking = {
  strategy: KnowledgeChunkingStrategy;
  targetChunkChars: number;
  overlapChars: number;
  lastChunkedAt: string | null;
};

export type KnowledgeSourceChunk = {
  id: string;
  sourceId: string;
  sequence: number;
  strategy: KnowledgeChunkingStrategy;
  headingPath: string[];
  preview: string;
  content: string;
  charCount: number;
  tokenEstimate: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSource = {
  id: string;
  tenantId: string;
  scope: KnowledgeSourceScope;
  groupId: string | null;
  title: string;
  sourceKind: KnowledgeSourceKind;
  sourceUri: string | null;
  labels: string[];
  owner: KnowledgeSourceOwner;
  status: KnowledgeIngestionStatus;
  hasContent: boolean;
  chunkCount: number;
  chunking: KnowledgeSourceChunking;
  lastError: string | null;
  updatedSourceAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSourceListFilters = {
  status?: KnowledgeIngestionStatus;
  scope?: KnowledgeSourceScope;
  groupId?: string;
  q?: string;
};

export type KnowledgeSourceStatusCount = {
  status: KnowledgeIngestionStatus;
  count: number;
};

export type KnowledgeSourceListResponse = {
  ok: true;
  data: {
    generatedAt: string;
    filters: KnowledgeSourceListFilters;
    statusCounts: KnowledgeSourceStatusCount[];
    sources: KnowledgeSource[];
  };
};

export type KnowledgeSourceCreateRequest = {
  title: string;
  sourceKind: KnowledgeSourceKind;
  sourceUri: string | null;
  content: string | null;
  scope: KnowledgeSourceScope;
  groupId: string | null;
  labels: string[];
  updatedSourceAt: string | null;
};

export type KnowledgeSourceCreateResponse = {
  ok: true;
  data: KnowledgeSource;
};

export type KnowledgeSourceStatusUpdateRequest = {
  status: KnowledgeIngestionStatus;
  chunkCount: number | null;
  content?: string | null;
  lastError: string | null;
};

export type KnowledgeSourceStatusUpdateResponse = {
  ok: true;
  data: KnowledgeSource;
};

export type KnowledgeSourceChunksResponse = {
  ok: true;
  data: {
    sourceId: string;
    chunks: KnowledgeSourceChunk[];
  };
};
