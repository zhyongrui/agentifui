import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatGatewayErrorResponse,
} from '@agentifui/shared/chat';

const GATEWAY_PROXY_BASE_PATH = '/api/gateway';

type ChatRequestOptions = {
  activeGroupId?: string;
};

export async function createChatCompletion(
  sessionToken: string,
  input: ChatCompletionRequest,
  options: ChatRequestOptions = {}
): Promise<ChatCompletionResponse | ChatGatewayErrorResponse> {
  const headers: HeadersInit = {
    authorization: `Bearer ${sessionToken}`,
    'content-type': 'application/json',
  };

  if (options.activeGroupId) {
    headers['x-active-group-id'] = options.activeGroupId;
  }

  const response = await fetch(`${GATEWAY_PROXY_BASE_PATH}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  return (await response.json()) as ChatCompletionResponse | ChatGatewayErrorResponse;
}
