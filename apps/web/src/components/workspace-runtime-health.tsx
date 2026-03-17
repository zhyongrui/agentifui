import type { GatewayRuntimeHealthSnapshot } from "../lib/gateway-health-client";

function formatCapabilityLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").toLowerCase();
}

function listEnabledCapabilities(
  capabilities: GatewayRuntimeHealthSnapshot["runtimes"][number]["capabilities"],
) {
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([capability]) => formatCapabilityLabel(capability));
}

export function WorkspaceRuntimeDegradedBanner(props: {
  snapshot: GatewayRuntimeHealthSnapshot | null;
  context: "admin" | "conversation" | "history";
}) {
  const { snapshot, context } = props;

  if (!snapshot || snapshot.overallStatus !== "degraded") {
    return null;
  }

  const guidance =
    context === "conversation"
      ? "Conversation history, run replay, artifacts, and pending HITL cards stay readable, but new messages, uploads, and pending-action responses are paused until the runtime recovers."
      : context === "history"
        ? "Conversation history remains readable while the runtime recovers, but opening a conversation will keep its composer in read-only mode."
        : "Admin read surfaces stay available while the runtime recovers. Clear the degraded adapter state before asking users to resume execution.";

  return (
    <div className="notice warning">
      <strong>Workspace runtime is degraded.</strong> {guidance}
    </div>
  );
}

export function WorkspaceRuntimeHealthCards(props: {
  snapshot: GatewayRuntimeHealthSnapshot | null;
}) {
  const { snapshot } = props;

  if (!snapshot) {
    return null;
  }

  const providers = snapshot.providers ?? [];

  return (
    <>
      <div className="admin-stat-grid">
        {snapshot.runtimes.map((runtime) => (
          <article className="admin-stat-card" key={runtime.id}>
            <span>{runtime.label}</span>
            <strong>{runtime.status}</strong>
            <p>{runtime.id}</p>
            <div className="tag-row admin-tag-row">
              {listEnabledCapabilities(runtime.capabilities).map((capability) => (
                <span className="tag tag-muted" key={`${runtime.id}:${capability}`}>
                  {capability}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      {providers.length > 0 ? (
        <div className="admin-stat-grid">
          {providers.map((provider) => (
            <article className="admin-stat-card" key={provider.id}>
              <span>{provider.label}</span>
              <strong>{provider.status}</strong>
              <p>{provider.models.map((model) => model.id).join(", ")}</p>
              <div className="tag-row admin-tag-row">
                <span className="tag tag-muted">{provider.adapterId}</span>
                <span className="tag tag-muted">circuit {provider.circuitBreaker.state}</span>
                <span className="tag tag-muted">retry {provider.retryPolicy.maxAttempts}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}
