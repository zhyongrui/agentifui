import { runReleaseGate } from "./lib/harness.js";
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

  return "minimal";
}

async function main() {
  const args = process.argv.slice(2);
  const report = await runReleaseGate({
    pack: readPack(args),
    appIds: readArgValues("--app", args),
    fixtureIds: readArgValues("--fixture", args),
    workstreams: readArgValues("--workstream", args),
    outputDir: readArgValue("--write-output", args),
    ci: args.includes("--ci"),
  });

  console.log(
    `release gate smoke=${report.releaseSmoke.length} evals=${report.evals.results.length}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
