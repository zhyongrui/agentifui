export const schemaModules = [
  'tenants',
  'groups',
  'users',
  'group_members',
  'auth_identities',
  'invitations',
  'mfa_factors',
  'audit_events',
  'auth_sessions',
  'auth_challenges',
] as const;

export type SchemaModule = (typeof schemaModules)[number];

export * from './schema/index.js';
export * from './runtime.js';
