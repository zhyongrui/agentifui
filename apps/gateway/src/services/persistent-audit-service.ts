import type { DatabaseClient } from '@agentifui/db';
import type { AuthAuditEvent } from '@agentifui/shared/auth';
import { randomUUID } from 'node:crypto';

import type {
  AuditService,
  ListAuditEventsInput,
  RecordAuditEventInput,
} from './audit-service.js';

function toAuditEvent(row: {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string;
  level: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  payload: Record<string, unknown> | string;
  occurred_at: Date | string;
}): AuthAuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action as AuthAuditEvent['action'],
    level: row.level as AuthAuditEvent['level'],
    entityType: row.entity_type as AuthAuditEvent['entityType'],
    entityId: row.entity_id,
    ipAddress: row.ip_address,
    payload: normalizeJsonRecord(row.payload),
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString(),
  };
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

export function createPersistentAuditService(database: DatabaseClient): AuditService {
  return {
    async recordEvent(input: RecordAuditEventInput) {
      const eventId = randomUUID();
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [row] = await database<{
        id: string;
        tenant_id: string | null;
        actor_user_id: string | null;
        action: string;
        level: string;
        entity_type: string;
        entity_id: string | null;
        ip_address: string | null;
        payload: Record<string, unknown> | string;
        occurred_at: Date;
      }[]>`
        insert into audit_events (
          id,
          tenant_id,
          actor_user_id,
          action,
          level,
          entity_type,
          entity_id,
          ip_address,
          payload,
          occurred_at
        )
        values (
          ${eventId},
          ${input.tenantId ?? null},
          ${input.actorUserId ?? null},
          ${input.action},
          ${input.level ?? 'info'},
          ${input.entityType},
          ${input.entityId ?? null},
          ${input.ipAddress ?? null},
          ${input.payload ?? {}}::jsonb,
          ${occurredAt}::timestamptz
        )
        returning
          id,
          tenant_id,
          actor_user_id,
          action,
          level,
          entity_type,
          entity_id,
          ip_address,
          payload,
          occurred_at
      `;

      if (!row) {
        throw new Error('Audit event insert did not return a persisted row.');
      }

      return toAuditEvent(row);
    },
    async listEvents(input: ListAuditEventsInput = {}) {
      const limit = input.limit && input.limit > 0 ? input.limit : 20;

      const rows = await database<{
        id: string;
        tenant_id: string | null;
        actor_user_id: string | null;
        action: string;
        level: string;
        entity_type: string;
        entity_id: string | null;
        ip_address: string | null;
        payload: Record<string, unknown> | string;
        occurred_at: Date;
      }[]>`
        select
          id,
          tenant_id,
          actor_user_id,
          action,
          level,
          entity_type,
          entity_id,
          ip_address,
          payload,
          occurred_at
        from audit_events
        where (${input.tenantId ?? null}::varchar is null or tenant_id = ${input.tenantId ?? null})
          and (${input.actorUserId ?? null}::varchar is null or actor_user_id = ${input.actorUserId ?? null})
        order by occurred_at desc
        limit ${limit}
      `;

      return rows.map(toAuditEvent);
    },
    async clear() {
      await database.unsafe('truncate table audit_events restart identity cascade');
    },
  };
}
