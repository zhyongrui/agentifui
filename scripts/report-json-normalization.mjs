import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_DIR = path.resolve('packages', 'db', 'src', 'schema');
const OUTPUT_PATH = path.resolve('artifacts', 'data-lifecycle', 'json-field-audit.json');

function classifyCandidate(columnName, line) {
  if (/\$type<string\[]>\(\)/.test(line)) {
    return 'candidate_child_table';
  }

  if (/payload|outputs|inputs|metadata/.test(columnName)) {
    return 'structured_contract_or_child_table';
  }

  if (/mentions|favorite_app_ids|recent_app_ids|heading_path|labels|tags/.test(columnName)) {
    return 'candidate_normalized_join';
  }

  return 'retain_json_with_contract';
}

async function readSchemaFiles() {
  const entries = await readdir(SCHEMA_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(SCHEMA_DIR, entry.name));
}

async function main() {
  const schemaFiles = await readSchemaFiles();
  const fields = [];

  for (const filePath of schemaFiles) {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    let currentTable = null;

    for (const [index, line] of lines.entries()) {
      const tableMatch = line.match(/export const (\w+) = pgTable\(/);

      if (tableMatch) {
        currentTable = tableMatch[1];
      }

      const columnMatch = line.match(/jsonb\('([^']+)'\)/);

      if (!columnMatch) {
        continue;
      }

      fields.push({
        table: currentTable,
        column: columnMatch[1],
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        recommendation: classifyCandidate(columnMatch[1], line),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalFields: fields.length,
    fields,
    summary: fields.reduce((accumulator, field) => {
      accumulator[field.recommendation] = (accumulator[field.recommendation] ?? 0) + 1;
      return accumulator;
    }, {}),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath: OUTPUT_PATH, totalFields: fields.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
