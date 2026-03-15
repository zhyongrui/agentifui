import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function requireEnv(name, fallback) {
  const value = process.env[name]?.trim() ?? fallback ?? '';

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function buildUrl(baseUrl, route) {
  return new URL(route, `${baseUrl}/`).toString();
}

async function readJson(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  return text;
}

async function expectOkJson(label, response) {
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function writeJsonArtifact(targetPath, payload) {
  const normalizedPath = path.resolve(targetPath);
  await mkdir(path.dirname(normalizedPath), { recursive: true });
  await writeFile(`${normalizedPath}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return normalizedPath;
}

async function readJsonArtifact(targetPath) {
  const normalizedPath = path.resolve(targetPath);
  const raw = await readFile(normalizedPath, 'utf8');
  return JSON.parse(raw);
}

function defaultArtifactPath(prefix) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve('artifacts', 'perf', `${prefix}-${timestamp}.json`);
}

async function runConcurrentSamples({ iterations, concurrency, execute }) {
  const workerCount = Math.max(1, Math.min(concurrency, iterations));
  const samples = new Array(iterations);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const sampleIndex = nextIndex;
        nextIndex += 1;

        if (sampleIndex >= iterations) {
          return;
        }

        const startedAt = Date.now();

        try {
          const metadata = (await execute(sampleIndex)) ?? {};
          const measuredDurationMs =
            typeof metadata.durationMs === 'number' && Number.isFinite(metadata.durationMs)
              ? metadata.durationMs
              : Date.now() - startedAt;
          samples[sampleIndex] = {
            ok: true,
            durationMs: measuredDurationMs,
            ...metadata,
          };
        } catch (error) {
          samples[sampleIndex] = {
            ok: false,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }),
  );

  return samples;
}

function summarizeSamples(name, samples, budget) {
  const durations = samples.filter(sample => sample.ok).map(sample => sample.durationMs);
  const errorCount = samples.length - durations.length;
  const p95Ms = percentile(durations, 0.95);
  const p50Ms = percentile(durations, 0.5);
  const averageMs = average(durations);
  const maxMs = durations.length > 0 ? Math.max(...durations) : 0;
  const minMs = durations.length > 0 ? Math.min(...durations) : 0;
  const errorRate = samples.length > 0 ? errorCount / samples.length : 0;
  const budgetStatus = budget
    ? {
        p95TargetMs: budget.p95TargetMs,
        errorRateTarget: budget.errorRateTarget,
        passed: p95Ms <= budget.p95TargetMs && errorRate <= budget.errorRateTarget,
      }
    : null;

  return {
    name,
    sampleCount: samples.length,
    successCount: durations.length,
    errorCount,
    errorRate,
    averageMs,
    minMs,
    p50Ms,
    p95Ms,
    maxMs,
    budget: budgetStatus,
    samples,
  };
}

export {
  average,
  buildUrl,
  defaultArtifactPath,
  expectOkJson,
  normalizeBaseUrl,
  percentile,
  readJson,
  readJsonArtifact,
  requireEnv,
  runConcurrentSamples,
  summarizeSamples,
  writeJsonArtifact,
};
