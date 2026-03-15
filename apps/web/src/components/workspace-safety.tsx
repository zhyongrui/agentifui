import type { WorkspaceSafetySignal } from "@agentifui/shared/apps";

function describeSeverity(signals: WorkspaceSafetySignal[]) {
  return signals.some((signal) => signal.severity === "critical")
    ? "Critical review required"
    : "Warning review suggested";
}

function describeRecommendedAction(category: WorkspaceSafetySignal["category"]) {
  if (category === "prompt_injection") {
    return "Remove hidden-instruction requests or require manual review.";
  }

  if (category === "data_exfiltration") {
    return "Confirm least-privilege scope before disclosing data or credentials.";
  }

  return "Escalate to policy review or HITL approval before continuing.";
}

function formatCategory(category: WorkspaceSafetySignal["category"]) {
  return category.replace(/_/g, " ");
}

export function WorkspaceSafetyBanner({
  signals,
}: {
  signals: WorkspaceSafetySignal[];
}) {
  if (signals.length === 0) {
    return null;
  }

  const isCritical = signals.some((signal) => signal.severity === "critical");

  return (
    <div className={`notice ${isCritical ? "error" : "info"}`}>
      <strong>Safety review</strong>
      <p>
        {signals.length} signal{signals.length === 1 ? "" : "s"} flagged on the
        latest run. {describeSeverity(signals)}.
      </p>
    </div>
  );
}

export function WorkspaceSafetySignalList({
  signals,
  title = "Safety signals",
  publicView = false,
}: {
  signals: WorkspaceSafetySignal[];
  title?: string;
  publicView?: boolean;
}) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="chat-artifact-section">
      <span className="chat-suggested-prompts-label">{title}</span>
      <div className="artifact-link-list">
        {signals.map((signal) => (
          <article key={signal.id} className="artifact-link-card">
            <div className="artifact-link-card-header">
              <strong>{signal.summary}</strong>
              <span className="artifact-link-card-kind">
                {signal.severity}
              </span>
            </div>
            <p>{formatCategory(signal.category)}</p>
            {!publicView && signal.detail ? <p>{signal.detail}</p> : null}
            {publicView ? (
              <div className="artifact-link-card-meta">
                <span>Read-only view</span>
                <span>Detailed reviewer notes stay in the owner workspace.</span>
              </div>
            ) : (
              <div className="artifact-link-card-meta">
                <span>{new Date(signal.recordedAt).toLocaleString()}</span>
                <span>{describeRecommendedAction(signal.category)}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
