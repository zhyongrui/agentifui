import type { DatabaseClient } from '@agentifui/db';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  AdminAuditDatePreset,
  AdminIdentityAccessRequest,
  AdminIdentityDomainClaim,
  AdminBreakGlassSession,
  AdminTenantGovernanceSettings,
  AdminTenantSummary,
} from '@agentifui/shared/admin';
import { randomUUID } from 'node:crypto';

import type { AdminMutationResult, AdminService } from './admin-service.js';
import { resolveDefaultMemberGroupIds, resolveDefaultRoleIds } from './workspace-catalog-fixtures.js';

type IdentitySupport = Pick<
  AdminService,
  | 'getIdentityOverviewForUser'
  | 'createDomainClaimForUser'
  | 'reviewDomainClaimForUser'
  | 'reviewAccessRequestForUser'
  | 'resetUserMfaForUser'
  | 'createBreakGlassSessionForUser'
  | 'updateBreakGlassSessionForUser'
  | 'updateTenantGovernanceForUser'
  | 'resolveSsoProviderForEmail'
  | 'capturePendingAccessRequest'
>;

type TenantSummaryRow = {
  admin_count: number;
  app_count: number;
  created_at: Date | string;
  group_count: number;
  id: string;
  metadata: Record<string, unknown> | string;
  name: string;
  primary_admin_display_name: string | null;
  primary_admin_email: string | null;
  primary_admin_id: string | null;
  slug: string;
  status: AdminTenantSummary['status'];
  updated_at: Date | string;
  user_count: number;
};

type DomainClaimRow = {
  created_at: Date | string;
  domain: string;
  id: string;
  jit_user_status: AdminIdentityDomainClaim['jitUserStatus'];
  provider_id: string;
  requested_by_user_id: string;
  review_reason: string | null;
  reviewed_at: Date | string | null;
  reviewed_by_user_id: string | null;
  status: AdminIdentityDomainClaim['status'];
  tenant_id: string;
  tenant_name: string | null;
};

type AccessRequestRow = {
  created_at: Date | string;
  display_name: string | null;
  domain_claim_id: string | null;
  email: string;
  id: string;
  reason: string | null;
  requested_by_user_id: string | null;
  review_reason: string | null;
  reviewed_at: Date | string | null;
  reviewed_by_user_id: string | null;
  source: AdminIdentityAccessRequest['source'];
  status: AdminIdentityAccessRequest['status'];
  target_tenant_id: string | null;
  target_tenant_name: string | null;
  tenant_id: string;
  tenant_name: string | null;
  user_id: string | null;
};

