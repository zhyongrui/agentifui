'use client';

import type {
  WorkflowDefinitionDocument,
  WorkflowDefinitionListResponse,
  WorkflowPermissionRole,
} from '@agentifui/shared';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { EmptyState, SectionSkeleton } from '../../../components/section-state';
import {
  createAdminWorkflow,
  dryRunAdminWorkflow,
  exportAdminWorkflow,
  fetchAdminWorkflows,
  importAdminWorkflow,
  publishAdminWorkflow,
  rollbackAdminWorkflow,
  updateAdminWorkflow,
  updateAdminWorkflowPermissions,
} from '../../../lib/admin-client';
import { useAdminPageData } from '../../../lib/use-admin-page';

function buildSampleDocument(): WorkflowDefinitionDocument {
  return {
    nodes: [
      {
        id: 'node_prompt',
        type: 'prompt',
        title: 'Collect request context',
        description: 'Capture the operator request and normalize variables.',
        config: {
          template: 'Summarize the incident request and identify owners.',
        },
      },
      {
        id: 'node_tool',
        type: 'tool_call',
        title: 'Run usage check',
        description: 'Call the tenant usage tool before approval.',
        config: {
          toolName: 'tenant.usage.read',
        },
      },
    ],
    edges: [
      {
        id: 'edge_prompt_tool',
        fromNodeId: 'node_prompt',
        toNodeId: 'node_tool',
      },
    ],
    variables: [
      {
        id: 'var_request',
        name: 'request',
        label: 'User request',
        required: true,
      },
    ],
    approvals: [
      {
        id: 'approval_ops',
        label: 'Operator approval',
        policyTag: 'ops-approval',
        approverRole: 'reviewer',
      },
    ],
  };
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parsePermissions(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [userEmail, role] = line.split(':').map((part) => part.trim());

      return {
        userEmail,
        role: (role || 'runner') as WorkflowPermissionRole,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        userEmail: string;
        role: WorkflowPermissionRole;
      } => typeof entry.userEmail === 'string' && entry.userEmail.length > 0,
    );
}

