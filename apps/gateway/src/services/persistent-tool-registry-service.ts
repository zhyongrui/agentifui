import type { DatabaseClient } from "@agentifui/db";
import type { ChatToolDescriptor } from "@agentifui/shared";

import {
  buildAppToolSummaries,
  buildToolRegistryId,
  listCatalogToolsForApp,
  type ToolRegistryMutationResult,
  type ToolRegistryService,
  type UpdateAppToolRegistryInput,
} from "./tool-registry-service.js";

type ToolOverrideRow = {
  app_id: string;
  tool_name: string;
  enabled: boolean;
  updated_at: Date | string;
  updated_by_user_id: string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildEnabledDescriptor(summary: {
  name: string;
  description: string | null;
  auth: ChatToolDescriptor["auth"];
  inputSchema: ChatToolDescriptor["function"]["inputSchema"];
  strict: boolean;
  tags: string[];
}) {
  return {
    type: "function",
    function: {
      name: summary.name,
      description: summary.description ?? undefined,
      inputSchema: summary.inputSchema,
      strict: summary.strict,
    },
    auth: summary.auth,
    enabled: true,
    tags: summary.tags,
  } satisfies ChatToolDescriptor;
}

function toMutationError(
  code: Extract<
    ToolRegistryMutationResult<never>,
    { ok: false }
  >["code"],
  message: string,
  details?: unknown,
  statusCode: 400 | 404 = 400,
) {
  return {
    ok: false as const,
    statusCode,
    code,
    message,
    details,
  };
}

async function listToolOverridesForTenant(
  database: DatabaseClient,
  tenantId: string,
  appIds?: string[],
) {
  const rows = await database<ToolOverrideRow[]>`
    select
      app_id,
      tool_name,
      enabled,
      updated_at,
      updated_by_user_id
    from workspace_app_tool_overrides
    where tenant_id = ${tenantId}
      and (${appIds ?? null}::varchar[] is null or app_id = any(${appIds ?? null}::varchar[]))
  `;

  const overridesByAppId = new Map<
    string,
    Map<
      string,
      {
        enabled: boolean;
        updatedAt: string;
        updatedByUserId: string | null;
      }
    >
  >();

  for (const row of rows) {
    const current = overridesByAppId.get(row.app_id) ?? new Map();
    current.set(row.tool_name, {
      enabled: row.enabled,
      updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
      updatedByUserId: row.updated_by_user_id,
    });
    overridesByAppId.set(row.app_id, current);
  }

  return overridesByAppId;
}

export function createPersistentToolRegistryService(
  database: DatabaseClient,
): ToolRegistryService {
  return {
    async listAppToolsForTenant(tenantId, appIds) {
      const targetRows = await database<{ id: string }[]>`
        select id
        from workspace_apps
        where tenant_id = ${tenantId}
          and (${appIds ?? null}::varchar[] is null or id = any(${appIds ?? null}::varchar[]))
        order by sort_order asc, name asc
      `;
      const targetAppIds = targetRows.map((row) => row.id);
      const overridesByAppId = await listToolOverridesForTenant(
        database,
        tenantId,
        targetAppIds,
      );

      return Object.fromEntries(
        targetAppIds.map((appId) => [
          appId,
          buildAppToolSummaries(appId, overridesByAppId.get(appId) ?? new Map()),
        ]),
      );
    },
    async getEnabledToolsForUser(user, input) {
      const overridesByAppId = await listToolOverridesForTenant(database, user.tenantId, [
        input.appId,
      ]);
      const summaries = buildAppToolSummaries(
        input.appId,
        overridesByAppId.get(input.appId) ?? new Map(),
      );

      return summaries
        .filter((summary) => summary.enabled)
        .map(buildEnabledDescriptor);
    },
    async updateAppToolsForUser(user, input: UpdateAppToolRegistryInput) {
      const appId = input.appId.trim();
      const enabledToolNames = [
        ...new Set(input.enabledToolNames.map((name) => name.trim()).filter(Boolean)),
      ].sort((left, right) => left.localeCompare(right));

      const [appRow] = await database<{ id: string }[]>`
        select id
        from workspace_apps
        where tenant_id = ${user.tenantId}
          and id = ${appId}
        limit 1
      `;

      if (!appRow) {
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

      await database.begin(async (transaction) => {
        const sql = transaction as unknown as DatabaseClient;

        for (const entry of catalogEntries) {
          const toolName = entry.descriptor.function.name;
          const defaultEnabled = entry.defaultEnabledAppIds.includes(appId);
          const desiredEnabled = enabledToolNames.includes(toolName);

          if (desiredEnabled === defaultEnabled) {
            await sql`
              delete from workspace_app_tool_overrides
              where tenant_id = ${user.tenantId}
                and app_id = ${appId}
                and tool_name = ${toolName}
            `;
            continue;
          }

          await sql`
            insert into workspace_app_tool_overrides (
              id,
              tenant_id,
              app_id,
              tool_name,
              enabled,
              updated_by_user_id,
              created_at,
              updated_at
            )
            values (
              ${buildToolRegistryId()},
              ${user.tenantId},
              ${appId},
              ${toolName},
              ${desiredEnabled},
              ${user.id},
              now(),
              now()
            )
            on conflict (tenant_id, app_id, tool_name) do update
            set enabled = excluded.enabled,
                updated_by_user_id = excluded.updated_by_user_id,
                updated_at = excluded.updated_at
          `;
        }
      });

      const overridesByAppId = await listToolOverridesForTenant(database, user.tenantId, [
        appId,
      ]);

      return {
        ok: true as const,
        data: {
          appId,
          tools: buildAppToolSummaries(
            appId,
            overridesByAppId.get(appId) ?? new Map(),
          ),
        },
      };
    },
  };
}