type BreakGlassRow = {
  actor_user_email: string | null;
  actor_user_id: string;
  created_at: Date | string;
  expires_at: Date | string;
  id: string;
  justification: string | null;
  reason: string;
  review_notes: string | null;
  reviewed_at: Date | string | null;
  reviewed_by_user_id: string | null;
  status: AdminBreakGlassSession['status'];
  tenant_id: string;
  tenant_name: string | null;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeJsonRecord(value: Record<string, unknown> | string) {
  if (typeof value !== 'string') {
    return value ?? {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function buildDefaultGovernance(tenantId: string): AdminTenantGovernanceSettings {
  return {
    tenantId,
    legalHoldEnabled: false,
    retentionOverrideDays: null,
    scimPlanning: {
      enabled: false,
      ownerEmail: null,
      notes: null,
    },
    policyPack: {
      runtimeMode: 'standard',
      retrievalMode: 'allowed',
      sharingMode: 'editor',
      artifactDownloadMode: 'shared_readers',
      exportMode: 'allowed',
      retentionMode: 'standard',
    },
  };
}

function normalizeGovernanceSettings(
  tenantId: string,
  metadata: Record<string, unknown> | string
): AdminTenantGovernanceSettings {
  const normalizedMetadata = normalizeJsonRecord(metadata);
  const governanceRecord =
    typeof normalizedMetadata.governance === 'object' && normalizedMetadata.governance !== null
      ? (normalizedMetadata.governance as Record<string, unknown>)
      : {};
  const scimPlanningRecord =
    typeof governanceRecord.scimPlanning === 'object' && governanceRecord.scimPlanning !== null
      ? (governanceRecord.scimPlanning as Record<string, unknown>)
      : {};
  const policyPackRecord =
    typeof governanceRecord.policyPack === 'object' && governanceRecord.policyPack !== null
      ? (governanceRecord.policyPack as Record<string, unknown>)
      : {};
  const defaultValue = buildDefaultGovernance(tenantId);

  return {
    tenantId,
    legalHoldEnabled:
      typeof governanceRecord.legalHoldEnabled === 'boolean'
        ? governanceRecord.legalHoldEnabled
        : defaultValue.legalHoldEnabled,
    retentionOverrideDays:
      typeof governanceRecord.retentionOverrideDays === 'number'
        ? governanceRecord.retentionOverrideDays
        : governanceRecord.retentionOverrideDays === null
          ? null
          : defaultValue.retentionOverrideDays,
    scimPlanning: {
      enabled:
        typeof scimPlanningRecord.enabled === 'boolean'
          ? scimPlanningRecord.enabled
          : defaultValue.scimPlanning.enabled,
      ownerEmail:
        typeof scimPlanningRecord.ownerEmail === 'string'
          ? scimPlanningRecord.ownerEmail
          : scimPlanningRecord.ownerEmail === null
            ? null
            : defaultValue.scimPlanning.ownerEmail,
      notes:
        typeof scimPlanningRecord.notes === 'string'
          ? scimPlanningRecord.notes
          : scimPlanningRecord.notes === null
            ? null
            : defaultValue.scimPlanning.notes,
    },
    policyPack: {
      runtimeMode:
        policyPackRecord.runtimeMode === 'strict' ||
        policyPackRecord.runtimeMode === 'degraded' ||
        policyPackRecord.runtimeMode === 'standard'
          ? policyPackRecord.runtimeMode
          : defaultValue.policyPack.runtimeMode,
      retrievalMode:
        policyPackRecord.retrievalMode === 'flagged' ||
        policyPackRecord.retrievalMode === 'blocked' ||
        policyPackRecord.retrievalMode === 'allowed'
          ? policyPackRecord.retrievalMode
          : defaultValue.policyPack.retrievalMode,
      sharingMode:
        policyPackRecord.sharingMode === 'read_only' ||
        policyPackRecord.sharingMode === 'commenter' ||
        policyPackRecord.sharingMode === 'editor'
          ? policyPackRecord.sharingMode
          : defaultValue.policyPack.sharingMode,
      artifactDownloadMode:
        policyPackRecord.artifactDownloadMode === 'owner_only' ||
        policyPackRecord.artifactDownloadMode === 'shared_readers'
          ? policyPackRecord.artifactDownloadMode
          : defaultValue.policyPack.artifactDownloadMode,
      exportMode:
        policyPackRecord.exportMode === 'approval_required' ||
        policyPackRecord.exportMode === 'blocked' ||
        policyPackRecord.exportMode === 'allowed'
          ? policyPackRecord.exportMode
          : defaultValue.policyPack.exportMode,
      retentionMode:
        policyPackRecord.retentionMode === 'strict' ||
        policyPackRecord.retentionMode === 'legal_hold' ||
        policyPackRecord.retentionMode === 'standard'
          ? policyPackRecord.retentionMode
          : defaultValue.policyPack.retentionMode,
    },
  };
}

function buildGovernanceMetadataPatch(value: AdminTenantGovernanceSettings) {
  return {
    governance: {
      legalHoldEnabled: value.legalHoldEnabled,
      retentionOverrideDays: value.retentionOverrideDays,
      scimPlanning: value.scimPlanning,
      policyPack: value.policyPack,
    },
  };
}

function toMutationError(
  code: 'ADMIN_INVALID_PAYLOAD' | 'ADMIN_NOT_FOUND' | 'ADMIN_CONFLICT',
  message: string,
  details: unknown,
  statusCode: 400 | 404 | 409
) {
  return {
    ok: false as const,
    statusCode,
    code,
    message,
    details,
  };
}

function toTenantSummary(row: TenantSummaryRow): AdminTenantSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
    userCount: row.user_count,
    groupCount: row.group_count,
    appCount: row.app_count,
    adminCount: row.admin_count,
    primaryAdmin: row.primary_admin_id
      ? {
          id: row.primary_admin_id,
          email: row.primary_admin_email ?? '',
          displayName: row.primary_admin_display_name ?? row.primary_admin_email ?? 'Tenant admin',
        }
      : null,
  };
}

function toDomainClaim(row: DomainClaimRow): AdminIdentityDomainClaim {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    domain: row.domain,
    providerId: row.provider_id,
    status: row.status,
    jitUserStatus: row.jit_user_status,
    requestedAt: toIso(row.created_at)!,
    requestedByUserId: row.requested_by_user_id,
    reviewedAt: toIso(row.reviewed_at),
    reviewedByUserId: row.reviewed_by_user_id,
    reviewReason: row.review_reason,
  };
}

function toAccessRequest(row: AccessRequestRow): AdminIdentityAccessRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    source: row.source,
    status: row.status,
    requestedAt: toIso(row.created_at)!,
    requestedByUserId: row.requested_by_user_id,
    domainClaimId: row.domain_claim_id,
    reason: row.reason,
    targetTenantId: row.target_tenant_id,
    targetTenantName: row.target_tenant_name,
    reviewedAt: toIso(row.reviewed_at),
    reviewedByUserId: row.reviewed_by_user_id,
    reviewReason: row.review_reason,
  };
}

