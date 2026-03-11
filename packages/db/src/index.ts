export const schemaModules = [
  'tenants',
  'groups',
  'users',
  'group_members',
  'auth_identities',
  'invitations',
  'mfa_factors',
  'audit_events',
] as const;

export type SchemaModule = (typeof schemaModules)[number];
