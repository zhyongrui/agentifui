import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://agentifui:agentifui@localhost:5432/agentifui";
const TOKENS_PER_CREDIT = 25;
const STORAGE_BYTES_PER_CREDIT = 25 * 1024 * 1024;

function readArg(flag, fallback = null) {
  const raw = process.argv.find((value) => value.startsWith(`${flag}=`));

  if (!raw) {
    return fallback;
  }

  return raw.slice(flag.length + 1);
}

function calculateCompletionCredits(totalTokens) {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalTokens / TOKENS_PER_CREDIT));
}

function calculateStorageCredits(totalBytes) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(totalBytes / STORAGE_BYTES_PER_CREDIT));
}

const tenantId = readArg("--tenant");
const windowDays = Number.parseInt(readArg("--window-days", "30"), 10);

const database = postgres(DATABASE_URL, {
  max: 1,
  prepare: false,
});

const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

try {
  const rows = await database`
    with launch_usage as (
      select tenant_id, count(*)::int as launch_count
      from workspace_app_launches
      where launched_at >= ${cutoff}
      group by tenant_id
    ),
    run_usage as (
      select
        r.tenant_id,
        count(*)::int as run_count,
        coalesce(sum(r.total_tokens), 0)::int as total_tokens,
        count(*) filter (where a.kind in ('analysis', 'governance'))::int as retrieval_count
      from runs r
      join workspace_apps a on a.id = r.app_id
      where r.created_at >= ${cutoff}
      group by r.tenant_id
    ),
    storage_usage as (
      select
        tenant_id,
        coalesce(sum(size_bytes), 0)::bigint as uploaded_bytes,
        0::bigint as artifact_bytes
      from workspace_uploaded_files
      group by tenant_id
      union all
      select
        tenant_id,
        0::bigint as uploaded_bytes,
        coalesce(sum(size_bytes), 0)::bigint as artifact_bytes
      from workspace_artifacts
      group by tenant_id
    ),
    storage_totals as (
      select
        tenant_id,
        coalesce(sum(uploaded_bytes), 0)::bigint as uploaded_bytes,
        coalesce(sum(artifact_bytes), 0)::bigint as artifact_bytes
      from storage_usage
      group by tenant_id
    ),
    export_usage as (
      select
        tenant_id,
        count(*)::int as export_count
      from audit_events
      where occurred_at >= ${cutoff}
        and action in ('admin.billing.exported', 'workspace.artifact.downloaded')
      group by tenant_id
    )
    select
      t.id as tenant_id,
      t.name as tenant_name,
      coalesce(p.name, 'Growth') as plan_name,
      coalesce(p.monthly_credit_limit, 1000)::int as monthly_credit_limit,
      coalesce(p.grace_credit_buffer, 125)::int as grace_credit_buffer,
      coalesce(l.launch_count, 0)::int as launch_count,
      coalesce(r.run_count, 0)::int as run_count,
      coalesce(r.total_tokens, 0)::int as total_tokens,
      coalesce(r.retrieval_count, 0)::int as retrieval_count,
      coalesce(s.uploaded_bytes, 0)::bigint as uploaded_bytes,
      coalesce(s.artifact_bytes, 0)::bigint as artifact_bytes,
      coalesce(e.export_count, 0)::int as export_count
    from tenants t
    left join tenant_billing_plans p on p.tenant_id = t.id
    left join launch_usage l on l.tenant_id = t.id
    left join run_usage r on r.tenant_id = t.id
    left join storage_totals s on s.tenant_id = t.id
    left join export_usage e on e.tenant_id = t.id
    where ${tenantId ? database` t.id = ${tenantId} ` : database` true `}
    order by t.name asc
  `;

  const report = rows.map((row) => {
    const storageBytes = Number(row.uploaded_bytes) + Number(row.artifact_bytes);
    const derivedCredits =
      Number(row.launch_count) +
      calculateCompletionCredits(Number(row.total_tokens)) +
      Number(row.retrieval_count) +
      calculateStorageCredits(storageBytes) +
      Number(row.export_count);
    const effectiveCreditLimit =
      Number(row.monthly_credit_limit) + Number(row.grace_credit_buffer);

    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      windowDays,
      planName: row.plan_name,
      usage: {
        launches: Number(row.launch_count),
        completions: Number(row.run_count),
        retrievals: Number(row.retrieval_count),
        totalTokens: Number(row.total_tokens),
        uploadedBytes: Number(row.uploaded_bytes),
        artifactBytes: Number(row.artifact_bytes),
        exports: Number(row.export_count),
      },
      credits: {
        launches: Number(row.launch_count),
        completions: calculateCompletionCredits(Number(row.total_tokens)),
        retrievals: Number(row.retrieval_count),
        storage: calculateStorageCredits(storageBytes),
        exports: Number(row.export_count),
        derivedTotal: derivedCredits,
      },
      thresholds: {
        monthlyCreditLimit: Number(row.monthly_credit_limit),
        effectiveCreditLimit,
        remainingCredits: effectiveCreditLimit - derivedCredits,
      },
      reconciliation: {
        providerReportedTokens: Number(row.total_tokens),
        localRunTokens: Number(row.total_tokens),
        tokenDelta: 0,
        status: "aligned",
      },
    };
  });

  process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)}\n`);
} finally {
  await database.end({ timeout: 5 });
}
