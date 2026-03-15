import type { WorkspaceSafetySignal } from "@agentifui/shared/apps";
import { randomUUID } from "node:crypto";

function createSafetySignal(input: {
  severity: WorkspaceSafetySignal["severity"];
  category: WorkspaceSafetySignal["category"];
  summary: string;
  detail: string | null;
  recordedAt: string;
}): WorkspaceSafetySignal {
  return {
    id: `safety_${randomUUID()}`,
    severity: input.severity,
    category: input.category,
    summary: input.summary,
    detail: input.detail,
    recordedAt: input.recordedAt,
  };
}

function isWorkspaceSafetySignalSeverity(
  value: unknown,
): value is WorkspaceSafetySignal["severity"] {
  return value === "warning" || value === "critical";
}

function isWorkspaceSafetySignalCategory(
  value: unknown,
): value is WorkspaceSafetySignal["category"] {
  return (
    value === "prompt_injection" ||
    value === "data_exfiltration" ||
    value === "policy_violation"
  );
}

function toWorkspaceSafetySignal(
  value: unknown,
  recordedAt: string,
): WorkspaceSafetySignal | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const signal = value as Record<string, unknown>;

  if (
    !isWorkspaceSafetySignalSeverity(signal.severity) ||
    !isWorkspaceSafetySignalCategory(signal.category) ||
    typeof signal.summary !== "string"
  ) {
    return null;
  }

  return {
    id:
      typeof signal.id === "string" && signal.id.trim().length > 0
        ? signal.id
        : `safety_${randomUUID()}`,
    severity: signal.severity,
    category: signal.category,
    summary: signal.summary,
    detail: typeof signal.detail === "string" ? signal.detail : null,
    recordedAt:
      typeof signal.recordedAt === "string" ? signal.recordedAt : recordedAt,
  };
}

function normalizeRuntimeSafetySignals(
  value: unknown,
  recordedAt: string,
): WorkspaceSafetySignal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const normalized = toWorkspaceSafetySignal(entry, recordedAt);
    return normalized ? [normalized] : [];
  });
}

function buildHeuristicSafetySignals(
  latestPrompt: string,
  recordedAt: string,
): WorkspaceSafetySignal[] {
  const normalizedPrompt = latestPrompt.toLowerCase();
  const signals: WorkspaceSafetySignal[] = [];

  if (
    /(ignore (all|previous|prior) instructions|system prompt|developer message|jailbreak|bypass safety|override policy)/.test(
      normalizedPrompt,
    )
  ) {
    signals.push(
      createSafetySignal({
        severity:
          /system prompt|developer message|ignore (all|previous|prior) instructions/.test(
            normalizedPrompt,
          )
            ? "critical"
            : "warning",
        category: "prompt_injection",
        summary:
          "Prompt appears to request hidden instructions or to override prior guidance.",
        detail:
          "Review requests to ignore prior instructions, reveal system prompts, or bypass internal controls before continuing.",
        recordedAt,
      }),
    );
  }

  if (
    /(api key|access token|session token|password|secret|credential|dump .*data|export .*data|database dump|exfiltrat)/.test(
      normalizedPrompt,
    )
  ) {
    signals.push(
      createSafetySignal({
        severity:
          /(api key|access token|session token|password|secret|credential)/.test(
            normalizedPrompt,
          )
            ? "critical"
            : "warning",
        category: "data_exfiltration",
        summary:
          "Prompt appears to request sensitive data, credentials, or bulk export.",
        detail:
          "Confirm least-privilege scope before returning secrets, tokens, passwords, or large internal datasets.",
        recordedAt,
      }),
    );
  }

  if (
    /(malware|ransomware|weapon|phishing|exploit|evade policy|bypass compliance|illegal)/.test(
      normalizedPrompt,
    )
  ) {
    signals.push(
      createSafetySignal({
        severity:
          /(malware|ransomware|weapon|phishing|exploit|illegal)/.test(
            normalizedPrompt,
          )
            ? "critical"
            : "warning",
        category: "policy_violation",
        summary:
          "Prompt appears to request policy-sensitive or harmful guidance.",
        detail:
          "Route high-risk requests through review or HITL approval before providing operational guidance.",
        recordedAt,
      }),
    );
  }

  return signals;
}

function mergeSafetySignals(
  runtimeSignals: WorkspaceSafetySignal[],
  heuristicSignals: WorkspaceSafetySignal[],
): WorkspaceSafetySignal[] {
  const orderedSignals = [...runtimeSignals, ...heuristicSignals];
  const deduped = new Map<string, WorkspaceSafetySignal>();

  for (const signal of orderedSignals) {
    const key = `${signal.category}:${signal.severity}:${signal.summary}`;

    if (!deduped.has(key)) {
      deduped.set(key, signal);
    }
  }

  return [...deduped.values()];
}

export function resolveSafetySignals(input: {
  latestPrompt: string;
  recordedAt: string;
  runtimeInput?: Record<string, unknown> | null;
}): WorkspaceSafetySignal[] {
  const runtimeSignals = normalizeRuntimeSafetySignals(
    input.runtimeInput?.safetySignals ?? input.runtimeInput?.safety_signals,
    input.recordedAt,
  );

  return mergeSafetySignals(
    runtimeSignals,
    buildHeuristicSafetySignals(input.latestPrompt, input.recordedAt),
  );
}

export function hasCriticalSafetySignal(signals: WorkspaceSafetySignal[]) {
  return signals.some((signal) => signal.severity === "critical");
}
