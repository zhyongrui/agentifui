import type { WorkspaceConversation } from '@agentifui/shared/apps';
import type { AuthUser } from '@agentifui/shared/auth';
import type {
  ChatCompletionChunk,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStopResponse,
  ChatGatewayErrorCode,
  ChatGatewayErrorResponse,
  ChatGatewayErrorType,
  ChatModel,
  ChatModelsResponse,
} from '@agentifui/shared/chat';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import type { AuthService } from '../services/auth-service.js';
import type { WorkspaceService } from '../services/workspace-service.js';

type ActiveSessionResult =
  | {
      ok: true;
      user: AuthUser;
    }
  | {
      ok: false;
      statusCode: 401 | 403;
      response: ChatGatewayErrorResponse;
    };

function buildTraceId() {
  return randomUUID().replace(/-/g, '');
}

function readBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function buildErrorResponse(
  traceId: string,
  input: {
    message: string;
    type: ChatGatewayErrorType;
    code: ChatGatewayErrorCode;
    param?: string;
  }
): ChatGatewayErrorResponse {
  return {
    error: {
      message: input.message,
      type: input.type,
      code: input.code,
      param: input.param,
      trace_id: traceId,
    },
  };
}

async function requireActiveSession(
  authService: AuthService,
  authorization: string | undefined,
  traceId: string
): Promise<ActiveSessionResult> {
  const sessionToken = readBearerToken(authorization);

  if (!sessionToken) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(traceId, {
        type: 'authentication_error',
        code: 'invalid_token',
        message: 'A valid session token is required to call the chat gateway.',
      }),
    };
  }

  const user = await authService.getUserBySessionToken(sessionToken);

  if (!user) {
    return {
      ok: false,
      statusCode: 401,
      response: buildErrorResponse(traceId, {
        type: 'authentication_error',
        code: 'invalid_token',
        message: 'The current chat gateway session is missing or has expired.',
      }),
    };
  }

  if (user.status !== 'active') {
    return {
      ok: false,
      statusCode: 403,
      response: buildErrorResponse(traceId, {
        type: 'permission_denied',
        code: 'app_not_authorized',
        message: 'Only active users can invoke workspace chat applications.',
      }),
    };
  }

  return {
    ok: true,
    user,
  };
}

function isContentPart(
  value: unknown
): value is {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const part = value as Record<string, unknown>;

  if (part.type === 'text') {
    return typeof part.text === 'string';
  }

  if (part.type === 'image_url') {
    const imageUrl = part.image_url;

    return (
      typeof imageUrl === 'object' &&
      imageUrl !== null &&
      typeof (imageUrl as Record<string, unknown>).url === 'string'
    );
  }

  return false;
}

function isChatMessage(value: unknown): value is ChatCompletionMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (
    message.role !== 'system' &&
    message.role !== 'user' &&
    message.role !== 'assistant' &&
    message.role !== 'tool'
  ) {
    return false;
  }

  if (typeof message.content === 'string') {
    return true;
  }

  return Array.isArray(message.content) && message.content.every(isContentPart);
}

function extractMessageText(message: ChatCompletionMessage) {
  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  return message.content
    .map(part => {
      if (part.type === 'text') {
        return part.text ?? '';
      }

      return `[image:${part.image_url?.url ?? 'unknown'}]`;
    })
    .join(' ')
    .trim();
}

