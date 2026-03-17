import { runEvalFixtures, printEvalSummary } from "./lib/harness.js";
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

  return "full";
}

async function main() {
  const args = process.argv.slice(2);
  const collection = await runEvalFixtures({
    pack: readPack(args),
    appIds: readArgValues("--app", args),
    fixtureIds: readArgValues("--fixture", args),
    workstreams: readArgValues("--workstream", args),
    outputDir: readArgValue("--write-output", args),
    updateSnapshots: hasFlag("--update-snapshots", args),
    failOnDiff: hasFlag("--fail-on-diff", args),
  });

  printEvalSummary(collection);
  console.log(
    `eval fixtures=${collection.results.length} pack=${collection.pack} git=${collection.gitCommit ?? "unknown"}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
