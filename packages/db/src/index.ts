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
  'better_auth_accounts',
  'better_auth_sessions',
  'better_auth_verifications',
  'rbac_roles',
  'rbac_user_roles',
  'workspace_apps',
  'workspace_app_access_grants',
  'workspace_group_app_grants',
  'workspace_user_preferences',
  'workspace_quota_limits',
  'conversations',
  'runs',
  'run_timeline_events',
  'workspace_uploaded_files',
  'workspace_artifacts',
  'knowledge_sources',
  'knowledge_source_chunks',
  'workspace_app_launches',
  'workspace_conversation_shares',
] as const;

export type SchemaModule = (typeof schemaModules)[number];

export * from './schema/index.js';
export * from './runtime.js';
