import type { WorkspaceArtifact, WorkspaceArtifactSummary } from "@agentifui/shared/apps";
import Link from "next/link";

import { ChatMarkdown } from "./chat-markdown";

type WorkspaceArtifactPreviewContext = {
  conversationId?: string | null;
  runId?: string | null;
  shareId?: string | null;
  shareAccess?: string | null;
};

function appendContextParam(
  params: URLSearchParams,
  key: "conversationId" | "runId" | "shareId" | "shareAccess",
  value: string | null | undefined,
) {
  if (typeof value !== "string") {
    return;
  }

  const normalized = value.trim();

  if (normalized.length > 0) {
    params.set(key, normalized);
  }
}

export function buildWorkspaceArtifactPreviewHref(
  artifactId: string,
  context: WorkspaceArtifactPreviewContext = {},
) {
  const params = new URLSearchParams();

  appendContextParam(params, "conversationId", context.conversationId);
  appendContextParam(params, "runId", context.runId);
  appendContextParam(params, "shareId", context.shareId);
  appendContextParam(params, "shareAccess", context.shareAccess);

  const suffix = params.size > 0 ? `?${params.toString()}` : "";

  return `/chat/artifacts/${artifactId}${suffix}`;
}

export function formatWorkspaceArtifactSize(sizeBytes: number | null) {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes)) {
    return "Unknown size";
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.ceil(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function renderTableCell(value: string | number | boolean | null) {
  if (value === null) {
    return "null";
  }

  return String(value);
}

export function WorkspaceArtifactLinkList({
  artifacts,
  conversationId,
  runId,
  shareId,
  shareAccess,
}: {
  artifacts: WorkspaceArtifactSummary[];
  conversationId?: string | null;
  runId?: string | null;
  shareId?: string | null;
  shareAccess?: string | null;
}) {
  return (
    <div className="artifact-link-list">
      {artifacts.map((artifact) => (
        <Link
          key={artifact.id}
          className="artifact-link-card"
          href={buildWorkspaceArtifactPreviewHref(artifact.id, {
            conversationId,
            runId,
            shareId,
            shareAccess,
          })}
        >
          <div className="artifact-link-card-header">
            <strong>{artifact.title}</strong>
            <span className="artifact-link-card-kind">{artifact.kind}</span>
          </div>
          <p>
            {artifact.summary ??
              `Open the stored ${artifact.kind} artifact from this run.`}
          </p>
          <div className="artifact-link-card-meta">
            <span>{artifact.status}</span>
            <span>{artifact.source}</span>
            <span>{formatWorkspaceArtifactSize(artifact.sizeBytes)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function WorkspaceArtifactPreview({
  artifact,
}: {
  artifact: WorkspaceArtifact;
}) {
  if (artifact.kind === "markdown") {
    return <ChatMarkdown content={artifact.content} />;
  }

  if (artifact.kind === "text") {
    return <pre className="artifact-code-block">{artifact.content}</pre>;
  }

  if (artifact.kind === "json") {
    return (
      <pre className="artifact-code-block">
        {JSON.stringify(artifact.content, null, 2)}
      </pre>
    );
  }

  if (artifact.kind === "table") {
    return (
      <div className="artifact-table-wrap">
        <table className="artifact-table">
          <thead>
            <tr>
              {artifact.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, rowIndex) => (
              <tr key={`${artifact.id}_${rowIndex}`}>
                {row.map((cell, columnIndex) => (
                  <td key={`${artifact.id}_${rowIndex}_${columnIndex}`}>
                    {renderTableCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (artifact.kind === "link") {
    return (
      <div className="artifact-link-preview">
        <p>
          {artifact.summary ?? "This artifact points to an external resource."}
        </p>
        <a href={artifact.href} rel="noreferrer" target="_blank">
          {artifact.label}
        </a>
        <span>{artifact.href}</span>
      </div>
    );
  }

  return <pre className="artifact-code-block">{artifact.content}</pre>;
}