function extractLatestUserPrompt(messages: ChatCompletionMessage[]) {
  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user');

  return latestUserMessage ? extractMessageText(latestUserMessage) : '';
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function chunkText(text: string, size = 32) {
  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks.length > 0 ? chunks : [''];
}

function buildAssistantText(
  conversation: WorkspaceConversation,
  messages: ChatCompletionMessage[]
) {
  const latestPrompt = extractLatestUserPrompt(messages);
  const requestSummary = latestPrompt || 'Continue the current workspace task.';

  return [
    `${conversation.app.name} is now reachable through the AgentifUI gateway.`,
    `Request: ${requestSummary}`,
    `Context: attributed group ${conversation.activeGroup.name}, trace ${conversation.run.traceId}.`,
    'This is the Phase 1 protocol response path that R7 wires onto the persisted conversation/run boundary.',
  ].join('\n\n');
}

function resolveModelName(
  body: ChatCompletionRequest,
  conversation: WorkspaceConversation
) {
  return body.model?.trim() || conversation.app.slug;
}

function mapAppKindToMode(appKind: WorkspaceConversation['app']['kind']): ChatModel['mode'] {
  if (appKind === 'chat') {
    return 'chat';
  }

  if (appKind === 'automation') {
    return 'workflow';
  }

  if (appKind === 'analysis') {
    return 'completion';
  }

  return 'agent';
}

async function resolveConversation(
  workspaceService: WorkspaceService,
  user: AuthUser,
  body: ChatCompletionRequest,
  activeGroupId: string | undefined,
  traceId: string
) {
  if (body.conversation_id?.trim()) {
    const conversationResult = await workspaceService.getConversationForUser(
      user,
      body.conversation_id.trim()
    );

    if (!conversationResult.ok) {
      return {
        ok: false as const,
        statusCode: 404,
        response: buildErrorResponse(traceId, {
          type: 'not_found_error',
          code: 'conversation_not_found',
          message: 'The target workspace conversation could not be found.',
          param: 'conversation_id',
        }),
      };
    }

    if (conversationResult.data.app.id !== body.app_id) {
      return {
        ok: false as const,
        statusCode: 400,
        response: buildErrorResponse(traceId, {
          type: 'invalid_request_error',
          code: 'invalid_app_id',
          message: 'The provided app_id does not match the existing conversation.',
          param: 'app_id',
        }),
      };
    }

    return {
      ok: true as const,
      conversation: conversationResult.data,
    };
  }

  const catalog = await workspaceService.getCatalogForUser(user);
  const nextActiveGroupId = activeGroupId?.trim() || catalog.defaultActiveGroupId;
  const launchResult = await workspaceService.launchAppForUser(user, {
    appId: body.app_id,
    activeGroupId: nextActiveGroupId,
  });

  if (!launchResult.ok) {
    if (launchResult.code === 'WORKSPACE_NOT_FOUND') {
      return {
        ok: false as const,
        statusCode: 404,
        response: buildErrorResponse(traceId, {
          type: 'not_found_error',
          code: 'app_not_found',
          message: launchResult.message,
          param: 'app_id',
        }),
      };
    }

    const launchReason =
      typeof launchResult.details === 'object' && launchResult.details !== null
        ? (launchResult.details as Record<string, unknown>).reason
        : null;

    if (launchReason === 'quota_exceeded') {
      return {
        ok: false as const,
        statusCode: 429,
        response: buildErrorResponse(traceId, {
          type: 'rate_limit_error',
          code: 'quota_exceeded',
          message: 'The workspace launch is blocked because the current quota is exhausted.',
        }),
      };
    }

    if (launchReason === 'quota_service_degraded') {
      return {
        ok: false as const,
        statusCode: 503,
        response: buildErrorResponse(traceId, {
          type: 'service_unavailable',
          code: 'provider_unavailable',
          message: 'The workspace quota service is degraded, so new conversations are temporarily blocked.',
        }),
      };
    }

    return {
      ok: false as const,
      statusCode: 403,
      response: buildErrorResponse(traceId, {
        type: 'permission_denied',
        code: 'app_not_authorized',
        message: launchResult.message,
      }),
    };
  }

  if (!launchResult.data.conversationId) {
    return {
      ok: false as const,
      statusCode: 500,
      response: buildErrorResponse(traceId, {
        type: 'internal_error',
        code: 'provider_error',
        message: 'Workspace launch completed without a conversation identifier.',
      }),
    };
  }

  const conversationResult = await workspaceService.getConversationForUser(
    user,
    launchResult.data.conversationId
  );

  if (!conversationResult.ok) {
    return {
      ok: false as const,
      statusCode: 500,
      response: buildErrorResponse(traceId, {
        type: 'internal_error',
        code: 'provider_error',
        message: 'Workspace launch succeeded, but the conversation bootstrap could not be reloaded.',
      }),
    };
  }

  return {
    ok: true as const,
    conversation: conversationResult.data,
  };
}

function buildStreamingPayload(input: {
  conversation: WorkspaceConversation;
  created: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  assistantText: string;
}): string {
  const chunks: ChatCompletionChunk[] = [
    {
      id: input.conversation.run.id,
      object: 'chat.completion.chunk',
      created: input.created,
      model: input.model,
      conversation_id: input.conversation.id,
      trace_id: input.conversation.run.traceId,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
          },
          finish_reason: null,
        },
      ],
    },
    ...chunkText(input.assistantText).map<ChatCompletionChunk>(content => ({
      id: input.conversation.run.id,
      object: 'chat.completion.chunk' as const,
      created: input.created,
      model: input.model,
      conversation_id: input.conversation.id,
      trace_id: input.conversation.run.traceId,
      choices: [
        {
          index: 0 as const,
          delta: {
            content,
          },
          finish_reason: null,
        },
      ],
    })),
    {
      id: input.conversation.run.id,
      object: 'chat.completion.chunk',
      created: input.created,
      model: input.model,
      conversation_id: input.conversation.id,
      trace_id: input.conversation.run.traceId,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: input.promptTokens + input.completionTokens,
      },
    },
  ];

  const metadataEvent = `event: agentif.metadata\ndata: ${JSON.stringify({
    conversation_id: input.conversation.id,
    trace_id: input.conversation.run.traceId,
  })}\n\n`;
  const dataEvents = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('');

  return `${metadataEvent}${dataEvents}data: [DONE]\n\n`;
}

