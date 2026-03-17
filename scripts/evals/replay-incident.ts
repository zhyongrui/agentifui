import {
  loadSavedIncident,
  replayIncidentFixture,
} from "./lib/harness.js";

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

async function main() {
  const args = process.argv.slice(2);
  const fixtureId = readArgValue("--fixture", args);

  if (!fixtureId) {
    throw new Error("replay-incident requires --fixture <fixtureId>.");
  }

  const previous = loadSavedIncident(fixtureId);
  const incident = await replayIncidentFixture({
    fixtureId,
    outputDir: readArgValue("--write-output", args),
  });

  console.log(
    [
      `fixture=${incident.fixtureId}`,
      `trace=${incident.references.traceId}`,
      previous ? `previous=${previous.generatedAt}` : "previous=none",
    ].join(" "),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