function toBreakGlassSession(row: BreakGlassRow): AdminBreakGlassSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    actorUserId: row.actor_user_id,
    actorUserEmail: row.actor_user_email,
    reason: row.reason,
    justification: row.justification,
    createdAt: toIso(row.created_at)!,
    expiresAt: toIso(row.expires_at)!,
    status: row.status,
    reviewedAt: toIso(row.reviewed_at),
    reviewedByUserId: row.reviewed_by_user_id,
    reviewNotes: row.review_notes,
  };
}

async function listRoleIdsForUser(database: DatabaseClient, user: AuthUser) {
  const rows = await database<{ role_id: string }[]>`
    select role_id
    from rbac_user_roles
    where user_id = ${user.id}
      and (expires_at is null or expires_at > now())
    order by created_at asc
  `;

  return rows.length > 0 ? rows.map(row => row.role_id) : resolveDefaultRoleIds(user.email);
}

async function findTenantSummary(database: DatabaseClient, tenantId: string) {
  const [row] = await database<TenantSummaryRow[]>`
    select
      t.id,
      t.slug,
      t.name,
      t.status,
      t.metadata,
      t.created_at,
      t.updated_at,
      (
        select count(*)::int
        from users u
        where u.tenant_id = t.id
      ) as user_count,
      (
        select count(*)::int
        from groups g
        where g.tenant_id = t.id
      ) as group_count,
      (
        select count(*)::int
        from workspace_apps a
        where a.tenant_id = t.id
      ) as app_count,
      (
        select count(distinct rur.user_id)::int
        from rbac_user_roles rur
        where rur.tenant_id = t.id
          and rur.role_id in ('tenant_admin', 'root_admin')
          and (rur.expires_at is null or rur.expires_at > now())
      ) as admin_count,
      (
        select u.id
        from rbac_user_roles rur
        inner join users u on u.id = rur.user_id
        where rur.tenant_id = t.id
          and rur.role_id in ('tenant_admin', 'root_admin')
          and (rur.expires_at is null or rur.expires_at > now())
        order by rur.created_at asc, u.created_at asc
        limit 1
      ) as primary_admin_id,
      (
        select u.email
        from rbac_user_roles rur
        inner join users u on u.id = rur.user_id
        where rur.tenant_id = t.id
          and rur.role_id in ('tenant_admin', 'root_admin')
          and (rur.expires_at is null or rur.expires_at > now())
        order by rur.created_at asc, u.created_at asc
        limit 1
      ) as primary_admin_email,
      (
        select u.display_name
        from rbac_user_roles rur
        inner join users u on u.id = rur.user_id
        where rur.tenant_id = t.id
          and rur.role_id in ('tenant_admin', 'root_admin')
          and (rur.expires_at is null or rur.expires_at > now())
        order by rur.created_at asc, u.created_at asc
        limit 1
      ) as primary_admin_display_name
    from tenants t
    where t.id = ${tenantId}
    limit 1
  `;

  return row ? toTenantSummary(row) : null;
}

