import type {
  WorkspaceHitlOption,
  WorkspaceHitlStep,
  WorkspaceHitlStepResponse,
  WorkspacePendingActionRespondRequest,
} from "@agentifui/shared/apps";
import { randomUUID } from "node:crypto";

function isHitlStepKind(value: unknown): value is WorkspaceHitlStep["kind"] {
  return value === "approval" || value === "input_request";
}

function isHitlStepStatus(value: unknown): value is WorkspaceHitlStep["status"] {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "submitted" ||
    value === "expired" ||
    value === "cancelled"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isHitlStepResponseAction(
  value: unknown,
): value is WorkspaceHitlStepResponse["action"] {
  return (
    value === "approve" ||
    value === "reject" ||
    value === "submit" ||
    value === "cancel"
  );
}

function isWorkspaceHitlResponse(
  value: unknown,
): value is WorkspaceHitlStepResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    isHitlStepResponseAction(record.action) &&
    typeof record.respondedAt === "string" &&
    typeof record.actorUserId === "string" &&
    isNullableString(record.actorDisplayName ?? null) &&
    isNullableString(record.note ?? null) &&
    (record.values === undefined || isStringRecord(record.values))
  );
}

function isWorkspaceHitlOption(value: unknown): value is WorkspaceHitlOption {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    typeof record.value === "string" &&
    isNullableString(record.description ?? null)
  );
}

function isWorkspaceHitlField(value: unknown): value is Extract<
  WorkspaceHitlStep,
  { kind: "input_request" }
>["fields"][number] {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const type = record.type;
  const options = record.options;

  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    (type === "text" || type === "textarea" || type === "select") &&
    typeof record.required === "boolean" &&
    isNullableString(record.placeholder ?? null) &&
    isNullableString(record.helpText ?? null) &&
    isNullableString(record.defaultValue ?? null) &&
    (options === undefined ||
      (Array.isArray(options) && options.every((option) => isWorkspaceHitlOption(option))))
  );
}

function isWorkspaceHitlStep(value: unknown): value is WorkspaceHitlStep {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    !isHitlStepKind(record.kind) ||
    !isHitlStepStatus(record.status) ||
    typeof record.title !== "string" ||
    !isNullableString(record.description ?? null) ||
    typeof record.conversationId !== "string" ||
    typeof record.runId !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    !isNullableString(record.expiresAt ?? null) ||
    !(
      record.response === undefined ||
      record.response === null ||
      isWorkspaceHitlResponse(record.response)
    )
  ) {
    return false;
  }

  if (record.kind === "approval") {
    return (
      typeof record.approveLabel === "string" &&
      typeof record.rejectLabel === "string"
    );
  }

  return (
    typeof record.submitLabel === "string" &&
    Array.isArray(record.fields) &&
    record.fields.every((field) => isWorkspaceHitlField(field))
  );
}

export function parseWorkspaceHitlSteps(value: unknown): WorkspaceHitlStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => (isWorkspaceHitlStep(entry) ? [entry] : []));
}

export function expireWorkspaceHitlSteps(input: {
  items: WorkspaceHitlStep[];
  now: string;
}): {
  items: WorkspaceHitlStep[];
  expiredItems: WorkspaceHitlStep[];
} {
  const nowMs = Date.parse(input.now);

  if (!Number.isFinite(nowMs)) {
    return {
      items: input.items,
      expiredItems: [],
    };
  }

  const expiredItems: WorkspaceHitlStep[] = [];
  const items = input.items.map((item) => {
    if (item.status !== "pending" || !item.expiresAt) {
      return item;
    }

    const expiresAtMs = Date.parse(item.expiresAt);

    if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
      return item;
    }

    const expiredItem: WorkspaceHitlStep = {
      ...item,
      status: "expired",
      updatedAt: input.now,
    };

    expiredItems.push(expiredItem);
    return expiredItem;
  });

  return {
    items,
    expiredItems,
  };
}

