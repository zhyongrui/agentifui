'use client';

import type {
  AdminAuditDetectorType,
  AdminAuditFilters,
  AdminAuditPayloadMode,
  AdminAuditResponse,
  AdminTenantSummary,
} from '@agentifui/shared/admin';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearAuthSession } from '../../../lib/auth-session';
import {
  exportAdminAudit,
  fetchAdminAudit,
  fetchAdminTenants,
} from '../../../lib/admin-client';
import { useI18n } from '../../../components/i18n-provider';
import { EmptyState, SectionSkeleton } from '../../../components/section-state';
import { useProtectedSession } from '../../../lib/use-protected-session';

type AuditFilterFormState = {
  scope: 'tenant' | 'platform';
  tenantId: string;
  datePreset: '' | '24h' | '7d' | '30d' | '90d';
  action: string;
  level: '' | 'critical' | 'info' | 'warning';
  detectorType: '' | AdminAuditDetectorType;
  actorUserId: string;
  entityType:
    | ''
    | 'conversation'
    | 'policy_evaluation'
    | 'run'
    | 'session'
    | 'tenant'
    | 'user'
    | 'workspace_app';
  traceId: string;
  runId: string;
  conversationId: string;
  payloadMode: AdminAuditPayloadMode;
  limit: string;
};

const EMPTY_FILTERS: AuditFilterFormState = {
  scope: 'tenant',
  tenantId: '',
  datePreset: '',
  action: '',
  level: '',
  detectorType: '',
  actorUserId: '',
  entityType: '',
  traceId: '',
  runId: '',
  conversationId: '',
  payloadMode: 'masked',
  limit: '',
};

function normalizeFilters(filters: AuditFilterFormState): AdminAuditFilters {
  const limit = filters.limit.trim();

  return {
    scope: filters.scope,
    tenantId: filters.tenantId.trim() || null,
    action: filters.action.trim() || null,
    datePreset: filters.datePreset || null,
    level: filters.level || null,
    detectorType: filters.detectorType || null,
    actorUserId: filters.actorUserId.trim() || null,
    entityType: filters.entityType || null,
    traceId: filters.traceId.trim() || null,
    runId: filters.runId.trim() || null,
    conversationId: filters.conversationId.trim() || null,
    payloadMode: filters.payloadMode,
    limit: limit ? Number.parseInt(limit, 10) : null,
  };
}

function hasAppliedFilters(filters: AdminAuditFilters) {
  return Object.entries(filters).some(([key, value]) => {
    if (key === 'payloadMode') {
      return value === 'raw';
    }

    if (key === 'scope') {
      return value === 'platform';
    }

    return value !== null && value !== undefined && value !== '';
  });
}

function buildFilterTags(filters: AdminAuditFilters, tenantNameById: Map<string, string>) {
  return [
    filters.scope === 'platform' ? 'Scope: platform' : null,
    filters.tenantId
      ? `Tenant: ${tenantNameById.get(filters.tenantId) ?? filters.tenantId}`
      : null,
    filters.action ? `Action: ${filters.action}` : null,
    filters.datePreset ? `Window: ${filters.datePreset}` : null,
    filters.level ? `Level: ${filters.level}` : null,
    filters.detectorType ? `Detector: ${filters.detectorType}` : null,
    filters.actorUserId ? `Actor: ${filters.actorUserId}` : null,
    filters.entityType ? `Entity: ${filters.entityType}` : null,
    filters.traceId ? `Trace: ${filters.traceId}` : null,
    filters.runId ? `Run: ${filters.runId}` : null,
    filters.conversationId ? `Conversation: ${filters.conversationId}` : null,
    filters.payloadMode === 'raw' ? 'Payload: raw' : null,
    typeof filters.limit === 'number' ? `Limit: ${filters.limit}` : null,
  ].filter((value): value is string => Boolean(value));
}

