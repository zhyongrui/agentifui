import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import postgres from 'postgres';

const TABLE_GROUPS = {
  audit: ['audit_events'],
  collaboration: ['workspace_comments', 'workspace_notifications', 'workspace_conversation_shares'],
  history: ['conversations', 'runs', 'run_timeline_events'],
  knowledge: ['knowledge_sources', 'knowledge_source_chunks'],
  uploads: ['workspace_uploaded_files', 'workspace_artifacts'],
};

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  return value;
}

async function main() {
  const sql = postgres(requireDatabaseUrl(), {
    max: 1,
    prepare: false,
  });

  try {
    const tableRows = await sql`
      select
        schemaname,
        relname as "tableName",
        n_live_tup::bigint as "rowCount",
        pg_total_relation_size(relid)::bigint as "totalBytes",
        pg_relation_size(relid)::bigint as "tableBytes",
        (pg_total_relation_size(relid) - pg_relation_size(relid))::bigint as "indexBytes"
      from pg_stat_user_tables
      where relname = any(${Object.values(TABLE_GROUPS).flat()})
      order by pg_total_relation_size(relid) desc
    `;

    const tables = tableRows.map((row) => {
      const category =
        Object.entries(TABLE_GROUPS).find(([, tableNames]) => tableNames.includes(row.tableName))?.[0] ??
        'other';

      return {
        ...row,
        category,
      };
    });

    const summary = tables.reduce((accumulator, table) => {
      const current = accumulator[table.category] ?? {
        rowCount: 0n,
        tableCount: 0,
        totalBytes: 0n,
      };

      accumulator[table.category] = {
        rowCount: current.rowCount + BigInt(table.rowCount),
        tableCount: current.tableCount + 1,
        totalBytes: current.totalBytes + BigInt(table.totalBytes),
      };
      return accumulator;
    }, {});

    const output = {
      generatedAt: new Date().toISOString(),
      summary: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [
          key,
          {
            rowCount: Number(value.rowCount),
            tableCount: value.tableCount,
            totalBytes: Number(value.totalBytes),
          },
        ]),
      ),
      tables,
    };

    const outputDir = path.resolve('artifacts', 'data-lifecycle');
    const outputPath = path.join(outputDir, 'storage-growth-report.json');
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, tableCount: tables.length }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