export default function AdminWorkflowsPage() {
  const loadWorkflows = useCallback((sessionToken: string) => fetchAdminWorkflows(sessionToken), []);
  const { data, error, isLoading, reload, session } =
    useAdminPageData<WorkflowDefinitionListResponse['data']>(loadWorkflows);
  const [draftSlug, setDraftSlug] = useState('incident-review');
  const [draftTitle, setDraftTitle] = useState('Incident Review Flow');
  const [draftDescription, setDraftDescription] = useState('Review incident context, usage, approvals and export evidence.');
  const [draftDocument, setDraftDocument] = useState(() => toPrettyJson(buildSampleDocument()));
  const [importPayload, setImportPayload] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, string>>({});
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string>>({});
  const [dryRunSummary, setDryRunSummary] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data?.workflows) {
      return;
    }

    setWorkflowDrafts((current) => {
      const next = { ...current };

      data.workflows.forEach((workflow) => {
        if (!next[workflow.id]) {
          const latestVersion = workflow.versions[workflow.versions.length - 1];
          next[workflow.id] = toPrettyJson(latestVersion?.document ?? buildSampleDocument());
        }
      });

      return next;
    });
    setPermissionDrafts((current) => {
      const next = { ...current };

      data.workflows.forEach((workflow) => {
        if (!next[workflow.id]) {
          next[workflow.id] = workflow.permissions
            .map((permission) => `${permission.userEmail}:${permission.role}`)
            .join('\n');
        }
      });

      return next;
    });
  }, [data?.workflows]);

  const workflows = useMemo(() => data?.workflows ?? [], [data?.workflows]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      return;
    }

    setPendingId('create');
    setMutationError(null);
    setNotice(null);

    try {
      const document = JSON.parse(draftDocument) as WorkflowDefinitionDocument;
      const result = await createAdminWorkflow(session.sessionToken, {
        slug: draftSlug,
        title: draftTitle,
        description: draftDescription,
        document,
      });

      if (!result.ok) {
        setMutationError(result.error.message);
        return;
      }

      setNotice(`已创建工作流 ${result.data.workflow.title}。`);
      reload();
    } catch {
      setMutationError('工作流 JSON 无法解析。');
    } finally {
      setPendingId(null);
    }
  }

  async function mutateWorkflow(workflowId: string, action: string, fn: () => Promise<void>) {
    setPendingId(`${workflowId}:${action}`);
    setMutationError(null);
    setNotice(null);

    try {
      await fn();
      reload();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : '工作流操作失败。');
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) {
    return <SectionSkeleton blocks={6} lead="正在加载工作流定义..." title="工作流" />;
  }

  return (
    <div className="stack">
      <div>
        <h1>工作流</h1>
        <p className="lead">管理可版本化的工作流定义、验证结果、权限、发布、回滚，以及跨环境导入导出。</p>
      </div>
      {notice ? <div className="notice success">{notice}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {mutationError ? <div className="notice error">{mutationError}</div> : null}

      <form className="card stack" onSubmit={handleCreate}>
        <h2>新建工作流</h2>
        <label className="field">
          <span>Slug</span>
          <input value={draftSlug} onChange={(event) => setDraftSlug(event.target.value)} />
        </label>
        <label className="field">
          <span>标题</span>
          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>描述</span>
          <textarea rows={2} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
        </label>
        <label className="field">
          <span>定义 JSON</span>
          <textarea rows={16} value={draftDocument} onChange={(event) => setDraftDocument(event.target.value)} />
        </label>
        <button className="primary" disabled={pendingId === 'create'} type="submit">
          {pendingId === 'create' ? '创建中...' : '创建工作流'}
        </button>
      </form>

      <section className="card stack">
        <h2>导入工作流</h2>
        <label className="field">
          <span>导入 JSON</span>
          <textarea rows={10} value={importPayload} onChange={(event) => setImportPayload(event.target.value)} />
        </label>
        <button
          className="secondary"
          disabled={!session || pendingId === 'import'}
          type="button"
          onClick={() =>
            void mutateWorkflow('import', 'import', async () => {
              if (!session) {
                return;
              }

              const result = await importAdminWorkflow(session.sessionToken, JSON.parse(importPayload));

              if (!result.ok) {
                throw new Error(result.error.message);
              }

              setNotice(`已导入 ${result.data.importedVersionCount} 个版本到 ${result.data.workflow.title}。`);
            })
          }
        >
          {pendingId === 'import' ? '导入中...' : '导入工作流'}
        </button>
      </section>

      <section className="stack">
        {workflows.length === 0 ? (
          <EmptyState lead="当前租户还没有工作流定义。" title="暂无工作流" />
        ) : (
          workflows.map((workflow) => {
            const latestVersion = workflow.versions[workflow.versions.length - 1];
            const publishedVersion =
              workflow.versions.find((version) => version.status === 'published') ?? latestVersion;

            return (
              <article className="card stack" key={workflow.id}>
                <div className="section-header">
                  <div>
                    <h2>{workflow.title}</h2>
                    <p>{workflow.slug} · 当前版本状态 {workflow.currentVersionStatus ?? 'unknown'}</p>
                  </div>
                  <span className="tag">{workflow.versions.length} versions</span>
                </div>
                <p className="lead">{workflow.description ?? '未填写描述。'}</p>
                <div className="tag-row">
                  {workflow.versions.map((version) => (
                    <span className="tag" key={version.id}>
                      v{version.versionNumber} · {version.status}
                    </span>
                  ))}
                </div>
                <label className="field">
                  <span>最新草稿 JSON</span>
                  <textarea
                    rows={14}
                    value={workflowDrafts[workflow.id] ?? ''}
                    onChange={(event) =>
                      setWorkflowDrafts((current) => ({
                        ...current,
                        [workflow.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="app-actions">
                  <button
                    className="secondary"
                    disabled={pendingId === `${workflow.id}:save`}
                    type="button"
                    onClick={() =>
                      void mutateWorkflow(workflow.id, 'save', async () => {
                        if (!session) return;
                        const result = await updateAdminWorkflow(session.sessionToken, workflow.id, {
                          document: JSON.parse(workflowDrafts[workflow.id] ?? '{}'),
                        });

                        if (!result.ok) {
                          throw new Error(result.error.message);
                        }

                        setNotice(`已保存 ${workflow.title} 的新草稿版本。`);
                      })
                    }
                  >
                    保存草稿
                  </button>
                  <button
                    className="secondary"
                    disabled={pendingId === `${workflow.id}:dry-run`}
                    type="button"
                    onClick={() =>
                      void mutateWorkflow(workflow.id, 'dry-run', async () => {
                        if (!session) return;
                        const result = await dryRunAdminWorkflow(session.sessionToken, workflow.id, {});

                        if (!result.ok) {
                          throw new Error(result.error.message);
                        }

                        setDryRunSummary((current) => ({
                          ...current,
                          [workflow.id]: `valid=${result.data.valid} · errors=${result.data.errors.length} · preview=${result.data.planPreview.length}`,
                        }));
                        setNotice(`已完成 ${workflow.title} 的 dry-run。`);
                      })
                    }
                  >
                    Dry run
                  </button>
                  <button
                    className="secondary"
                    disabled={!latestVersion || pendingId === `${workflow.id}:publish`}
                    type="button"
                    onClick={() =>
                      void mutateWorkflow(workflow.id, 'publish', async () => {
                        if (!session || !latestVersion) return;
                        const result = await publishAdminWorkflow(session.sessionToken, workflow.id, {
                          versionId: latestVersion.id,
                        });

                        if (!result.ok) {
                          throw new Error(result.error.message);
                        }

                        setNotice(`已发布 ${workflow.title} v${result.data.version.versionNumber}。`);
                      })
                    }
                  >
                    发布最新版本
                  </button>
                  <button
                    className="secondary"
                    disabled={!publishedVersion || pendingId === `${workflow.id}:rollback`}
                    type="button"
                    onClick={() =>
                      void mutateWorkflow(workflow.id, 'rollback', async () => {
                        if (!session || !publishedVersion) return;
                        const result = await rollbackAdminWorkflow(session.sessionToken, workflow.id, {
                          targetVersionId: publishedVersion.id,
                        });

                        if (!result.ok) {
                          throw new Error(result.error.message);
                        }

                        setNotice(`已回滚 ${workflow.title} 到 v${publishedVersion.versionNumber}。`);
                      })
                    }
                  >
                    回滚到当前已发布版本
                  </button>
                  <button
                    className="secondary"
                    disabled={pendingId === `${workflow.id}:export`}
                    type="button"
                    onClick={() =>
                      void mutateWorkflow(workflow.id, 'export', async () => {
                        if (!session) return;
                        const result = await exportAdminWorkflow(session.sessionToken, workflow.id);

                        if (!result.ok) {
                          throw new Error(result.error.message);
                        }

                        setImportPayload(toPrettyJson(result.data));
                        setNotice(`已导出 ${workflow.title}，结果已填入导入框。`);
                      })
                    }
                  >
                    导出
                  </button>
                </div>
                <label className="field">
                  <span>权限（每行 `email:role`）</span>
                  <textarea
                    rows={6}
                    value={permissionDrafts[workflow.id] ?? ''}
                    onChange={(event) =>
                      setPermissionDrafts((current) => ({
                        ...current,
                        [workflow.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="secondary"
                  disabled={pendingId === `${workflow.id}:permissions`}
                  type="button"
                  onClick={() =>
                    void mutateWorkflow(workflow.id, 'permissions', async () => {
                      if (!session) return;
                      const result = await updateAdminWorkflowPermissions(session.sessionToken, workflow.id, {
                        permissions: parsePermissions(permissionDrafts[workflow.id] ?? ''),
                      });

                      if (!result.ok) {
                        throw new Error(result.error.message);
                      }

                      setNotice(`已更新 ${workflow.title} 的权限，共 ${result.data.permissions.length} 条。`);
                    })
                  }
                >
                  保存权限
                </button>
                {dryRunSummary[workflow.id] ? <p className="lead">Dry run: {dryRunSummary[workflow.id]}</p> : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