export async function registerChatRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workspaceService: WorkspaceService
) {
  app.get('/v1/models', async (request, reply) => {
    const traceId = request.headers['x-trace-id']?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(authService, request.headers.authorization, traceId);

    reply.header('X-Trace-ID', traceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const catalog = await workspaceService.getCatalogForUser(access.user);
    const created = Math.floor(Date.now() / 1000);
    const response: ChatModelsResponse = {
      object: 'list',
      data: catalog.apps.map(chatApp => ({
        id: chatApp.id,
        object: 'model',
        created,
        owned_by: access.user.tenantId,
        name: chatApp.name,
        description: chatApp.summary,
        mode: mapAppKindToMode(chatApp.kind),
        capabilities: {
          streaming: true,
          stop: true,
          tools: true,
          files: false,
          citations: chatApp.kind === 'analysis' || chatApp.kind === 'governance',
        },
      })),
    };

    return response;
  });

  app.post('/v1/chat/completions', async (request, reply) => {
    const fallbackTraceId = request.headers['x-trace-id']?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(
      authService,
      request.headers.authorization,
      fallbackTraceId
    );

    reply.header('X-Trace-ID', fallbackTraceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const body = (request.body ?? {}) as Partial<ChatCompletionRequest>;
    const appId = body.app_id?.trim();

    if (!appId) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: 'invalid_request_error',
        code: 'invalid_app_id',
        message: 'Chat completions require a non-empty app_id.',
        param: 'app_id',
      });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0 || !body.messages.every(isChatMessage)) {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: 'invalid_request_error',
        code: 'invalid_messages',
        message: 'Chat completions require a non-empty OpenAI-compatible messages array.',
        param: 'messages',
      });
    }

    if (body.conversation_id !== undefined && typeof body.conversation_id !== 'string') {
      reply.code(400);
      return buildErrorResponse(fallbackTraceId, {
        type: 'invalid_request_error',
        code: 'invalid_conversation_id',
        message: 'conversation_id must be a string when provided.',
        param: 'conversation_id',
      });
    }

    const conversationResult = await resolveConversation(
      workspaceService,
      access.user,
      {
        app_id: appId,
        messages: body.messages,
        model: body.model,
        stream: body.stream,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        tools: body.tools,
        tool_choice: body.tool_choice,
        conversation_id: body.conversation_id,
        inputs: body.inputs,
        files: body.files,
      },
      request.headers['x-active-group-id']?.toString(),
      fallbackTraceId
    );

    if (!conversationResult.ok) {
      reply.code(conversationResult.statusCode);
      return conversationResult.response;
    }

    const conversation = conversationResult.conversation;
    const traceId = conversation.run.traceId || fallbackTraceId;
    const startedAt = Date.now();
    const assistantText = buildAssistantText(conversation, body.messages);
    const model = resolveModelName(
      {
        app_id: appId,
        messages: body.messages,
        model: body.model,
        stream: body.stream,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        tools: body.tools,
        tool_choice: body.tool_choice,
        conversation_id: body.conversation_id,
        inputs: body.inputs,
        files: body.files,
      },
      conversation
    );
    const promptTokens = body.messages.reduce(
      (total, message) => total + estimateTokens(extractMessageText(message)),
      0
    );
    const completionTokens = estimateTokens(assistantText);
    const created = Math.floor(Date.now() / 1000);

    reply.header('X-Trace-ID', traceId);

    await workspaceService.updateConversationRunForUser(access.user, {
      conversationId: conversation.id,
      runId: conversation.run.id,
      status: 'running',
      inputs: {
        messages: body.messages,
        model,
        stream: Boolean(body.stream),
        variables: body.inputs ?? {},
        files: body.files ?? [],
      },
      totalSteps: 1,
    });

    const updateResult = await workspaceService.updateConversationRunForUser(access.user, {
      conversationId: conversation.id,
      runId: conversation.run.id,
      status: 'succeeded',
      outputs: {
        assistant: {
          content: assistantText,
          finishReason: 'stop',
        },
      },
      elapsedTime: Date.now() - startedAt,
      totalTokens: promptTokens + completionTokens,
      totalSteps: 1,
      finishedAt: new Date().toISOString(),
    });

    if (!updateResult.ok) {
      reply.code(500);
      return buildErrorResponse(traceId, {
        type: 'internal_error',
        code: 'provider_error',
        message: 'The conversation run could not be persisted after completion.',
      });
    }

    if (body.stream) {
      reply.header('content-type', 'text/event-stream; charset=utf-8');
      reply.header('cache-control', 'no-cache');

      return buildStreamingPayload({
        conversation: updateResult.data,
        created,
        model,
        promptTokens,
        completionTokens,
        assistantText,
      });
    }

    const response: ChatCompletionResponse = {
      id: updateResult.data.run.id,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: assistantText,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      conversation_id: updateResult.data.id,
      trace_id: traceId,
      metadata: {
        app_id: updateResult.data.app.id,
        run_id: updateResult.data.run.id,
        active_group_id: updateResult.data.activeGroup.id,
      },
    };

    return response;
  });

  app.post('/v1/chat/completions/:taskId/stop', async (request, reply) => {
    const traceId = request.headers['x-trace-id']?.toString().trim() || buildTraceId();
    const access = await requireActiveSession(authService, request.headers.authorization, traceId);

    reply.header('X-Trace-ID', traceId);

    if (!access.ok) {
      reply.code(access.statusCode);
      return access.response;
    }

    const params = (request.params ?? {}) as {
      taskId?: string;
    };

    if (!params.taskId?.trim()) {
      reply.code(400);
      return buildErrorResponse(traceId, {
        type: 'invalid_request_error',
        code: 'invalid_task_id',
        message: 'taskId is required to stop a chat completion.',
        param: 'taskId',
      });
    }

    const response: ChatCompletionStopResponse = {
      result: 'success',
      stop_type: 'soft',
    };

    return response;
  });
}
