import type { WorkspaceAppToolSummary, ChatToolDescriptor } from "@agentifui/shared";
import type { AdminErrorCode } from "@agentifui/shared/admin";
import type { AuthUser } from "@agentifui/shared/auth";
import { randomUUID } from "node:crypto";

import { WORKSPACE_APPS } from "./workspace-catalog-fixtures.js";

type ToolRegistryMutationErrorResult = {
  ok: false;
  statusCode: 400 | 404;
  code: Extract<AdminErrorCode, "ADMIN_INVALID_PAYLOAD" | "ADMIN_NOT_FOUND">;
  message: string;
  details?: unknown;
};

export type ToolRegistryMutationResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | ToolRegistryMutationErrorResult;

export type UpdateAppToolRegistryInput = {
  appId: string;
  enabledToolNames: string[];
};

export type ToolRegistryService = {
  listAppToolsForTenant(
    tenantId: string,
    appIds?: string[],
  ): Promise<Record<string, WorkspaceAppToolSummary[]>> | Record<string, WorkspaceAppToolSummary[]>;
  getEnabledToolsForUser(
    user: AuthUser,
    input: {
      appId: string;
    },
  ): Promise<ChatToolDescriptor[]> | ChatToolDescriptor[];
  updateAppToolsForUser(
    user: AuthUser,
    input: UpdateAppToolRegistryInput,
  ):
    | Promise<
        ToolRegistryMutationResult<{
          appId: string;
          tools: WorkspaceAppToolSummary[];
        }>
      >
    | ToolRegistryMutationResult<{
        appId: string;
        tools: WorkspaceAppToolSummary[];
      }>;
};

type ToolOverrideRecord = {
  enabled: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
};

type WorkspaceToolCatalogEntry = {
  availableAppIds: string[];
  defaultEnabledAppIds: string[];
  descriptor: ChatToolDescriptor;
};

