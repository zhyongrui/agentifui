import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { printEvalSummary, runReleaseGate } from "./lib/harness.js";
import type { EvalPack } from "./lib/types.js";

function readArgValues(flag: string, args: string[]) {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      const value = args[index + 1];

      if (value && !value.startsWith("--")) {
        values.push(value);
      }
    }
  }

  return values;
}

function readArgValue(flag: string, args: string[]) {
  return readArgValues(flag, args)[0] ?? null;
}

function hasFlag(flag: string, args: string[]) {
  return args.includes(flag);
}

function readPack(args: string[]): EvalPack {
  const value = readArgValue("--pack", args);

  if (
    value === "full" ||
    value === "minimal" ||
    value === "release" ||
    value === "incident"
  ) {
    return value;
  }

  return "release";
}

function renderMarkdownReport(input: {
  generatedAt: string;
  outputDir: string;
  pack: EvalPack;
  fixtureCount: number;
  smokeChecks: Array<{ name: string; ok: boolean; notes: string }>;
}) {
  const lines = [
    "# Staging Replay Drill",
    "",
    `Generated at: ${input.generatedAt}`,
    `Pack: ${input.pack}`,
    `Fixtures replayed: ${input.fixtureCount}`,
    `Output directory: ${input.outputDir}`,
    "",
    "## Smoke checks",
    "",
    "| Check | Status | Notes |",
    "| --- | --- | --- |",
    ...input.smokeChecks.map((check) =>
      `| ${check.name} | ${check.ok ? "passed" : "failed"} | ${check.notes} |`,
    ),
    "",
    "## Required operator notes",
    "",
    "- Confirm the staging environment uses same-origin `/api/gateway/*` routing before running browser QA.",
    "- If browser validation is needed on this host class, reuse the documented Playwright runtime preparation and isolated port strategy.",
    "- Copy the generated report paths into the dev log so follow-on sessions can compare the next drill against this run.",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const outputDir =
    readArgValue("--write-output", args) ??
    join(process.cwd(), "artifacts", "evals", "staging-drill");
  mkdirSync(outputDir, { recursive: true });

  const report = await runReleaseGate({
    pack: readPack(args),
    appIds: readArgValues("--app", args),
    fixtureIds: readArgValues("--fixture", args),
    workstreams: readArgValues("--workstream", args),
    outputDir,
    failOnDiff: hasFlag("--fail-on-diff", args),
  });

  printEvalSummary(report.evals);
  writeFileSync(
    join(outputDir, "staging-drill.md"),
    renderMarkdownReport({
      generatedAt: report.generatedAt,
      outputDir,
      pack: report.evals.pack,
      fixtureCount: report.evals.results.length,
      smokeChecks: report.releaseSmoke,
    }),
    "utf8",
  );

  console.log(
    [
      `pack=${report.evals.pack}`,
      `fixtures=${report.evals.results.length}`,
      `smoke=${report.releaseSmoke.every((check) => check.ok) ? "passed" : "failed"}`,
      `output=${outputDir}`,
    ].join(" "),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
