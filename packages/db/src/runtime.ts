import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

type DatabaseClient = postgres.Sql<Record<string, unknown>>;

type CreateDatabaseClientOptions = {
  connectionString: string;
  max?: number;
};

type MigrationOptions = {
  migrationsDir?: string;
};

function resolveMigrationsDir() {
  return fileURLToPath(new URL('../migrations', import.meta.url));
}

export function createDatabaseClient(options: CreateDatabaseClientOptions): DatabaseClient {
  return postgres(options.connectionString, {
    max: options.max ?? 1,
    onnotice: () => {},
    prepare: false,
  });
}

export async function closeDatabaseClient(client: DatabaseClient) {
  await client.end({ timeout: 5 });
}

export async function migrateDatabase(
  client: DatabaseClient,
  options: MigrationOptions = {}
) {
  const migrationsDir = options.migrationsDir ?? resolveMigrationsDir();
  const migrationFiles = (await readdir(migrationsDir))
    .filter(entry => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  await client.unsafe(`
    create table if not exists _agentifui_migrations (
      filename varchar(255) primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const appliedRows = await client<{ filename: string }[]>`
    select filename
    from _agentifui_migrations
  `;
  const appliedFiles = new Set(appliedRows.map(row => row.filename));

  for (const filename of migrationFiles) {
    if (appliedFiles.has(filename)) {
      continue;
    }

    const sql = await readFile(join(migrationsDir, filename), 'utf8');

    await client.begin(async transaction => {
      await transaction.unsafe(sql);
      await transaction.unsafe(
        'insert into _agentifui_migrations (filename) values ($1)',
        [filename]
      );
    });
  }
}

export async function resetDatabase(client: DatabaseClient) {
  await client.unsafe(`
    drop schema if exists public cascade;
    create schema public;
  `);
}

function toTenantSlug(tenantId: string) {
  const slug = tenantId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'default-tenant';
}

export async function ensureTenant(
  client: DatabaseClient,
  input: {
    tenantId: string;
    name?: string;
  }
) {
  const tenantId = input.tenantId.trim();
  const slug = toTenantSlug(tenantId);
  const name =
    input.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  await client`
    insert into tenants (id, slug, name, status, metadata, created_at, updated_at)
    values (${tenantId}, ${slug}, ${name}, 'active', '{}'::jsonb, now(), now())
    on conflict (id) do update
    set slug = excluded.slug,
        name = excluded.name,
        updated_at = now()
  `;
}

export type { DatabaseClient };
