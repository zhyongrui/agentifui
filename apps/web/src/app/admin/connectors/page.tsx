'use client';

import type {
  ConnectorCreateRequest,
  ConnectorHealthResponse,
  ConnectorStatus,
} from '@agentifui/shared';
import { useCallback, useState, type FormEvent } from 'react';

import { EmptyState, SectionSkeleton } from '../../../components/section-state';
import {
  createAdminConnector,
  deleteAdminConnector,
  fetchAdminConnectorHealth,
  queueAdminConnectorSync,
  rotateAdminConnectorCredential,
  updateAdminConnectorStatus,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

export default function AdminConnectorsPage() {
  const loadConnectors = useCallback((sessionToken: string) => fetchAdminConnectorHealth(sessionToken), []);
  const { data, error, isLoading, reload, session } =
    useAdminPageData<ConnectorHealthResponse['data']>(loadConnectors);
  const [draft, setDraft] = useState<ConnectorCreateRequest>({
    title: '',
    kind: 'web',
    scope: 'tenant',
    groupId: null,
    cadenceMinutes: 60,
    authType: 'none',
    authSecret: null,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPendingId('create');
    setMutationError(null);
    const result = await createAdminConnector(session.sessionToken, draft);
    setPendingId(null);
    if (!result.ok) {
      setMutationError(result.error.message);
      return;
    }
    setNotice(`已创建连接器 ${result.data.title}`);
    setDraft({ title: '', kind: 'web', scope: 'tenant', groupId: null, cadenceMinutes: 60, authType: 'none', authSecret: null });
    reload();
  }

  async function mutateConnector(connectorId: string, action: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setPendingId(`${connectorId}:${action}`);
    setMutationError(null);
    setNotice(null);
    const result = await fn();
    setPendingId(null);
    if (!result.ok) {
      setMutationError(result.error?.message ?? '连接器操作失败。');
      return;
    }
    setNotice('连接器状态已更新。');
    reload();
  }

  if (isLoading) {
    return <SectionSkeleton blocks={5} lead="正在加载连接器状态..." title="连接器" />;
  }

  return (
    <div className="stack">
      <div>
        <h1>连接器</h1>
        <p className="lead">查看连接器健康度、失败摘要，并直接在治理面执行同步、暂停、吊销、轮换凭据和删除。</p>
      </div>
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}
      <form className="card stack" onSubmit={handleCreate}>
        <h2>新建连接器</h2>
        <label className="field"><span>标题</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
        <label className="field"><span>类型</span><select value={draft.kind} onChange={event => setDraft(current => ({ ...current, kind: event.target.value as ConnectorCreateRequest['kind'] }))}><option value="web">Web</option><option value="google_drive">Google Drive</option><option value="notion">Notion</option><option value="confluence">Confluence</option><option value="file_drop">File Drop</option></select></label>
        <label className="field"><span>作用域</span><select value={draft.scope} onChange={event => setDraft(current => ({ ...current, scope: event.target.value as ConnectorCreateRequest['scope'] }))}><option value="tenant">租户</option><option value="group">群组</option></select></label>
        {draft.scope === 'group' ? <label className="field"><span>群组 ID</span><input value={draft.groupId ?? ''} onChange={event => setDraft(current => ({ ...current, groupId: event.target.value || null }))} placeholder="grp_research" /></label> : null}
        <label className="field"><span>认证方式</span><select value={draft.authType} onChange={event => setDraft(current => ({ ...current, authType: event.target.value as ConnectorCreateRequest['authType'] }))}><option value="none">None</option><option value="token">Token</option><option value="oauth">OAuth</option><option value="service_account">Service account</option></select></label>
        {draft.authType !== 'none' ? <label className="field"><span>密钥</span><input value={draft.authSecret ?? ''} onChange={event => setDraft(current => ({ ...current, authSecret: event.target.value || null }))} /></label> : null}
        <button className="primary" disabled={pendingId === 'create'} type="submit">{pendingId === 'create' ? '创建中...' : '创建连接器'}</button>
      </form>
      <section className="card stack">
        <h2>健康总览</h2>
        <div className="tag-row">
          {Object.entries(data?.counts ?? {}).map(([key, count]) => <span className="tag" key={key}>{key}: {count}</span>)}
        </div>
      </section>
      <section className="stack">
        {(data?.connectors ?? []).length === 0 ? (
          <EmptyState lead="当前租户还没有连接器。" title="暂无连接器" />
        ) : (
          data?.connectors.map(connector => (
            <article className="card stack" key={connector.id}>
              <div className="section-header"><div><h2>{connector.title}</h2><p>{connector.kind} · {connector.scope} · {connector.status}</p></div><span className={`status-chip status-${connector.health.severity}`}>{connector.health.severity}</span></div>
              <div className="tag-row">{connector.health.issues.length > 0 ? connector.health.issues.map(issue => <span className="tag tag-muted" key={issue.code}>{issue.summary}</span>) : <span className="tag">healthy</span>}</div>
              <p className="lead">上次同步：{connector.lastSyncedAt ? new Date(connector.lastSyncedAt).toLocaleString() : '未同步'}。失败次数：{connector.health.failureSummary.totalFailures}</p>
              <div className="app-actions">
                <button className="secondary" disabled={pendingId === `${connector.id}:sync`} onClick={() => mutateConnector(connector.id, 'sync', () => queueAdminConnectorSync(session!.sessionToken, connector.id, {}))} type="button">立即同步</button>
                <button className="secondary" disabled={pendingId === `${connector.id}:status`} onClick={() => mutateConnector(connector.id, 'status', () => updateAdminConnectorStatus(session!.sessionToken, connector.id, { status: connector.status === 'active' ? 'paused' : 'active' as ConnectorStatus }))} type="button">{connector.status === 'active' ? '暂停' : '启用'}</button>
                <button className="secondary" disabled={pendingId === `${connector.id}:revoke`} onClick={() => mutateConnector(connector.id, 'revoke', () => updateAdminConnectorStatus(session!.sessionToken, connector.id, { status: 'revoked' }))} type="button">吊销</button>
                <button className="secondary" disabled={pendingId === `${connector.id}:rotate`} onClick={() => mutateConnector(connector.id, 'rotate', () => rotateAdminConnectorCredential(session!.sessionToken, connector.id, { authSecret: 'rotated-secret', note: 'admin-ui-rotate' }))} type="button">轮换密钥</button>
                <button className="secondary" disabled={pendingId === `${connector.id}:delete`} onClick={() => mutateConnector(connector.id, 'delete', () => deleteAdminConnector(session!.sessionToken, connector.id))} type="button">删除</button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
