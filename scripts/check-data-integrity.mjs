import postgres from 'postgres';

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  return value;
}

const CHECKS = [
  {
    name: 'runs_conversation_tenant_mismatch',
    sql: `
      select count(*)::int as count
      from runs r
      join conversations c on c.id = r.conversation_id
      where r.tenant_id <> c.tenant_id
         or r.user_id <> c.user_id
         or r.app_id <> c.app_id
    `,
  },
  {
    name: 'artifacts_run_conversation_mismatch',
    sql: `
      select count(*)::int as count
      from workspace_artifacts a
      join runs r on r.id = a.run_id
      where a.conversation_id <> r.conversation_id
         or a.tenant_id <> r.tenant_id
         or a.user_id <> r.user_id
    `,
  },
  {
    name: 'timeline_run_conversation_mismatch',
    sql: `
      select count(*)::int as count
      from run_timeline_events e
      join runs r on r.id = e.run_id
      where e.conversation_id <> r.conversation_id
         or e.tenant_id <> r.tenant_id
         or e.user_id <> r.user_id
    `,
  },
  {
    name: 'launch_trace_mismatch',
    sql: `
      select count(*)::int as count
      from workspace_app_launches l
      join runs r on r.id = l.run_id
      where l.conversation_id is distinct from r.conversation_id
         or l.trace_id is distinct from r.trace_id
    `,
  },
  {
    name: 'share_group_tenant_mismatch',
    sql: `
      select count(*)::int as count
      from workspace_conversation_shares s
      join conversations c on c.id = s.conversation_id
      join groups g on g.id = s.shared_group_id
      where s.tenant_id <> c.tenant_id
         or s.tenant_id <> g.tenant_id
    `,
  },
  {
    name: 'comment_target_run_missing',
    sql: `
      select count(*)::int as count
      from workspace_comments c
      where c.target_type = 'run'
        and not exists (select 1 from runs r where r.id = c.target_id)
    `,
  },
  {
    name: 'comment_target_artifact_missing',
    sql: `
      select count(*)::int as count
      from workspace_comments c
      where c.target_type = 'artifact'
        and not exists (select 1 from workspace_artifacts a where a.id = c.target_id)
    `,
  },
  {
    name: 'notifications_comment_target_mismatch',
    sql: `
      select count(*)::int as count
      from workspace_notifications n
      join workspace_comments c on c.id = n.comment_id
      where n.conversation_id <> c.conversation_id
         or n.target_type <> c.target_type
         or n.target_id <> c.target_id
    `,
  },
  {
    name: 'knowledge_chunk_tenant_mismatch',
    sql: `
      select count(*)::int as count
      from knowledge_source_chunks c
      join knowledge_sources s on s.id = c.source_id
      where c.tenant_id <> s.tenant_id
    `,
  },
];

async function main() {
  const sql = postgres(requireDatabaseUrl(), {
    max: 1,
    prepare: false,
  });

  try {
    const results = [];

    for (const check of CHECKS) {
      const [row] = await sql.unsafe(check.sql);
      results.push({
        name: check.name,
        count: row?.count ?? 0,
        ok: (row?.count ?? 0) === 0,
      });
    }

    const failed = results.filter((result) => !result.ok);
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

    if (failed.length > 0) {
      throw new Error(`Integrity checks failed: ${failed.map((item) => item.name).join(', ')}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