export function buildPlaceholderHitlSteps(input: {
  appId: string;
  conversationId: string;
  createdAt: string;
  latestPrompt: string;
  runId: string;
}): WorkspaceHitlStep[] {
  if (input.appId !== "app_tenant_control") {
    return [];
  }

  const expiresAt = new Date(Date.parse(input.createdAt) + 24 * 60 * 60 * 1000).toISOString();
  const normalizedPrompt = input.latestPrompt.toLowerCase();

  if (
    normalizedPrompt.includes("details") ||
    normalizedPrompt.includes("form") ||
    normalizedPrompt.includes("justification") ||
    normalizedPrompt.includes("input")
  ) {
    return [
      {
        id: `hitl_${randomUUID()}`,
        kind: "input_request",
        status: "pending",
        title: "Collect change request details",
        description:
          "Tenant Control needs explicit rollout details before it can continue with the requested change.",
        conversationId: input.conversationId,
        runId: input.runId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        expiresAt,
        submitLabel: "Submit details",
        fields: [
          {
            id: "justification",
            label: "Business justification",
            type: "textarea",
            required: true,
            placeholder: "Explain why this tenant change is needed.",
            helpText: "This text is stored alongside the pending action response.",
          },
          {
            id: "risk_level",
            label: "Risk level",
            type: "select",
            required: true,
            options: [
              {
                id: "low",
                label: "Low",
                value: "low",
              },
              {
                id: "medium",
                label: "Medium",
                value: "medium",
              },
              {
                id: "high",
                label: "High",
                value: "high",
              },
            ],
            helpText: "Choose the risk level that best matches this change.",
          },
        ],
      },
    ];
  }

  return [
    {
      id: `hitl_${randomUUID()}`,
      kind: "approval",
      status: "pending",
      title: "Approve tenant access change",
      description:
        "Tenant Control requires a human approval before it can apply the requested tenant-level access change.",
      conversationId: input.conversationId,
      runId: input.runId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      expiresAt,
      approveLabel: "Approve change",
      rejectLabel: "Reject change",
    },
  ];
}

function normalizeNote(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function applyWorkspaceHitlStepResponse(input: {
  step: WorkspaceHitlStep;
  request: WorkspacePendingActionRespondRequest;
  actorUserId: string;
  actorDisplayName: string | null;
  respondedAt: string;
}):
  | {
      ok: true;
      item: WorkspaceHitlStep;
    }
  | {
      ok: false;
      code: "WORKSPACE_INVALID_PAYLOAD" | "WORKSPACE_ACTION_CONFLICT";
      message: string;
      details?: unknown;
    } {
  if (input.step.status !== "pending") {
    return {
      ok: false,
      code: "WORKSPACE_ACTION_CONFLICT",
      message: "Only pending actions can be updated.",
      details: {
        stepId: input.step.id,
        status: input.step.status,
      },
    };
  }

  const responseBase = {
    action: input.request.action,
    respondedAt: input.respondedAt,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    note: normalizeNote(input.request.note),
  } satisfies Omit<WorkspaceHitlStepResponse, "values">;

  if (input.request.action === "cancel") {
    return {
      ok: true,
      item: {
        ...input.step,
        status: "cancelled",
        updatedAt: input.respondedAt,
        response: responseBase,
      },
    };
  }

  if (input.step.kind === "approval") {
    if (input.request.action !== "approve" && input.request.action !== "reject") {
      return {
        ok: false,
        code: "WORKSPACE_INVALID_PAYLOAD",
        message: "Approval steps only accept approve or reject actions.",
        details: {
          stepId: input.step.id,
          kind: input.step.kind,
          action: input.request.action,
        },
      };
    }

    return {
      ok: true,
      item: {
        ...input.step,
        status: input.request.action === "approve" ? "approved" : "rejected",
        updatedAt: input.respondedAt,
        response: responseBase,
      },
    };
  }

  if (input.request.action !== "submit") {
    return {
      ok: false,
      code: "WORKSPACE_INVALID_PAYLOAD",
      message: "Input-request steps only accept submit actions.",
      details: {
        stepId: input.step.id,
        kind: input.step.kind,
        action: input.request.action,
      },
    };
  }

  if (!isStringRecord(input.request.values)) {
    return {
      ok: false,
      code: "WORKSPACE_INVALID_PAYLOAD",
      message: "Input-request steps require a string map of submitted values.",
      details: {
        stepId: input.step.id,
      },
    };
  }

  const normalizedValues: Record<string, string> = {};

  for (const field of input.step.fields) {
    const rawValue = input.request.values[field.id];
    const normalizedValue = typeof rawValue === "string" ? rawValue.trim() : "";

    if (field.required && normalizedValue.length === 0) {
      return {
        ok: false,
        code: "WORKSPACE_INVALID_PAYLOAD",
        message: `The field "${field.label}" is required.`,
        details: {
          stepId: input.step.id,
          fieldId: field.id,
        },
      };
    }

    if (
      field.type === "select" &&
      normalizedValue.length > 0 &&
      field.options &&
      !field.options.some((option) => option.value === normalizedValue)
    ) {
      return {
        ok: false,
        code: "WORKSPACE_INVALID_PAYLOAD",
        message: `The field "${field.label}" has an invalid option.`,
        details: {
          stepId: input.step.id,
          fieldId: field.id,
          value: normalizedValue,
        },
      };
    }

    normalizedValues[field.id] = normalizedValue;
  }

  return {
    ok: true,
    item: {
      ...input.step,
      status: "submitted",
      updatedAt: input.respondedAt,
      response: {
        ...responseBase,
        values: normalizedValues,
      },
    },
  };
}
