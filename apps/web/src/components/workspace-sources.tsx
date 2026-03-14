import type {
  WorkspaceCitation,
  WorkspaceSourceBlock,
} from "@agentifui/shared/apps";

function buildSourceMetadataText(sourceBlock: WorkspaceSourceBlock) {
  const entries = Object.entries(sourceBlock.metadata);

  if (entries.length === 0) {
    return null;
  }

  return entries.map(([key, value]) => `${key}: ${value}`).join(" · ");
}

export function WorkspaceCitationList({
  citations,
  title = "Citations",
}: {
  citations: WorkspaceCitation[];
  title?: string;
}) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="chat-suggested-prompts">
      <span className="chat-suggested-prompts-label">{title}</span>
      <div className="chat-suggested-prompt-list">
        {citations.map((citation) =>
          citation.href ? (
            <a
              key={citation.id}
              className="suggested-prompt-chip"
              href={citation.href}
              rel="noreferrer"
              target="_blank"
            >
              {citation.label} · {citation.title}
            </a>
          ) : (
            <span key={citation.id} className="suggested-prompt-chip">
              {citation.label} · {citation.title}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function WorkspaceSourceBlockList({
  sourceBlocks,
  title = "Source blocks",
}: {
  sourceBlocks: WorkspaceSourceBlock[];
  title?: string;
}) {
  if (sourceBlocks.length === 0) {
    return null;
  }

  return (
    <div className="chat-artifact-section">
      <span className="chat-suggested-prompts-label">{title}</span>
      <div className="artifact-link-list">
        {sourceBlocks.map((sourceBlock) => {
          const metadataText = buildSourceMetadataText(sourceBlock);

          return (
            <article key={sourceBlock.id} className="artifact-link-card">
              <div className="artifact-link-card-header">
                <strong>{sourceBlock.title}</strong>
                <span className="artifact-link-card-kind">
                  {sourceBlock.kind}
                </span>
              </div>
              <p>
                {sourceBlock.snippet ??
                  "This source block has no snippet content."}
              </p>
              <div className="artifact-link-card-meta">
                <span>{sourceBlock.href ? "link" : "internal"}</span>
                {metadataText ? <span>{metadataText}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