function resolveTenantLabel(
  tenantId: string | null | undefined,
  fallbackName: string | null | undefined,
  tenantNameById: Map<string, string>
) {
  if (tenantId && tenantNameById.has(tenantId)) {
    return tenantNameById.get(tenantId) ?? fallbackName ?? tenantId;
  }

  return fallbackName ?? tenantId ?? 'Unknown tenant';
}

export default function AdminAuditPage() {
  const router = useRouter();
  const { locale, formatDateTime } = useI18n();
  const { session, isLoading: isSessionLoading } = useProtectedSession('/admin');
  const [capabilities, setCapabilities] =
    useState<AdminAuditResponse['data']['capabilities'] | null>(null);
  const [platformTenants, setPlatformTenants] = useState<AdminTenantSummary[]>([]);
  const [data, setData] = useState<AdminAuditResponse['data'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<null | 'csv' | 'json'>(null);
  const [draftFilters, setDraftFilters] = useState<AuditFilterFormState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterFormState>(EMPTY_FILTERS);
  const [didBootstrapPlatformScope, setDidBootstrapPlatformScope] = useState(false);
  const copy =
    locale === 'zh-CN'
      ? {
          unknownTenant: '未知租户',
          loadFailed: '管理审计加载失败，请稍后重试。',
          platformTenantLoadFailed: '平台租户清单加载失败，请稍后重试。',
          loading: '正在加载管理审计...',
          exportReady: (format: string, filename: string) => `${format.toUpperCase()} 导出已就绪：${filename}`,
          exportDownloaded: (format: string, filename: string) => `${format.toUpperCase()} 导出已下载：${filename}`,
          exportBrowserFailed: '导出已生成，但当前浏览器无法自动开始下载。',
          exportFailed: '审计导出失败，请稍后重试。',
          title: '审计',
          platformLead: '跨租户查看带运行上下文的审计记录，支持高风险摘要和租户范围切换。',
          tenantLead: '在租户范围内按动作、执行人和 trace 检索持久化的运行审计记录。',
          filters: '筛选条件',
          filtersLead: '按动作、执行人或工作台执行 trace 缩小审计事件范围。',
          scope: '范围',
          tenant: '租户',
          allTenants: '全部租户',
          action: '动作',
          level: '严重级别',
          allLevels: '全部级别',
          detectorType: 'Detector',
          allDetectors: '全部 detector',
          entityType: '实体类型',
          allEntityTypes: '全部实体类型',
          actorUserId: '执行人用户 ID',
          traceId: 'Trace ID',
          runId: 'Run ID',
          conversationId: '会话 ID',
          payload: '载荷',
          limit: '条数限制',
          actions: '操作',
          datePreset: '时间窗口',
          allDatePresets: '自定义 / 全部',
          apply: '应用筛选',
          clear: '清空',
          exportingJson: '导出 JSON 中...',
          exportJson: '导出 JSON',
          exportingCsv: '导出 CSV 中...',
          exportCsv: '导出 CSV',
          noPlatformFilters: '未应用筛选，当前显示最新的平台级审计窗口。',
          noTenantFilters: '未应用筛选，当前显示最新的租户级审计窗口。',
          snapshot: '快照',
          matchingEvents: '条匹配事件',
          highRisk: '高风险',
          tenantSpread: '租户分布',
          topActions: '高频动作',
          topActionsPlatformLead: '当前筛选后的平台级审计量按动作分组。',
          topActionsTenantLead: '当前筛选后的租户级审计量按动作分组。',
          noAuditEvents: '没有审计事件',
          tenantSpreadTitle: '租户分布',
          tenantSpreadLead: '当前审计窗口在各租户间的分布情况。',
          noTenantMatches: '没有匹配的租户',
          noMatchedEvents: '当前筛选条件下没有匹配的审计事件。',
          occurred: '发生时间',
          actor: '执行人',
          system: '系统',
          ip: 'IP',
          notAvailable: '无',
          app: '应用',
          group: '群组',
          sensitivePayload: '敏感载荷',
          piiDetected: '检测到 PII',
          matches: '处命中',
          maskedLead: '敏感字段默认已脱敏。切换到 raw 可查看原始值。',
          rawLead: '当前为 raw 载荷模式，下方会显示敏感原始值。',
          hideRaw: '隐藏 raw 载荷',
          showRaw: '显示 raw 载荷',
        }
      : {
          unknownTenant: 'Unknown tenant',
          loadFailed: 'Admin audit failed to load. Please retry.',
          platformTenantLoadFailed: 'Platform tenant inventory failed to load. Please retry.',
          loading: 'Loading admin audit...',
          exportReady: (format: string, filename: string) => `${format.toUpperCase()} export ready: ${filename}`,
          exportDownloaded: (format: string, filename: string) => `${format.toUpperCase()} export downloaded: ${filename}`,
          exportBrowserFailed: 'Audit export is ready, but this browser could not start the download automatically.',
          exportFailed: 'Audit export failed. Please retry in a moment.',
          title: 'Audit',
          platformLead: 'Platform audit visibility across tenants with run-aware filters, high-risk summaries and tenant scope switching.',
          tenantLead: 'Tenant-level audit visibility with action, actor and trace filters for persisted run-aware governance review.',
          filters: 'Filters',
          filtersLead: 'Narrow audit events by action, actor or workspace execution trace.',
          scope: 'Scope',
          tenant: 'Tenant',
          allTenants: 'All tenants',
          action: 'Action',
          level: 'Severity',
          allLevels: 'All levels',
          detectorType: 'Detector',
          allDetectors: 'All detectors',
          entityType: 'Entity Type',
          allEntityTypes: 'All entity types',
          actorUserId: 'Actor User ID',
          traceId: 'Trace ID',
          runId: 'Run ID',
          conversationId: 'Conversation ID',
          payload: 'Payload',
          limit: 'Limit',
          actions: 'Actions',
          datePreset: 'Date window',
          allDatePresets: 'Custom / all',
          apply: 'Apply filters',
          clear: 'Clear',
          exportingJson: 'Exporting JSON...',
          exportJson: 'Export JSON',
          exportingCsv: 'Exporting CSV...',
          exportCsv: 'Export CSV',
          noPlatformFilters: 'No filters applied. Showing the latest platform audit window.',
          noTenantFilters: 'No filters applied. Showing the latest tenant audit window.',
          snapshot: 'Snapshot',
          matchingEvents: 'matching events',
          highRisk: 'High risk',
          tenantSpread: 'Tenant spread',
          topActions: 'Top actions',
          topActionsPlatformLead: 'Filtered platform-wide audit volume grouped by action.',
          topActionsTenantLead: 'Filtered tenant-wide audit volume grouped by action.',
          noAuditEvents: 'No audit events',
          tenantSpreadTitle: 'Tenant spread',
          tenantSpreadLead: 'How the current audit window is distributed across tenants.',
          noTenantMatches: 'No tenant matches',
          noMatchedEvents: 'No audit events matched the current filter set.',
          occurred: 'Occurred',
          actor: 'Actor',
          system: 'System',
          ip: 'IP',
          notAvailable: 'N/A',
          app: 'App',
          group: 'Group',
          sensitivePayload: 'Sensitive payload',
          piiDetected: 'PII detected',
          matches: 'matches',
          maskedLead: 'Sensitive fields are masked by default. Switch Payload mode to raw to inspect the original values.',
          rawLead: 'Raw payload mode is active. Sensitive values are visible in the payload block below.',
          hideRaw: 'Hide raw payloads',
          showRaw: 'Show raw payloads',
        };

  useEffect(() => {
    if (!session) {
      setCapabilities(null);
      setPlatformTenants([]);
      setData(null);
      setError(null);
      setIsDataLoading(false);
      setExportNotice(null);
      setExportError(null);
      setExportingFormat(null);
      setDidBootstrapPlatformScope(false);
      return;
    }
  }, [router, session]);

  useEffect(() => {
    if (!capabilities?.canReadPlatformAdmin || didBootstrapPlatformScope) {
      return;
    }

    setDraftFilters(currentValue => ({
      ...currentValue,
      scope: 'platform',
    }));
    setAppliedFilters(currentValue => ({
      ...currentValue,
      scope: 'platform',
    }));
    setDidBootstrapPlatformScope(true);
  }, [capabilities, didBootstrapPlatformScope]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let isCancelled = false;

    setIsDataLoading(true);
    setError(null);

    fetchAdminAudit(session.sessionToken, normalizeFilters(appliedFilters))
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          setData(null);

          if (result.error.code === 'ADMIN_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setError(result.error.message);
          return;
        }

        setCapabilities(result.data.capabilities);
        setData(result.data);
      })
      .catch(() => {
        if (!isCancelled) {
          setData(null);
          setError(copy.loadFailed);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsDataLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [appliedFilters, router, session]);

  useEffect(() => {
    if (!session || !capabilities?.canReadPlatformAdmin) {
      setPlatformTenants([]);
      return;
    }

    let isCancelled = false;

    fetchAdminTenants(session.sessionToken)
      .then(result => {
        if (isCancelled) {
          return;
        }

        if (!result.ok) {
          if (result.error.code === 'ADMIN_UNAUTHORIZED') {
            clearAuthSession(window.sessionStorage);
            router.replace('/login');
            return;
          }

          setPlatformTenants([]);
          setError(currentValue => currentValue ?? result.error.message);
          return;
        }

        setPlatformTenants(result.data.tenants);
      })
      .catch(() => {
        if (!isCancelled) {
          setPlatformTenants([]);
          setError(currentValue => currentValue ?? copy.platformTenantLoadFailed);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [capabilities, router, session]);

  const tenantNameById = new Map(platformTenants.map(tenant => [tenant.id, tenant.name]));
  const defaultFilters =
    capabilities?.canReadPlatformAdmin
      ? {
          ...EMPTY_FILTERS,
          scope: 'platform' as const,
        }
      : EMPTY_FILTERS;

  if (isSessionLoading || (isDataLoading && !data)) {
    return <SectionSkeleton blocks={6} lead={copy.loading} title={copy.title} />;
  }

  async function handleExport(format: 'csv' | 'json') {
    if (!session) {
      return;
    }

    setExportNotice(null);
    setExportError(null);
    setExportingFormat(format);

    try {
      const result = await exportAdminAudit(
        session.sessionToken,
        format,
        normalizeFilters(appliedFilters)
      );

      if ('ok' in result) {
        if (result.error.code === 'ADMIN_UNAUTHORIZED') {
          clearAuthSession(window.sessionStorage);
          router.replace('/login');
          return;
        }

        setExportError(result.error.message);
        return;
      }

      setExportNotice(copy.exportReady(format, result.metadata.filename));

      try {
        const objectUrl = URL.createObjectURL(result.blob);
        const anchor = document.createElement('a');

        anchor.href = objectUrl;
        anchor.download = result.metadata.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 0);

        setExportNotice(copy.exportDownloaded(format, result.metadata.filename));
      } catch {
        setExportError(copy.exportBrowserFailed);
      }
    } catch {
      setExportError(copy.exportFailed);
    } finally {
      setExportingFormat(null);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>{copy.title}</h1>
        <p className="lead">{capabilities?.canReadPlatformAdmin ? copy.platformLead : copy.tenantLead}</p>
      </div>

      <section className="admin-card stack">
        <div className="section-header">
          <div>
            <h2>Filters</h2>
            <p>{copy.filtersLead}</p>
          </div>
          <span className="workspace-count">{data?.events.length ?? 0}</span>
        </div>

        <form
          className="stack"
          onSubmit={event => {
            event.preventDefault();
            setAppliedFilters({ ...draftFilters });
          }}
        >
          <div className="workspace-toolbar">
            {capabilities?.canReadPlatformAdmin ? (
              <>
                <label className="field">
                  <span>{copy.scope}</span>
                  <select
                    aria-label="Audit scope filter"
                    value={draftFilters.scope}
                    onChange={event => {
                      const scope = event.target.value as AuditFilterFormState['scope'];

                      setDraftFilters(currentValue => ({
                        ...currentValue,
                        scope,
                      }));
                    }}
                  >
                    <option value="platform">platform</option>
                    <option value="tenant">tenant</option>
                  </select>
                </label>
                <label className="field">
                  <span>{copy.tenant}</span>
                  <select
                    aria-label="Audit tenant filter"
                    value={draftFilters.tenantId}
                    onChange={event => {
                      setDraftFilters(currentValue => ({
                        ...currentValue,
                        tenantId: event.target.value,
                      }));
                    }}
                  >
                    <option value="">{copy.allTenants}</option>
                    {platformTenants.map(tenant => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className="field">
              <span>{copy.datePreset}</span>
              <select
                aria-label="Audit date preset filter"
                value={draftFilters.datePreset}
                onChange={event => {
                  const datePreset = event.target.value as AuditFilterFormState['datePreset'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    datePreset,
                  }));
                }}
              >
                <option value="">{copy.allDatePresets}</option>
                <option value="24h">24h</option>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
                <option value="90d">90d</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.action}</span>
              <input
                aria-label="Audit action filter"
                value={draftFilters.action}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    action: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>{copy.level}</span>
              <select
                aria-label="Audit level filter"
                value={draftFilters.level}
                onChange={event => {
                  const level = event.target.value as AuditFilterFormState['level'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    level,
                  }));
                }}
              >
                <option value="">{copy.allLevels}</option>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.detectorType}</span>
              <select
                aria-label="Audit detector filter"
                value={draftFilters.detectorType}
                onChange={event => {
                  const detectorType = event.target.value as AuditFilterFormState['detectorType'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    detectorType,
                  }));
                }}
              >
                <option value="">{copy.allDetectors}</option>
                <option value="secret">secret</option>
                <option value="pii">pii</option>
                <option value="regulated_term">regulated_term</option>
                <option value="exfiltration_pattern">exfiltration_pattern</option>
                <option value="prompt_injection">prompt_injection</option>
                <option value="data_exfiltration">data_exfiltration</option>
                <option value="policy_violation">policy_violation</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.entityType}</span>
              <select
                aria-label="Audit entity type filter"
                value={draftFilters.entityType}
                onChange={event => {
                  const entityType = event.target.value as AuditFilterFormState['entityType'];

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    entityType,
                  }));
                }}
              >
                <option value="">{copy.allEntityTypes}</option>
                <option value="tenant">tenant</option>
                <option value="user">user</option>
                <option value="session">session</option>
                <option value="workspace_app">workspace_app</option>
                <option value="conversation">conversation</option>
                <option value="policy_evaluation">policy_evaluation</option>
                <option value="run">run</option>
              </select>
            </label>
          </div>

          <div className="workspace-toolbar">
            <label className="field">
              <span>{copy.actorUserId}</span>
              <input
                aria-label="Audit actor filter"
                value={draftFilters.actorUserId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    actorUserId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>{copy.traceId}</span>
              <input
                aria-label="Audit trace filter"
                value={draftFilters.traceId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    traceId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>{copy.runId}</span>
              <input
                aria-label="Audit run filter"
                value={draftFilters.runId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    runId: event.target.value,
                  }));
                }}
              />
            </label>
          </div>

          <div className="workspace-toolbar">
            <label className="field">
              <span>{copy.conversationId}</span>
              <input
                aria-label="Audit conversation filter"
                value={draftFilters.conversationId}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    conversationId: event.target.value,
                  }));
                }}
              />
            </label>
            <label className="field">
              <span>{copy.payload}</span>
              <select
                aria-label="Audit payload mode"
                value={draftFilters.payloadMode}
                onChange={event => {
                  const payloadMode = event.target.value as AdminAuditPayloadMode;

                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    payloadMode,
                  }));
                }}
              >
                <option value="masked">masked</option>
                <option value="raw">raw</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.limit}</span>
              <input
                aria-label="Audit limit filter"
                inputMode="numeric"
                placeholder="40"
                value={draftFilters.limit}
                onChange={event => {
                  setDraftFilters(currentValue => ({
                    ...currentValue,
                    limit: event.target.value,
                  }));
                }}
              />
            </label>
            <div className="field">
              <span>{copy.actions}</span>
              <div className="actions">
                <button className="primary" type="submit" disabled={isDataLoading}>
                  {copy.apply}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setDraftFilters(defaultFilters);
                    setAppliedFilters(defaultFilters);
                  }}
                  disabled={isDataLoading}
                >
                  {copy.clear}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void handleExport('json');
                  }}
                  disabled={isDataLoading || exportingFormat !== null}
                >
                  {exportingFormat === 'json' ? copy.exportingJson : copy.exportJson}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void handleExport('csv');
                  }}
                  disabled={isDataLoading || exportingFormat !== null}
                >
                  {exportingFormat === 'csv' ? copy.exportingCsv : copy.exportCsv}
                </button>
              </div>
            </div>
          </div>
        </form>

        {data && hasAppliedFilters(data.appliedFilters) ? (
          <div className="tag-row admin-tag-row">
            {buildFilterTags(data.appliedFilters, tenantNameById).map(tag => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="helper-text">
            {capabilities?.canReadPlatformAdmin
              ? copy.noPlatformFilters
              : copy.noTenantFilters}
          </p>
        )}
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {exportError ? <div className="notice error">{exportError}</div> : null}
      {exportNotice ? <div className="notice success">{exportNotice}</div> : null}

      {!data ? null : (
        <>
          <div className="workspace-badges">
            <span className="workspace-badge">
              {copy.snapshot}: {formatDateTime(data.generatedAt)}
            </span>
            <span className="workspace-badge">{copy.scope}: {data.scope}</span>
            <span className="workspace-badge">{data.events.length} {copy.matchingEvents}</span>
            <span className="workspace-badge">
              {copy.highRisk}: {data.highRiskEventCount}
            </span>
            {capabilities?.canReadPlatformAdmin ? (
              <span className="workspace-badge">
                {copy.tenantSpread}: {data.countsByTenant.length}
              </span>
            ) : null}
          </div>

          <section className="admin-card stack">
            <div className="section-header">
              <div>
                <h2>{copy.topActions}</h2>
                <p>{data.scope === 'platform' ? copy.topActionsPlatformLead : copy.topActionsTenantLead}</p>
              </div>
            </div>
            <div className="tag-row admin-tag-row">
              {data.countsByAction.length === 0 ? (
                <span className="tag tag-muted">{copy.noAuditEvents}</span>
              ) : (
                data.countsByAction.map(actionCount => (
                  <span className="tag" key={actionCount.action}>
                    {actionCount.action} · {actionCount.count}
                  </span>
                ))
              )}
            </div>
          </section>

          {capabilities?.canReadPlatformAdmin ? (
            <section className="admin-card stack">
              <div className="section-header">
                <div>
                  <h2>{copy.tenantSpreadTitle}</h2>
                  <p>{copy.tenantSpreadLead}</p>
                </div>
              </div>
              <div className="tag-row admin-tag-row">
                {data.countsByTenant.length === 0 ? (
                  <span className="tag tag-muted">{copy.noTenantMatches}</span>
                ) : (
                  data.countsByTenant.map(tenantCount => (
                    <span className="tag" key={tenantCount.tenantId}>
                      {resolveTenantLabel(
                        tenantCount.tenantId,
                        tenantCount.tenantName,
                        tenantNameById
                      )}{' '}
                      · {tenantCount.count}
                    </span>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {data.events.length === 0 ? (
            <EmptyState lead={copy.filtersLead} title={copy.noMatchedEvents} />
          ) : (
            <div className="admin-grid">
              {data.events.map(event => (
                <article className="admin-card" key={event.id}>
                  <div className="section-header">
                    <div>
                      <h2>{event.action}</h2>
                      <p>
                        {event.entityType}
                        {event.entityId ? ` · ${event.entityId}` : ''}
                      </p>
                    </div>
                    <span className={`status-chip status-${event.level}`}>{event.level}</span>
                  </div>

                  <div className="detail-list">
                    <div className="detail-row">
                      <span className="detail-label">{copy.occurred}</span>
                      <strong>{formatDateTime(event.occurredAt)}</strong>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">{copy.actor}</span>
                      <strong>{event.actorUserId ?? copy.system}</strong>
                    </div>
                    {event.tenantName || event.tenantId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.tenant}</span>
                        <strong>
                          {resolveTenantLabel(event.tenantId, event.tenantName, tenantNameById)}
                        </strong>
                      </div>
                    ) : null}
                    <div className="detail-row">
                      <span className="detail-label">{copy.ip}</span>
                      <strong>{event.ipAddress ?? copy.notAvailable}</strong>
                    </div>
                    {event.context.traceId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.traceId}</span>
                        <strong>{event.context.traceId}</strong>
                      </div>
                    ) : null}
                    {event.context.runId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.runId}</span>
                        <strong>{event.context.runId}</strong>
                      </div>
                    ) : null}
                    {event.context.conversationId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.conversationId}</span>
                        <strong>{event.context.conversationId}</strong>
                      </div>
                    ) : null}
                    {event.context.appName || event.context.appId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.app}</span>
                        <strong>{event.context.appName ?? event.context.appId}</strong>
                      </div>
                    ) : null}
                    {event.context.activeGroupName || event.context.activeGroupId ? (
                      <div className="detail-row">
                        <span className="detail-label">{copy.group}</span>
                        <strong>{event.context.activeGroupName ?? event.context.activeGroupId}</strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="admin-code-block">
                    <strong>{copy.payload}</strong>
                    {event.payloadInspection.containsSensitiveData ? (
                      <>
                        <div className="tag-row admin-tag-row">
                          <span className="tag">
                            {event.payloadInspection.highRiskMatchCount > 0
                              ? copy.sensitivePayload
                              : copy.piiDetected}
                          </span>
                          <span className="tag tag-muted">
                            {event.payloadInspection.matches.length} {copy.matches}
                          </span>
                          <span className="tag tag-muted">
                            mode:{event.payloadInspection.mode}
                          </span>
                        </div>
                        <p className="helper-text">
                          {event.payloadInspection.mode === 'masked'
                            ? copy.maskedLead
                            : copy.rawLead}
                        </p>
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            disabled={isDataLoading}
                            onClick={() => {
                              const nextPayloadMode: AdminAuditPayloadMode =
                                data.appliedFilters.payloadMode === 'raw' ? 'masked' : 'raw';

                              setDraftFilters(currentValue => ({
                                ...currentValue,
                                payloadMode: nextPayloadMode,
                              }));
                              setAppliedFilters(currentValue => ({
                                ...currentValue,
                                payloadMode: nextPayloadMode,
                              }));
                            }}
                          >
                            {data.appliedFilters.payloadMode === 'raw'
                              ? copy.hideRaw
                              : copy.showRaw}
                          </button>
                        </div>
                        <div className="detail-list">
                          {event.payloadInspection.matches.map(match => (
                            <div className="detail-row" key={`${event.id}:${match.path}`}>
                              <span className="detail-label">{match.path}</span>
                              <strong>
                                {match.detector} · {match.risk} · {match.valuePreview}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
