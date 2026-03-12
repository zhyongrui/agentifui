import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createChatCompletion,
  stopChatCompletion,
  streamChatCompletion,
} from './chat-client.js';

function buildReadableStream(chunks: string[]) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat client', () => {
  it('posts blocking chat completions through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          id: 'run-123',
          object: 'chat.completion',
          created: 1_741_776_000,
          model: 'policy-watch',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'gateway response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 20,
          },
          conversation_id: 'conv-123',
          trace_id: 'trace-123',
          metadata: {
            app_id: 'app_policy_watch',
            run_id: 'run-123',
            active_group_id: 'grp_research',
          },
        }),
      })
    );

    const result = await createChatCompletion(
      'session-123',
      {
        app_id: 'app_policy_watch',
        conversation_id: 'conv-123',
        messages: [
          {
            role: 'user',
            content: 'Summarize the latest policy changes.',
          },
        ],
        stream: false,
      },
      {
        activeGroupId: 'grp_research',
      }
    );

    expect(fetch).toHaveBeenCalledWith('/api/gateway/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
        'x-active-group-id': 'grp_research',
      },
      body: JSON.stringify({
        app_id: 'app_policy_watch',
        conversation_id: 'conv-123',
        messages: [
          {
            role: 'user',
            content: 'Summarize the latest policy changes.',
          },
        ],
        stream: false,
      }),
      cache: 'no-store',
    });
    expect(result).toMatchObject({
      id: 'run-123',
      conversation_id: 'conv-123',
      trace_id: 'trace-123',
    });
  });

  it('parses SSE chat completion streams incrementally', async () => {
    const metadataEvents: Array<{ conversationId: string; runId: string; traceId: string }> = [];
    const chunkEvents: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: buildReadableStream([
          'event: agentif.metadata\n',
          'data: {"conversation_id":"conv-123","run_id":"run-123","trace_id":"trace-123"}\n\n',
          'data: {"id":"run-123","object":"chat.completion.chunk","created":1,"model":"policy-watch","conversation_id":"conv-123","trace_id":"trace-123","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
          'data: {"id":"run-123","object":"chat.completion.chunk","created":1,"model":"policy-watch","conversation_id":"conv-123","trace_id":"trace-123","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
          'data: {"id":"run-123","object":"chat.completion.chunk","created":1,"model":"policy-watch","conversation_id":"conv-123","trace_id":"trace-123","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ]),
      })
    );

    await streamChatCompletion(
      'session-123',
      {
        app_id: 'app_policy_watch',
        conversation_id: 'conv-123',
        messages: [
          {
            role: 'user',
            content: 'hello',
          },
        ],
      },
      {
        onMetadata: metadata => {
          metadataEvents.push(metadata);
        },
        onChunk: chunk => {
          const content = chunk.choices[0]?.delta.content;

          if (content) {
            chunkEvents.push(content);
          }
        },
      },
      {
        activeGroupId: 'grp_research',
      }
    );

    expect(fetch).toHaveBeenCalledWith('/api/gateway/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
        'content-type': 'application/json',
        'x-active-group-id': 'grp_research',
      },
      body: JSON.stringify({
        app_id: 'app_policy_watch',
        conversation_id: 'conv-123',
        messages: [
          {
            role: 'user',
            content: 'hello',
          },
        ],
        stream: true,
      }),
      cache: 'no-store',
    });
    expect(metadataEvents).toEqual([
      {
        conversationId: 'conv-123',
        runId: 'run-123',
        traceId: 'trace-123',
      },
    ]);
    expect(chunkEvents).toEqual(['Hello']);
  });

  it('posts stop requests through the same-origin gateway proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          result: 'success',
          stop_type: 'hard',
        }),
      })
    );

    const result = await stopChatCompletion('session-123', 'run-123');

    expect(fetch).toHaveBeenCalledWith('/api/gateway/v1/chat/completions/run-123/stop', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-123',
      },
      cache: 'no-store',
    });
    expect(result).toEqual({
      result: 'success',
      stop_type: 'hard',
    });
  });

  it('returns gateway errors without reshaping them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          error: {
            message: 'expired',
            type: 'authentication_error',
            code: 'invalid_token',
            trace_id: 'trace-123',
          },
        }),
      })
    );

    const result = await createChatCompletion('expired-session', {
      app_id: 'app_policy_watch',
      messages: [
        {
          role: 'user',
          content: 'hello',
        },
      ],
    });

    expect(result).toEqual({
      error: {
        message: 'expired',
        type: 'authentication_error',
        code: 'invalid_token',
        trace_id: 'trace-123',
      },
    });
  });
});