async function findTenantMetadata(database: DatabaseClient, tenantId: string) {
  const [row] = await database<TenantSummaryRow[]>`
    select
      t.id,
      t.slug,
      t.name,
      t.status,
      t.metadata,
      t.created_at,
      t.updated_at,
      0::int as user_count,
      0::int as group_count,
      0::int as app_count,
      0::int as admin_count,
      null::varchar as primary_admin_id,
      null::varchar as primary_admin_email,
      null::varchar as primary_admin_display_name
    from tenants t
    where t.id = ${tenantId}
    limit 1
  `;

  return row ?? null;
}

export function resolveAuditPresetWindow(
  preset: AdminAuditDatePreset | null | undefined
): { occurredAfter: string | null; occurredBefore: string | null } {
  if (!preset) {
    return {
      occurredAfter: null,
      occurredBefore: null,
    };
  }

  const now = Date.now();
  const durationMsByPreset: Record<AdminAuditDatePreset, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };

  return {
    occurredAfter: new Date(now - durationMsByPreset[preset]).toISOString(),
    occurredBefore: new Date(now).toISOString(),
  };
}

export function createPersistentAdminIdentitySupport(database: DatabaseClient): IdentitySupport {
  return {
    async getIdentityOverviewForUser(user, input = {}) {
      const roleIds = await listRoleIdsForUser(database, user);
      const canReadPlatformAdmin = roleIds.includes('root_admin');
      const targetTenantId =
        canReadPlatformAdmin && input.tenantId?.trim() ? input.tenantId.trim() : user.tenantId;

      await database`
        update admin_break_glass_sessions
        set status = 'expired',
            updated_at = now()
        where status = 'active'
          and expires_at < now()
      `;

      const [tenant, metadataRow, domainRows, requestRows, breakGlassRows] = await Promise.all([
        findTenantSummary(database, targetTenantId),
        findTenantMetadata(database, targetTenantId),
        database<DomainClaimRow[]>`
          select
            c.id,
            c.tenant_id,
            t.name as tenant_name,
            c.domain,
            c.provider_id,
            c.status,
            c.jit_user_status,
            c.requested_by_user_id,
            c.review_reason,
            c.reviewed_by_user_id,
            c.reviewed_at,
            c.created_at
          from sso_domain_claims c
          inner join tenants t on t.id = c.tenant_id
          where c.tenant_id = ${targetTenantId}
          order by c.created_at desc
        `,
        database<AccessRequestRow[]>`
          select
            r.id,
            r.tenant_id,
            t.name as tenant_name,
            r.user_id,
            r.email,
            r.display_name,
            r.source,
            r.status,
            r.reason,
            r.domain_claim_id,
            r.target_tenant_id,
            tt.name as target_tenant_name,
            r.requested_by_user_id,
            r.review_reason,
            r.reviewed_by_user_id,
            r.reviewed_at,
            r.created_at
          from admin_access_requests r
          inner join tenants t on t.id = r.tenant_id
          left join tenants tt on tt.id = r.target_tenant_id
          where r.tenant_id = ${targetTenantId}
          order by r.created_at desc
        `,
        database<BreakGlassRow[]>`
          select
            s.id,
            s.tenant_id,
            t.name as tenant_name,
            s.actor_user_id,
            u.email as actor_user_email,
            s.reason,
            s.justification,
            s.status,
            s.expires_at,
            s.review_notes,
            s.reviewed_by_user_id,
            s.reviewed_at,
            s.created_at
          from admin_break_glass_sessions s
          inner join tenants t on t.id = s.tenant_id
          inner join users u on u.id = s.actor_user_id
          where s.tenant_id = ${targetTenantId}
          order by s.created_at desc
        `,
      ]);

      return {
        tenant,
        domainClaims: domainRows.map(toDomainClaim),
        pendingAccessRequests: requestRows.map(toAccessRequest),
        breakGlassSessions: breakGlassRows.map(toBreakGlassSession),
        governance: metadataRow ? normalizeGovernanceSettings(metadataRow.id, metadataRow.metadata) : null,
      };
    },
    async createDomainClaimForUser(user, input) {
      const roleIds = await listRoleIdsForUser(database, user);
      const canReadPlatformAdmin = roleIds.includes('root_admin');
      const tenantId =
        canReadPlatformAdmin && input.tenantId?.trim() ? input.tenantId.trim() : user.tenantId;
      const domain = input.domain.trim().toLowerCase();
      const providerId = input.providerId.trim();

      if (!tenantId || !domain || !providerId) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Domain claims require a tenant, domain and provider id.',
          undefined,
          400
        );
      }

      const tenant = await findTenantSummary(database, tenantId);

      if (!tenant) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target tenant could not be found.', { tenantId }, 404);
      }

      const [existingRow] = await database<{ id: string }[]>`
        select id
        from sso_domain_claims
        where domain = ${domain}
        limit 1
      `;

      if (existingRow) {
        return toMutationError('ADMIN_CONFLICT', 'This domain already has a claim.', { domain }, 409);
      }

      const reviewedAt = canReadPlatformAdmin ? new Date().toISOString() : null;
      const [row] = await database<DomainClaimRow[]>`
        insert into sso_domain_claims (
          id,
          tenant_id,
          domain,
          provider_id,
          status,
          jit_user_status,
          requested_by_user_id,
          review_reason,
          reviewed_by_user_id,
          reviewed_at,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${domain},
          ${providerId},
          ${canReadPlatformAdmin ? 'approved' : 'pending'},
          ${input.jitUserStatus},
          ${user.id},
          null,
          ${canReadPlatformAdmin ? user.id : null},
          ${reviewedAt}::timestamptz,
          now(),
          now()
        )
        returning
          id,
          tenant_id,
          ${tenant.name}::varchar as tenant_name,
          domain,
          provider_id,
          status,
          jit_user_status,
          requested_by_user_id,
          review_reason,
          reviewed_by_user_id,
          reviewed_at,
          created_at
      `;

      if (!row) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'The domain claim could not be created.',
          {
            domain,
            tenantId,
          },
          409
        );
      }

      return {
        ok: true,
        data: {
          claim: toDomainClaim(row),
        },
      };
    },
    async reviewDomainClaimForUser(user, input) {
      const [row] = await database<DomainClaimRow[]>`
        update sso_domain_claims c
        set status = ${input.status},
            review_reason = ${input.reviewReason?.trim() || null},
            reviewed_by_user_id = ${user.id},
            reviewed_at = now(),
            updated_at = now()
        from tenants t
        where c.id = ${input.claimId}
          and t.id = c.tenant_id
        returning
          c.id,
          c.tenant_id,
          t.name as tenant_name,
          c.domain,
          c.provider_id,
          c.status,
          c.jit_user_status,
          c.requested_by_user_id,
          c.review_reason,
          c.reviewed_by_user_id,
          c.reviewed_at,
          c.created_at
      `;

      if (!row) {
        return toMutationError('ADMIN_NOT_FOUND', 'The domain claim could not be found.', { claimId: input.claimId }, 404);
      }

      return {
        ok: true,
        data: {
          claim: toDomainClaim(row),
        },
      };
    },
    async reviewAccessRequestForUser(user, input) {
      const [existingRow] = await database<AccessRequestRow[]>`
        select
          r.id,
          r.tenant_id,
          t.name as tenant_name,
          r.user_id,
          r.email,
          r.display_name,
          r.source,
          r.status,
          r.reason,
          r.domain_claim_id,
          r.target_tenant_id,
          tt.name as target_tenant_name,
          r.requested_by_user_id,
          r.review_reason,
          r.reviewed_by_user_id,
          r.reviewed_at,
          r.created_at
        from admin_access_requests r
        inner join tenants t on t.id = r.tenant_id
        left join tenants tt on tt.id = r.target_tenant_id
        where r.id = ${input.requestId}
        limit 1
      `;

      if (!existingRow) {
        return toMutationError('ADMIN_NOT_FOUND', 'The access request could not be found.', { requestId: input.requestId }, 404);
      }

      let targetTenant = input.targetTenantId?.trim()
        ? await findTenantSummary(database, input.targetTenantId.trim())
        : null;

      if (input.decision === 'transferred' && !targetTenant) {
        return toMutationError(
          'ADMIN_INVALID_PAYLOAD',
          'Transferred access requests require a valid target tenant.',
          { targetTenantId: input.targetTenantId ?? null },
          400
        );
      }

      const updatedRow = await database.begin(async transaction => {
        const tx = transaction as unknown as DatabaseClient;

        if (existingRow.user_id && input.decision === 'transferred' && targetTenant) {
          const targetGroups = await tx<{ id: string; slug: string }[]>`
            select id, slug
            from groups
            where tenant_id = ${targetTenant.id}
          `;
          const targetGroupIdBySlug = new Map(targetGroups.map(group => [group.slug, group.id]));
          const defaultGroupIds = resolveDefaultMemberGroupIds(existingRow.email)
            .map(groupId => groupId.replace(/^grp_/, '').replace(/_/g, '-'))
            .map(groupSlug => targetGroupIdBySlug.get(groupSlug))
            .filter((groupId): groupId is string => Boolean(groupId));

          await tx`
            update users
            set tenant_id = ${targetTenant.id},
                updated_at = now()
            where id = ${existingRow.user_id}
          `;
          await tx`
            update auth_identities
            set tenant_id = ${targetTenant.id}
            where user_id = ${existingRow.user_id}
          `;
          await tx`
            update auth_sessions
            set tenant_id = ${targetTenant.id}
            where user_id = ${existingRow.user_id}
          `;
          await tx`
            update auth_challenges
            set tenant_id = ${targetTenant.id}
            where user_id = ${existingRow.user_id}
          `;
          await tx`
            update mfa_factors
            set tenant_id = ${targetTenant.id}
            where user_id = ${existingRow.user_id}
          `;
          await tx`
            delete from group_members
            where user_id = ${existingRow.user_id}
          `;
          await tx`
            delete from rbac_user_roles
            where user_id = ${existingRow.user_id}
          `;

          for (const [index, groupId] of defaultGroupIds.entries()) {
            await tx`
              insert into group_members (
                id,
                tenant_id,
                group_id,
                user_id,
                role,
                is_primary,
                created_at
              )
              values (
                ${randomUUID()},
                ${targetTenant.id},
                ${groupId},
                ${existingRow.user_id},
                'member',
                ${index === 0},
                now()
              )
            `;
          }

          for (const roleId of resolveDefaultRoleIds(existingRow.email)) {
            await tx`
              insert into rbac_user_roles (
                id,
                tenant_id,
                user_id,
                role_id,
                created_at
              )
              values (
                ${randomUUID()},
                ${targetTenant.id},
                ${existingRow.user_id},
                ${roleId},
                now()
              )
              on conflict (tenant_id, user_id, role_id) do nothing
            `;
          }
        }

        if (existingRow.user_id && input.decision === 'approved') {
          await tx`
            update users
            set status = 'active',
                updated_at = now()
            where id = ${existingRow.user_id}
          `;
        }

        if (existingRow.user_id && input.decision === 'rejected') {
          await tx`
            update users
            set status = 'suspended',
                updated_at = now()
            where id = ${existingRow.user_id}
          `;
        }

        const nextTenantId = targetTenant?.id ?? existingRow.tenant_id;
        const nextTenantName = targetTenant?.name ?? existingRow.tenant_name;
        const nextStatus =
          input.decision === 'transferred' ? 'transferred' : input.decision;
        const nextTargetTenantId =
          input.decision === 'transferred' ? targetTenant?.id ?? null : existingRow.target_tenant_id;
        const nextTargetTenantName =
          input.decision === 'transferred' ? targetTenant?.name ?? null : existingRow.target_tenant_name;

        const [row] = await tx<AccessRequestRow[]>`
          update admin_access_requests
          set tenant_id = ${nextTenantId},
              status = ${nextStatus},
              target_tenant_id = ${nextTargetTenantId},
              review_reason = ${input.reviewReason?.trim() || null},
              reviewed_by_user_id = ${user.id},
              reviewed_at = now(),
              updated_at = now()
          where id = ${existingRow.id}
          returning
            id,
            tenant_id,
            ${nextTenantName}::varchar as tenant_name,
            user_id,
            email,
            display_name,
            source,
            status,
            reason,
            domain_claim_id,
            target_tenant_id,
            ${nextTargetTenantName}::varchar as target_tenant_name,
            requested_by_user_id,
            review_reason,
            reviewed_by_user_id,
            reviewed_at,
            created_at
        `;

        if (!row) {
          throw new Error('Access request review failed to return a row.');
        }

        return row;
      });

      return {
        ok: true,
        data: {
          request: toAccessRequest(updatedRow),
        },
      };
    },
    async resetUserMfaForUser(user, input) {
      const [targetUser] = await database<{ id: string }[]>`
        select id
        from users
        where tenant_id = ${user.tenantId}
          and id = ${input.userId}
        limit 1
      `;

      if (!targetUser) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target user could not be found.', { userId: input.userId }, 404);
      }

      await database.begin(async transaction => {
        const tx = transaction as unknown as DatabaseClient;

        await tx`
          update mfa_factors
          set disabled_at = now()
          where user_id = ${input.userId}
            and disabled_at is null
        `;
        await tx`
          update auth_challenges
          set consumed_at = now()
          where user_id = ${input.userId}
            and kind = 'mfa_login'
            and consumed_at is null
        `;
      });

      return {
        ok: true,
        data: {
          userId: input.userId,
          reset: true,
          reason: input.reason?.trim() || null,
        },
      };
    },
    async createBreakGlassSessionForUser(user, input) {
      const roleIds = await listRoleIdsForUser(database, user);
      const canReadPlatformAdmin = roleIds.includes('root_admin');
      const tenantId =
        canReadPlatformAdmin && input.tenantId?.trim() ? input.tenantId.trim() : user.tenantId;
      const tenant = await findTenantSummary(database, tenantId);
      const reason = input.reason.trim();

      if (!tenant || !reason) {
        return toMutationError('ADMIN_INVALID_PAYLOAD', 'Break-glass sessions require a valid tenant and reason.', undefined, 400);
      }

      const expiresAt = new Date(
        Date.now() + Math.max(15, Math.min(24 * 60, input.expiresInMinutes ?? 60)) * 60_000
      ).toISOString();
      const [row] = await database<BreakGlassRow[]>`
        insert into admin_break_glass_sessions (
          id,
          tenant_id,
          actor_user_id,
          reason,
          justification,
          status,
          expires_at,
          reviewed_by_user_id,
          review_notes,
          reviewed_at,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()},
          ${tenantId},
          ${user.id},
          ${reason},
          ${input.justification?.trim() || null},
          'active',
          ${expiresAt}::timestamptz,
          null,
          null,
          null,
          now(),
          now()
        )
        returning
          id,
          tenant_id,
          ${tenant.name}::varchar as tenant_name,
          actor_user_id,
          ${user.email}::varchar as actor_user_email,
          reason,
          justification,
          status,
          expires_at,
          review_notes,
          reviewed_by_user_id,
          reviewed_at,
          created_at
      `;

      if (!row) {
        return toMutationError(
          'ADMIN_CONFLICT',
          'The break-glass session could not be created.',
          {
            tenantId,
          },
          409
        );
      }

      return {
        ok: true,
        data: {
          session: toBreakGlassSession(row),
        },
      };
    },
    async updateBreakGlassSessionForUser(user, input) {
      const [row] = await database<BreakGlassRow[]>`
        update admin_break_glass_sessions s
        set status = ${input.status},
            reviewed_by_user_id = ${user.id},
            review_notes = ${input.reviewNotes?.trim() || null},
            reviewed_at = now(),
            updated_at = now()
        from tenants t,
             users actor
        where s.id = ${input.sessionId}
          and t.id = s.tenant_id
          and actor.id = s.actor_user_id
        returning
          s.id,
          s.tenant_id,
          t.name as tenant_name,
          s.actor_user_id,
          actor.email as actor_user_email,
          s.reason,
          s.justification,
          s.status,
          s.expires_at,
          s.review_notes,
          s.reviewed_by_user_id,
          s.reviewed_at,
          s.created_at
      `;

      if (!row) {
        return toMutationError('ADMIN_NOT_FOUND', 'The break-glass session could not be found.', { sessionId: input.sessionId }, 404);
      }

      return {
        ok: true,
        data: {
          session: toBreakGlassSession(row),
        },
      };
    },
    async updateTenantGovernanceForUser(user, input) {
      const roleIds = await listRoleIdsForUser(database, user);
      const canReadPlatformAdmin = roleIds.includes('root_admin');
      const tenantId =
        canReadPlatformAdmin && input.tenantId?.trim() ? input.tenantId.trim() : user.tenantId;
      const tenant = await findTenantMetadata(database, tenantId);

      if (!tenant) {
        return toMutationError('ADMIN_NOT_FOUND', 'The target tenant could not be found.', { tenantId }, 404);
      }

      const currentValue = normalizeGovernanceSettings(tenant.id, tenant.metadata);
      const nextValue: AdminTenantGovernanceSettings = {
        ...currentValue,
        legalHoldEnabled: input.legalHoldEnabled ?? currentValue.legalHoldEnabled,
        retentionOverrideDays:
          input.retentionOverrideDays === undefined
            ? currentValue.retentionOverrideDays
            : input.retentionOverrideDays,
        scimPlanning: {
          ...currentValue.scimPlanning,
          ...(input.scimPlanning ?? {}),
        },
        policyPack: {
          ...currentValue.policyPack,
          ...(input.policyPack ?? {}),
        },
      };

      await database`
        update tenants
        set metadata = coalesce(metadata, '{}'::jsonb) || ${buildGovernanceMetadataPatch(nextValue)}::jsonb,
            updated_at = now()
        where id = ${tenantId}
      `;

      return {
        ok: true,
        data: {
          governance: nextValue,
        },
      };
    },
    async resolveSsoProviderForEmail(email) {
      const domain = normalizeEmail(email).split('@')[1] ?? '';

      if (!domain) {
        return null;
      }

      const [row] = await database<{
        id: string;
        jit_user_status: AdminIdentityDomainClaim['jitUserStatus'];
        provider_id: string;
        tenant_id: string;
      }[]>`
        select
          c.id,
          c.provider_id,
          c.tenant_id,
          c.jit_user_status
        from sso_domain_claims c
        inner join tenants t on t.id = c.tenant_id
        where c.domain = ${domain}
          and c.status = 'approved'
          and t.status = 'active'
        limit 1
      `;

      if (!row) {
        return null;
      }

      return {
        providerId: row.provider_id,
        tenantId: row.tenant_id,
        claimId: row.id,
        jitUserStatus: row.jit_user_status,
      };
    },
    async capturePendingAccessRequest(input) {
      const email = normalizeEmail(input.email);
      const [existingRow] = await database<AccessRequestRow[]>`
        select
          r.id,
          r.tenant_id,
          t.name as tenant_name,
          r.user_id,
          r.email,
          r.display_name,
          r.source,
          r.status,
          r.reason,
          r.domain_claim_id,
          r.target_tenant_id,
          tt.name as target_tenant_name,
          r.requested_by_user_id,
          r.review_reason,
          r.reviewed_by_user_id,
          r.reviewed_at,
          r.created_at
        from admin_access_requests r
        inner join tenants t on t.id = r.tenant_id
        left join tenants tt on tt.id = r.target_tenant_id
        where r.tenant_id = ${input.tenantId}
          and lower(r.email) = ${email}
          and r.status = 'pending'
        order by r.created_at desc
        limit 1
      `;

      if (existingRow) {
        return toAccessRequest(existingRow);
      }

      const [row] = await database<AccessRequestRow[]>`
        insert into admin_access_requests (
          id,
          tenant_id,
          user_id,
          email,
          display_name,
          source,
          status,
          reason,
          domain_claim_id,
          target_tenant_id,
          requested_by_user_id,
          reviewed_by_user_id,
          review_reason,
          reviewed_at,
          created_at,
          updated_at
        )
        values (
          ${randomUUID()},
          ${input.tenantId},
          ${input.userId},
          ${email},
          ${input.displayName?.trim() || null},
          ${input.source},
          'pending',
          ${input.reason?.trim() || null},
          ${input.domainClaimId ?? null},
          null,
          null,
          null,
          null,
          null,
          now(),
          now()
        )
        returning
          id,
          tenant_id,
          ${input.tenantName ?? null}::varchar as tenant_name,
          user_id,
          email,
          display_name,
          source,
          status,
          reason,
          domain_claim_id,
          target_tenant_id,
          null::varchar as target_tenant_name,
          requested_by_user_id,
          review_reason,
          reviewed_by_user_id,
          reviewed_at,
          created_at
      `;

      if (!row) {
        throw new Error('Pending access request insert did not return a row.');
      }

      return toAccessRequest(row);
    },
  };
}
