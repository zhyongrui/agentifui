export type SliceId =
  | 'S1-1'
  | 'S1-2'
  | 'S1-3'
  | 'S2-1'
  | 'S2-2'
  | 'S2-3'
  | 'S3-1'
  | 'S3-2'
  | 'S3-3';

export const CURRENT_SLICE: SliceId = 'S1-1';

export type HealthResponse = {
  status: 'ok';
  service: 'web' | 'gateway';
  time: string;
};

export * from './auth/index.js';
export * from './apps/index.js';
export * from './chat/index.js';
export * from './admin/index.js';
export * from './knowledge/index.js';
