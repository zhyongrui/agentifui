import type {
  WorkspaceErrorResponse,
  WorkspacePlanState,
  WorkspacePlanStep,
  WorkspacePlanStepControlRequest,
  WorkspacePlanStepControlResponse,
  WorkspaceRunBranchCreateRequest,
  WorkspaceRunBranchCreateResponse,
  WorkspaceWorkflowState,
} from "@agentifui/shared/apps";
import type { FastifyInstance } from "fastify";

import type { AuditService } from "../services/audit-service.js";
import type { AuthService } from "../services/auth-service.js";
import type { WorkspaceService } from "../services/workspace-service.js";

function buildErrorResponse(
  code: WorkspaceErrorResponse["error"]["code"],
  message: string,
  details?: unknown,
): WorkspaceErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function appendInternalPlanNote(
  summary: string,
  notes: Array<{ id: string; channel: "internal_redacted"; createdAt: string; summary: string }>,
  createdAt: string,
) {
  return [
    ...notes,
    {
      id: "note_" + createdAt.replace(/[^0-9]/g, "").slice(-12),
      channel: "internal_redacted" as const,
      createdAt,
      summary,
    },
  ].slice(-12);
}

function updateWorkflowForAction(
  workflow: WorkspaceWorkflowState | null,
  action: WorkspacePlanStepControlRequest["action"],
  runId: string,
  occurredAt: string,
): WorkspaceWorkflowState | null {
  if (!workflow) {
    return null;
  }

  if (action === "pause") {
    return {
      ...workflow,
      status: "paused",
      pausedAt: occurredAt,
    };
  }

  return {
    ...workflow,
    status: "running",
    pausedAt: null,
    lastResumedAt: occurredAt,
    resumedFromRunId: runId,
  };
}

function formatPlanNote(title: string, action: WorkspacePlanStepControlRequest["action"], reason: string | null) {
  const suffix = reason ? ": " + reason : "";

  if (action === "pause") {
    return title + " paused" + suffix;
  }

  if (action === "resume") {
    return title + " resumed" + suffix;
  }

  if (action === "restart") {
    return title + " restarted" + suffix;
  }

  return title + " skipped" + suffix;
}

function mutatePlanStep(input: {
  action: WorkspacePlanStepControlRequest["action"];
  occurredAt: string;
  plan: WorkspacePlanState;
  reason: string | null;
  stepId: string;
  workflow: WorkspaceWorkflowState | null;
  runId: string;
}) {
  const steps = input.plan.steps.map((step) => ({ ...step }));
  const stepIndex = steps.findIndex((step) => step.id === input.stepId);

  if (stepIndex < 0) {
    return null;
  }

  const step = steps[stepIndex] as WorkspacePlanStep;

  if (input.action === "pause") {
    step.status = "paused";
    return {
      plan: {
        ...input.plan,
        status: "paused",
        activeStepId: step.id,
        steps,
      },
      step,
      workflow: updateWorkflowForAction(input.workflow, input.action, input.runId, input.occurredAt),
      note: formatPlanNote(step.title, input.action, input.reason),
      timelineType: "workflow_paused" as const,
    };
  }

  if (input.action === "resume" || input.action === "restart") {
    step.status = "in_progress";
    step.startedAt = step.startedAt ?? input.occurredAt;
    step.finishedAt = null;
    return {
      plan: {
        ...input.plan,
        status: "in_progress",
        activeStepId: step.id,
        steps,
      },
      step,
      workflow: updateWorkflowForAction(input.workflow, input.action, input.runId, input.occurredAt),
      note: formatPlanNote(step.title, input.action, input.reason),
      timelineType: "workflow_resumed" as const,
    };
  }

  step.status = "skipped";
  step.finishedAt = input.occurredAt;
  const nextStep = steps.find((candidate) => candidate.id !== step.id && candidate.status === "pending");

  if (nextStep) {
    nextStep.status = "in_progress";
    nextStep.startedAt = nextStep.startedAt ?? input.occurredAt;
  }

  return {
    plan: {
      ...input.plan,
      status: nextStep ? "in_progress" : "completed",
      activeStepId: nextStep ? nextStep.id : null,
      steps,
    },
    step,
    workflow:
      nextStep && input.workflow
        ? {
            ...updateWorkflowForAction(input.workflow, input.action, input.runId, input.occurredAt)!,
            currentStepId: nextStep.id,
          }
        : input.workflow
          ? {
              ...updateWorkflowForAction(input.workflow, input.action, input.runId, input.occurredAt)!,
              currentStepId: null,
              status: "completed",
            }
          : null,
    note: formatPlanNote(step.title, input.action, input.reason),
    timelineType: "plan_step_updated" as const,
  };
}

export async function registerWorkspaceRunControlRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workspaceService: WorkspaceService,
  auditService: AuditService,
) {
  app.post(
    "/workspace/runs/:runId/branch",
    async (request, reply): Promise<WorkspaceRunBranchCreateResponse | WorkspaceErrorResponse> => {
      const sessionToken = readBearerToken(request.headers.authorization);

      if (!sessionToken) {
        reply.code(401);
        return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "Workspace access requires a bearer session.");
      }

      const user = await authService.getUserBySessionToken(sessionToken);

      if (!user) {
        reply.code(401);
        return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "The workspace session is invalid or expired.");
      }

      const params = (request.params ?? {}) as { runId?: string };
      const body = (request.body ?? {}) as Partial<WorkspaceRunBranchCreateRequest>;
      const runId = params.runId?.trim();

      if (!runId) {
        reply.code(400);
        return buildErrorResponse("WORKSPACE_INVALID_PAYLOAD", "runId is required.");
      }

      const runResult = await workspaceService.getRunForUser(user, runId);

      if (!runResult.ok) {
        reply.code(runResult.statusCode);
        return buildErrorResponse(runResult.code, runResult.message, runResult.details);
      }

      const conversationResult = await workspaceService.getConversationForUser(user, runResult.data.conversationId);

      if (!conversationResult.ok) {
        reply.code(conversationResult.statusCode);
        return buildErrorResponse(conversationResult.code, conversationResult.message, conversationResult.details);
      }

      const launchResult = await workspaceService.launchAppForUser(user, {
        appId: conversationResult.data.app.id,
        activeGroupId: conversationResult.data.activeGroup.id,
      });

      if (!launchResult.ok) {
        reply.code(launchResult.statusCode);
        return buildErrorResponse(launchResult.code, launchResult.message, launchResult.details);
      }

      if (!launchResult.data.conversationId || !launchResult.data.runId) {
        reply.code(409);
        return buildErrorResponse("WORKSPACE_ACTION_CONFLICT", "The branch conversation could not be initialized.");
      }

      const branch = {
        parentConversationId: conversationResult.data.id,
        parentRunId: runResult.data.id,
        rootConversationId: runResult.data.branch?.rootConversationId ?? conversationResult.data.id,
        depth: (runResult.data.branch?.depth ?? 0) + 1,
        label: typeof body.title === "string" ? body.title.trim() || null : null,
        createdByAction: "branch" as const,
      };

      const updateResult = await workspaceService.updateConversationRunForUser(user, {
        conversationId: launchResult.data.conversationId,
        runId: launchResult.data.runId,
        status: "succeeded",
        inputs: {
          branchedFromRunId: runResult.data.id,
        },
        outputs: {
          branch,
          plan: runResult.data.plan,
          workflow: runResult.data.workflow,
          internalNotes: runResult.data.internalNotes,
        },
        messageHistory: conversationResult.data.messages,
        elapsedTime: 0,
        totalSteps: runResult.data.totalSteps,
        totalTokens: runResult.data.totalTokens,
        finishedAt: new Date().toISOString(),
      });

      if (!updateResult.ok) {
        reply.code(updateResult.statusCode);
        return buildErrorResponse(updateResult.code, updateResult.message, updateResult.details);
      }

      if (body.title?.trim()) {
        await workspaceService.updateConversationForUser(user, {
          conversationId: launchResult.data.conversationId,
          title: body.title.trim(),
        });
      }

      await workspaceService.appendRunTimelineEventForUser(user, {
        conversationId: launchResult.data.conversationId,
        runId: launchResult.data.runId,
        type: "branch_created",
        metadata: {
          parentConversationId: conversationResult.data.id,
          parentRunId: runResult.data.id,
          depth: branch.depth,
          label: branch.label,
        },
      });

      await auditService.recordEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "workspace.run.branch_created",
        entityType: "run",
        entityId: launchResult.data.runId,
        ipAddress: request.ip,
        payload: {
          branch,
        },
      });

      const nextConversation = await workspaceService.getConversationForUser(user, launchResult.data.conversationId);

      if (!nextConversation.ok) {
        reply.code(nextConversation.statusCode);
        return buildErrorResponse(nextConversation.code, nextConversation.message, nextConversation.details);
      }

      return {
        ok: true,
        data: {
          conversation: nextConversation.data,
          branch,
        },
      };
    },
  );

  app.put(
    "/workspace/runs/:runId/plan/:stepId",
    async (request, reply): Promise<WorkspacePlanStepControlResponse | WorkspaceErrorResponse> => {
      const sessionToken = readBearerToken(request.headers.authorization);

      if (!sessionToken) {
        reply.code(401);
        return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "Workspace access requires a bearer session.");
      }

      const user = await authService.getUserBySessionToken(sessionToken);

      if (!user) {
        reply.code(401);
        return buildErrorResponse("WORKSPACE_UNAUTHORIZED", "The workspace session is invalid or expired.");
      }

      const params = (request.params ?? {}) as { runId?: string; stepId?: string };
      const body = (request.body ?? {}) as Partial<WorkspacePlanStepControlRequest>;
      const runId = params.runId?.trim();
      const stepId = params.stepId?.trim();

      if (!runId || !stepId || !body.action) {
        reply.code(400);
        return buildErrorResponse("WORKSPACE_INVALID_PAYLOAD", "runId, stepId, and action are required.");
      }

      const runResult = await workspaceService.getRunForUser(user, runId);

      if (!runResult.ok) {
        reply.code(runResult.statusCode);
        return buildErrorResponse(runResult.code, runResult.message, runResult.details);
      }

      if (!runResult.data.plan) {
        reply.code(409);
        return buildErrorResponse("WORKSPACE_ACTION_CONFLICT", "This run does not have a mutable plan state.");
      }

      const occurredAt = new Date().toISOString();
      const mutation = mutatePlanStep({
        action: body.action,
        occurredAt,
        plan: runResult.data.plan,
        reason: typeof body.reason === "string" ? body.reason : null,
        stepId,
        workflow: runResult.data.workflow,
        runId,
      });

      if (!mutation) {
        reply.code(404);
        return buildErrorResponse("WORKSPACE_NOT_FOUND", "The requested plan step does not exist.");
      }

      const updateResult = await workspaceService.updateConversationRunForUser(user, {
        conversationId: runResult.data.conversationId,
        runId,
        status: runResult.data.status,
        outputs: {
          plan: mutation.plan,
          workflow: mutation.workflow,
          internalNotes: appendInternalPlanNote(mutation.note, runResult.data.internalNotes, occurredAt),
        },
        totalSteps: mutation.plan.steps.length,
      });

      if (!updateResult.ok) {
        reply.code(updateResult.statusCode);
        return buildErrorResponse(updateResult.code, updateResult.message, updateResult.details);
      }

      await workspaceService.appendRunTimelineEventForUser(user, {
        conversationId: runResult.data.conversationId,
        runId,
        type: "plan_step_updated",
        metadata: {
          action: body.action,
          reason: body.reason ?? null,
          stepId,
          stepStatus: mutation.step.status,
        },
      });

      if (mutation.timelineType !== "plan_step_updated") {
        await workspaceService.appendRunTimelineEventForUser(user, {
          conversationId: runResult.data.conversationId,
          runId,
          type: mutation.timelineType,
          metadata: {
            action: body.action,
            stepId,
          },
        });
      }

      await auditService.recordEvent({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action:
          mutation.timelineType === "workflow_resumed"
            ? "workspace.run.workflow_resumed"
            : mutation.timelineType === "workflow_paused"
              ? "workspace.run.workflow_paused"
              : "workspace.run.plan_step_updated",
        entityType: "run",
        entityId: runId,
        ipAddress: request.ip,
        payload: {
          action: body.action,
          stepId,
          reason: body.reason ?? null,
          stepStatus: mutation.step.status,
        },
      });

      const nextRun = await workspaceService.getRunForUser(user, runId);

      if (!nextRun.ok) {
        reply.code(nextRun.statusCode);
        return buildErrorResponse(nextRun.code, nextRun.message, nextRun.details);
      }

      const nextStep = nextRun.data.plan?.steps.find((step) => step.id === stepId) ?? mutation.step;

      return {
        ok: true,
        data: {
          run: nextRun.data,
          step: nextStep,
        },
      };
    },
  );
}
