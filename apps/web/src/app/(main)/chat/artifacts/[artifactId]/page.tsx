"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MainSectionNav } from "../../../../../components/main-section-nav";
import {
  WorkspaceArtifactPreview,
  formatWorkspaceArtifactSize,
} from "../../../../../components/workspace-artifacts";
import { fetchWorkspaceArtifact } from "../../../../../lib/apps-client";
import { clearAuthSession } from "../../../../../lib/auth-session";
import { useProtectedSession } from "../../../../../lib/use-protected-session";

function readSearchParam(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

export default function ArtifactPreviewPage() {
  const params = useParams<{ artifactId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading } = useProtectedSession("/chat/artifacts");
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof fetchWorkspaceArtifact>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const artifactId =
    typeof params?.artifactId === "string" ? params.artifactId.trim() : "";
  const conversationId = readSearchParam(searchParams.get("conversationId"));
  const runId = readSearchParam(searchParams.get("runId"));

  useEffect(() => {
    if (!session || !artifactId) {
      setPayload(null);
      setError(artifactId ? null : "Artifact id is missing.");
      return;
    }

    let cancelled = false;

    void (async () => {
      setError(null);

      try {
        const result = await fetchWorkspaceArtifact(
          session.sessionToken,
          artifactId,
        );

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          if (result.error.code === "WORKSPACE_UNAUTHORIZED") {
            clearAuthSession(window.sessionStorage);
            router.replace("/login");
            return;
          }

          setError(result.error.message);
          return;
        }

        setPayload(result);
      } catch {
        if (!cancelled) {
          setError(
            "The artifact preview could not be loaded. Please retry.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artifactId, router, session]);

  if (isLoading) {
    return <p className="lead">Checking your session...</p>;
  }

  if (error) {
    return (
      <div className="chat-surface stack">
        <MainSectionNav showSecurity />
        <div className="notice error">{error}</div>
        <div className="actions">
          {conversationId ? (
            <Link className="secondary" href={`/chat/${conversationId}`}>
              Back to conversation
            </Link>
          ) : null}
          <Link className="secondary" href="/chat">
            Chat history
          </Link>
        </div>
      </div>
    );
  }

  if (!payload || !payload.ok) {
    return <p className="lead">Loading artifact preview...</p>;
  }

  const artifact = payload.data;

  return (
    <div className="chat-surface stack">
      <MainSectionNav showSecurity />

      <header className="chat-header">
        <div>
          <span className="eyebrow">P2-B3 Artifact Preview</span>
          <h1>{artifact.title}</h1>
          <p className="lead">
            Artifact previews stay user-scoped at the workspace boundary. Shared
            transcript deep links will be added separately once `P2-B4`
            finalizes the access model.
          </p>
        </div>
        <div className="workspace-badges">
          <span className="workspace-badge">{artifact.kind}</span>
          <span className="workspace-badge">{artifact.status}</span>
          <span className="workspace-badge">{artifact.source}</span>
          {runId ? <span className="workspace-badge">Run {runId}</span> : null}
        </div>
      </header>

      <section className="chat-panel">
        <div className="chat-panel-header">
          <div>
            <h2>Artifact preview</h2>
            <p>
              The preview uses the persisted artifact payload, not the transcript
              summary, so tables, JSON, text, markdown, and link outputs can all
              render from the same workspace route.
            </p>
          </div>
        </div>

        <div className="chat-meta-grid">
          <article className="chat-meta-card">
            <span>Artifact id</span>
            <strong>{artifact.id}</strong>
            <p>Persisted under the workspace artifact boundary.</p>
          </article>
          <article className="chat-meta-card">
            <span>Mime type</span>
            <strong>{artifact.mimeType ?? "n/a"}</strong>
            <p>{formatWorkspaceArtifactSize(artifact.sizeBytes)}</p>
          </article>
          <article className="chat-meta-card">
            <span>Created</span>
            <strong>{new Date(artifact.createdAt).toLocaleString()}</strong>
            <p>Updated {new Date(artifact.updatedAt).toLocaleString()}</p>
          </article>
          <article className="chat-meta-card">
            <span>Summary</span>
            <strong>{artifact.summary ?? "No summary recorded"}</strong>
            <p>Source {artifact.source}</p>
          </article>
        </div>

        <article className="chat-bubble assistant artifact-preview-surface">
          <div className="chat-bubble-meta">
            <span className="chat-bubble-label">Rendered artifact</span>
            <span className={`chat-bubble-status status-${artifact.status}`}>
              {artifact.status}
            </span>
          </div>
          <WorkspaceArtifactPreview artifact={artifact} />
        </article>
      </section>

      <div className="actions">
        {conversationId ? (
          <Link className="secondary" href={`/chat/${conversationId}`}>
            Back to conversation
          </Link>
        ) : null}
        <Link className="secondary" href="/chat">
          Chat history
        </Link>
        <Link className="secondary" href="/apps">
          Back to Apps workspace
        </Link>
      </div>
    </div>
  );
}
