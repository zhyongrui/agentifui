import type {
  AuthAuditAction,
  AuthAuditEntityType,
  AuthAuditEvent,
  AuthAuditLevel,
} from '@agentifui/shared/auth';
import { randomUUID } from 'node:crypto';

import { withRequestTracePayload } from './request-tracing.js';

type Awaitable<T> = T | Promise<T>;

type RecordAuditEventInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: AuthAuditAction;
  level?: AuthAuditLevel;
  entityType: AuthAuditEntityType;
  entityId?: string | null;
  ipAddress?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

type ListAuditEventsInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  limit?: number;
};

type AuditService = {
  recordEvent(input: RecordAuditEventInput): Awaitable<AuthAuditEvent>;
  listEvents(input?: ListAuditEventsInput): Awaitable<AuthAuditEvent[]>;
  clear(): Awaitable<void>;
};

export function createAuditService(): AuditService {
  const events: AuthAuditEvent[] = [];

  return {
    recordEvent(input) {
      const event: AuthAuditEvent = {
        id: randomUUID(),
        tenantId: input.tenantId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        level: input.level ?? 'info',
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        ipAddress: input.ipAddress ?? null,
        payload: withRequestTracePayload(input.payload),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
      };

      events.unshift(event);

      return event;
    },
    listEvents(input = {}) {
      const limit = input.limit && input.limit > 0 ? input.limit : 20;

      return events
        .filter(event => {
          if (input.tenantId !== undefined && event.tenantId !== input.tenantId) {
            return false;
          }

          if (input.actorUserId !== undefined && event.actorUserId !== input.actorUserId) {
            return false;
          }

          return true;
        })
        .slice(0, limit);
    },
    clear() {
      events.splice(0, events.length);
    },
  };
}

export type { AuditService };
export type { ListAuditEventsInput, RecordAuditEventInput };
