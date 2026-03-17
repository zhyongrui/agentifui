import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  replayIncidentFixture,
  runEvalFixtures,
  selectFixtures,
} from "./harness.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop();

    if (path) {
      rmSync(path, { recursive: true, force: true });
    }
  }
});

function createTempDir(label: string) {
  const path = mkdtempSync(join(tmpdir(), `${label}-`));
  tempDirs.push(path);
  return path;
}

describe("eval harness", () => {
  it("filters fixtures by pack, app, and workstream", () => {
    const fixtures = selectFixtures({
      pack: "minimal",
      appIds: ["app_policy_watch"],
      workstreams: ["knowledge-retrieval"],
    });

    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      "policy-watch-retrieval",
    ]);
  });

  it("replays the baseline policy-watch fixture against its golden snapshot", async () => {
    const outputDir = createTempDir("eval-harness-basic");
    const result = await runEvalFixtures({
      pack: "release",
      fixtureIds: ["policy-watch-basic"],
      failOnDiff: true,
      outputDir,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("matched");
    expect(result.results[0]?.snapshot.run.runtime?.id).toBe("placeholder");
  });

  it("replays the timed-out incident fixture and records a tool timeout failure", async () => {
    const outputDir = createTempDir("eval-harness-incident");
    const incident = await replayIncidentFixture({
      fixtureId: "tenant-control-timeout-incident",
      outputDir,
    });

    expect(incident.snapshot.run.status).toBe("succeeded");
    expect(incident.snapshot.run.toolExecutions[0]?.failureCode).toBe(
      "tool_timeout",
    );
  });
});
