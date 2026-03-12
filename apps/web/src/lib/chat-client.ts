import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStopResponse,
  ChatGatewayErrorResponse,
} from '@agentifui/shared/chat';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

type ChatRequestOptions = {
  activeGroupId?: string;
};

type ChatCompletionStreamHandlers = {
  onMetadata?: (metadata: {
    conversationId: string;
    traceId: string;
  }) => void;
  onChunk?: (chunk: ChatCompletionChunk) => void;
};

function buildGatewayHeaders(sessionToken: string, options: ChatRequestOptions): HeadersInit {
  const headers: HeadersInit = {
    authorization: `Bearer ${sessionToken}`,
    'content-type': 'application/json',
  };

  if (options.activeGroupId) {
    headers['x-active-group-id'] = options.activeGroupId;
  }

  return headers;
}

function parseSseEvent(block: string) {
  const lines = block
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  return {
    eventName,
    data: dataLines.join('\n'),
  };
}

async function parseGatewayError(response: Response) {
  return (await response.json()) as ChatGatewayErrorResponse;
}

export async function createChatCompletion(
  sessionToken: string,
  input: ChatCompletionRequest,
  options: ChatRequestOptions = {}
): Promise<ChatCompletionResponse | ChatGatewayErrorResponse> {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/v1/chat/completions`, {
    method: 'POST',
    headers: buildGatewayHeaders(sessionToken, options),
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  return (await response.json()) as ChatCompletionResponse | ChatGatewayErrorResponse;
}

export async function streamChatCompletion(
  sessionToken: string,
  input: ChatCompletionRequest,
  handlers: ChatCompletionStreamHandlers,
  options: ChatRequestOptions = {}
) {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/v1/chat/completions`, {
    method: 'POST',
    headers: buildGatewayHeaders(sessionToken, options),
    body: JSON.stringify({
      ...input,
      stream: true,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseGatewayError(response);
  }

  if (!response.body) {
    throw new Error('The chat gateway did not return a readable response stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const event = parseSseEvent(block);

      if (!event.data) {
        continue;
      }

      if (event.data === '[DONE]') {
        return;
      }

      if (event.eventName === 'agentif.metadata') {
        const payload = JSON.parse(event.data) as {
          conversation_id: string;
          trace_id: string;
        };

        handlers.onMetadata?.({
          conversationId: payload.conversation_id,
          traceId: payload.trace_id,
        });
        continue;
      }

      handlers.onChunk?.(JSON.parse(event.data) as ChatCompletionChunk);
    }
  }
}

export async function stopChatCompletion(
  sessionToken: string,
  taskId: string
): Promise<ChatCompletionStopResponse | ChatGatewayErrorResponse> {
  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/v1/chat/completions/${taskId}/stop`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    cache: 'no-store',
  });

  return (await response.json()) as ChatCompletionStopResponse | ChatGatewayErrorResponse;
}
