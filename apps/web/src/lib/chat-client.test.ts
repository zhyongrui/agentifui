import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChatCompletion } from './chat-client.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat client', () => {
  it('posts chat completions through the same-origin gateway proxy', async () => {
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