const WORKSPACE_TOOL_CATALOG: WorkspaceToolCatalogEntry[] = [
  {
    availableAppIds: [
      "app_market_brief",
      "app_service_copilot",
      "app_policy_watch",
      "app_runbook_mentor",
      "app_audit_lens",
    ],
    defaultEnabledAppIds: [
      "app_market_brief",
      "app_service_copilot",
      "app_policy_watch",
      "app_runbook_mentor",
    ],
    descriptor: {
      type: "function",
      function: {
        name: "workspace.search",
        description: "Search indexed workspace knowledge and policy references.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The retrieval query to run against indexed workspace sources.",
            },
            topK: {
              type: "integer",
              minimum: 1,
              maximum: 10,
              description: "The maximum number of ranked matches to return.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "active_group",
      },
      enabled: true,
      tags: ["search", "knowledge", "retrieval"],
    },
  },
  {
    availableAppIds: ["app_service_copilot", "app_runbook_mentor"],
    defaultEnabledAppIds: ["app_service_copilot"],
    descriptor: {
      type: "function",
      function: {
        name: "workspace.attachments.lookup",
        description: "Inspect uploaded workspace files and attachment metadata for the active run.",
        inputSchema: {
          type: "object",
          properties: {
            fileId: {
              type: "string",
              description: "The uploaded workspace file identifier to inspect.",
            },
          },
          required: ["fileId"],
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "active_group",
      },
      enabled: true,
      tags: ["files", "attachments"],
    },
  },
  {
    availableAppIds: ["app_runbook_mentor"],
    defaultEnabledAppIds: ["app_runbook_mentor"],
    descriptor: {
      type: "function",
      function: {
        name: "runbook.steps.generate",
        description: "Generate structured SOP or runbook steps from the current task context.",
        inputSchema: {
          type: "object",
          properties: {
            objective: {
              type: "string",
              description: "The operational objective to break down into steps.",
            },
            maxSteps: {
              type: "integer",
              minimum: 1,
              maximum: 15,
              description: "Optional maximum number of generated steps.",
            },
          },
          required: ["objective"],
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "active_group",
      },
      enabled: true,
      tags: ["automation", "runbook"],
    },
  },
  {
    availableAppIds: ["app_tenant_control", "app_release_radar"],
    defaultEnabledAppIds: ["app_tenant_control"],
    descriptor: {
      type: "function",
      function: {
        name: "tenant.usage.read",
        description: "Read tenant-wide launch, run, storage, and quota usage summaries.",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["tenant", "group", "app"],
              description: "Which usage slice to summarize.",
            },
          },
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "tenant_admin",
        requiresFreshMfa: true,
      },
      enabled: true,
      tags: ["tenant", "usage", "admin"],
    },
  },
  {
    availableAppIds: ["app_tenant_control", "app_release_radar"],
    defaultEnabledAppIds: ["app_release_radar", "app_tenant_control"],
    descriptor: {
      type: "function",
      function: {
        name: "tenant.access.review",
        description: "Review pending access policy changes and summarize impacted subjects.",
        inputSchema: {
          type: "object",
          properties: {
            subjectType: {
              type: "string",
              enum: ["group", "role", "user"],
              description: "The grant subject class to review.",
            },
          },
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "tenant_admin",
        requiresFreshMfa: true,
      },
      enabled: true,
      tags: ["tenant", "rbac", "admin"],
    },
  },
  {
    availableAppIds: ["app_audit_lens"],
    defaultEnabledAppIds: ["app_audit_lens"],
    descriptor: {
      type: "function",
      function: {
        name: "security.audit.search",
        description: "Search audit windows and flagged traces for the active security group.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The audit search phrase or trace id to inspect.",
            },
            level: {
              type: "string",
              enum: ["info", "warning", "critical"],
              description: "Optional audit severity filter.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
        strict: true,
      },
      auth: {
        scope: "active_group",
      },
      enabled: true,
      tags: ["security", "audit"],
    },
  },
];

function toMutationError(
  code: ToolRegistryMutationErrorResult["code"],
  message: string,
  details?: unknown,
  statusCode: ToolRegistryMutationErrorResult["statusCode"] = 400,
): ToolRegistryMutationErrorResult {
  return {
    ok: false,
    statusCode,
    code,
    message,
    details,
  };
}

function normalizeToolNames(value: string[]) {
  return [
    ...new Set(
      value
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function buildToolSummary(
  appId: string,
  entry: WorkspaceToolCatalogEntry,
  override: ToolOverrideRecord | null,
): WorkspaceAppToolSummary {
  const defaultEnabled = entry.defaultEnabledAppIds.includes(appId);
  const enabled = override?.enabled ?? defaultEnabled;

  return {
    name: entry.descriptor.function.name,
    description: entry.descriptor.function.description ?? null,
    enabled,
    defaultEnabled,
    isOverridden: override !== null,
    auth: entry.descriptor.auth,
    tags: entry.descriptor.tags ?? [],
    inputSchema: entry.descriptor.function.inputSchema,
    strict: entry.descriptor.function.strict ?? false,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export function listCatalogToolsForApp(appId: string) {
  return WORKSPACE_TOOL_CATALOG.filter((entry) => entry.availableAppIds.includes(appId));
}

export function buildAppToolSummaries(
  appId: string,
  overridesByToolName: Map<string, ToolOverrideRecord>,
): WorkspaceAppToolSummary[] {
  return listCatalogToolsForApp(appId)
    .map((entry) =>
      buildToolSummary(
        appId,
        entry,
        overridesByToolName.get(entry.descriptor.function.name) ?? null,
      ),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toEnabledDescriptor(
  entry: WorkspaceToolCatalogEntry,
): ChatToolDescriptor {
  return {
    ...entry.descriptor,
    enabled: true,
  };
}

function mapSummariesByAppId(
  appIds: string[],
  overrideLookup: Map<string, Map<string, ToolOverrideRecord>>,
): Record<string, WorkspaceAppToolSummary[]> {
  return Object.fromEntries(
    appIds.map((appId) => [
      appId,
      buildAppToolSummaries(appId, overrideLookup.get(appId) ?? new Map()),
    ]),
  );
}

export function createToolRegistryService(): ToolRegistryService {
  const overridesByTenantApp = new Map<string, Map<string, ToolOverrideRecord>>();

  function readAppOverrides(
    tenantId: string,
    appId: string,
  ): Map<string, ToolOverrideRecord> {
    const key = `${tenantId}:${appId}`;
    const existing = overridesByTenantApp.get(key);

    if (existing) {
      return existing;
    }

    const created = new Map<string, ToolOverrideRecord>();
    overridesByTenantApp.set(key, created);
    return created;
  }

  return {
    listAppToolsForTenant(tenantId, appIds) {
      const targetAppIds = (appIds ?? WORKSPACE_APPS.map((app) => app.id)).filter((appId, index, values) => {
        return values.indexOf(appId) === index;
      });
      const overrideLookup = new Map<string, Map<string, ToolOverrideRecord>>();

      for (const appId of targetAppIds) {
        overrideLookup.set(appId, readAppOverrides(tenantId, appId));
      }

      return mapSummariesByAppId(targetAppIds, overrideLookup);
    },
    getEnabledToolsForUser(user, input) {
      const overridesByToolName = readAppOverrides(user.tenantId, input.appId);

      return listCatalogToolsForApp(input.appId)
        .filter((entry) => {
          const override = overridesByToolName.get(entry.descriptor.function.name);
          return override?.enabled ?? entry.defaultEnabledAppIds.includes(input.appId);
        })
        .map(toEnabledDescriptor);
    },
    updateAppToolsForUser(user, input) {
      const appId = input.appId.trim();
      const app = WORKSPACE_APPS.find((candidate) => candidate.id === appId);

      if (!app) {
        return toMutationError(
          "ADMIN_NOT_FOUND",
          "The target workspace app could not be found.",
          { appId },
          404,
        );
      }

      const catalogEntries = listCatalogToolsForApp(appId);
      const availableToolNames = new Set(
        catalogEntries.map((entry) => entry.descriptor.function.name),
      );
      const enabledToolNames = normalizeToolNames(input.enabledToolNames);
      const invalidToolNames = enabledToolNames.filter(
        (name) => !availableToolNames.has(name),
      );

      if (invalidToolNames.length > 0) {
        return toMutationError(
          "ADMIN_INVALID_PAYLOAD",
          "The tool update payload references tools that are not available for this app.",
          {
            appId,
            invalidToolNames,
          },
        );
      }

      const overridesByToolName = readAppOverrides(user.tenantId, appId);
      const updatedAt = new Date().toISOString();

      for (const entry of catalogEntries) {
        const toolName = entry.descriptor.function.name;
        const defaultEnabled = entry.defaultEnabledAppIds.includes(appId);
        const desiredEnabled = enabledToolNames.includes(toolName);

        if (desiredEnabled === defaultEnabled) {
          overridesByToolName.delete(toolName);
          continue;
        }

        overridesByToolName.set(toolName, {
          enabled: desiredEnabled,
          updatedAt,
          updatedByUserId: user.id,
        });
      }

      return {
        ok: true,
        data: {
          appId,
          tools: buildAppToolSummaries(appId, overridesByToolName),
        },
      };
    },
  };
}

export function resolveEnabledToolNames(
  tools: WorkspaceAppToolSummary[],
): string[] {
  return tools.filter((tool) => tool.enabled).map((tool) => tool.name);
}

export function buildToolRegistryId() {
  return `toolreg_${randomUUID()}`;
}
