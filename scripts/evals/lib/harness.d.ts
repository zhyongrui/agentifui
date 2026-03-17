import type { EvalFixture, EvalFixtureResult, EvalPack, EvalRunCollection, EvalSnapshot, ReleaseGateReport } from "./types.js";
type EvalFilters = {
    appIds?: string[];
    fixtureIds?: string[];
    pack: EvalPack;
    workstreams?: string[];
};
type EvalRunOptions = EvalFilters & {
    failOnDiff?: boolean;
    outputDir?: string | null;
    updateSnapshots?: boolean;
};
declare function selectFixtures(filters: EvalFilters): EvalFixture[];
declare function renderEvalMarkdownReport(collection: EvalRunCollection): string;
export declare function runEvalFixtures(options: EvalRunOptions): Promise<EvalRunCollection>;
declare function renderReleaseGateMarkdown(report: ReleaseGateReport): string;
export declare function runReleaseGate(options: EvalRunOptions & {
    ci?: boolean;
}): Promise<ReleaseGateReport>;
export declare function replayIncidentFixture(input: {
    fixtureId: string;
    outputDir?: string | null;
}): Promise<{
    fixtureId: string;
    generatedAt: string;
    references: {
        conversationId: string;
        runId: string;
        traceId: string;
    };
    snapshot: EvalSnapshot;
}>;
export declare function loadSavedIncident(fixtureId: string): {
    fixtureId: string;
    generatedAt: string;
    references: EvalFixtureResult["references"];
    snapshot: EvalSnapshot;
} | null;
export declare function printEvalSummary(collection: EvalRunCollection): void;
export { renderEvalMarkdownReport, renderReleaseGateMarkdown, selectFixtures };
