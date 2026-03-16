import type {
  WorkspaceArtifact,
  WorkspaceCitation,
  WorkspaceHitlStep,
  WorkspaceSafetySignal,
  WorkspaceSourceBlock,
} from "../apps/contracts.js";
import type {
  ChatToolCall,
  ChatToolChoice,
  ChatToolDescriptor,
} from "../tools/contracts.js";

export type ChatCompletionRole = "system" | "user" | "assistant" | "tool";

export type ChatCompletionContentPart = {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type ChatCompletionMessage = {
  role: ChatCompletionRole;
  content: string | ChatCompletionContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
};

export type ChatCompletionFileReference = {
  type: "local" | "remote";
  url?: string;
  file_id?: string;
  transfer_method: "local_file" | "remote_url";
};

export type ChatCompletionRequest = {
  app_id: string;
  messages: ChatCompletionMessage[];
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: ChatToolDescriptor[];
  tool_choice?: ChatToolChoice;
  conversation_id?: string;
  inputs?: Record<string, unknown>;
  files?: ChatCompletionFileReference[];
};

export type ChatCompletionFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter";

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: 0;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatToolCall[];
      artifacts?: WorkspaceArtifact[];
      citations?: WorkspaceCitation[];
      safety_signals?: WorkspaceSafetySignal[];
      source_blocks?: WorkspaceSourceBlock[];
      pending_actions?: WorkspaceHitlStep[];
      suggested_prompts?: string[];
    };
    finish_reason: ChatCompletionFinishReason;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  conversation_id: string;
  trace_id: string;
  metadata?: {
    app_id: string;
    run_id: string;
    active_group_id: string;
    runtime_id?: string;
  };
};

export type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: 0;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: ChatToolCall[];
    };
    finish_reason: ChatCompletionFinishReason | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  conversation_id?: string;
  trace_id?: string;
  artifacts?: WorkspaceArtifact[];
  citations?: WorkspaceCitation[];
  safety_signals?: WorkspaceSafetySignal[];
  source_blocks?: WorkspaceSourceBlock[];
  pending_actions?: WorkspaceHitlStep[];
  suggested_prompts?: string[];
};

export type ChatCompletionStopResponse = {
  result: "success";
  stop_type: "hard" | "soft";
};

export type ChatModelMode = "chat" | "workflow" | "agent" | "completion";

export type ChatModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  name: string;
  description?: string;
  icon?: string;
  mode: ChatModelMode;
  capabilities: {
    streaming: boolean;
    stop: boolean;
    tools: boolean;
    files: boolean;
    citations: boolean;
  };
};

export type ChatModelsResponse = {
  object: "list";
  data: ChatModel[];
};

export type ChatGatewayErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_denied"
  | "not_found_error"
  | "rate_limit_error"
  | "internal_error"
  | "service_unavailable";

export type ChatGatewayErrorCode =
  | "invalid_app_id"
  | "invalid_conversation_id"
  | "invalid_file_id"
  | "invalid_task_id"
  | "invalid_messages"
  | "invalid_token"
  | "app_not_authorized"
  | "quota_exceeded"
  | "app_not_found"
  | "conversation_not_found"
  | "rate_limit_exceeded"
  | "provider_error"
  | "provider_unavailable";

export type ChatGatewayErrorResponse = {
  error: {
    message: string;
    type: ChatGatewayErrorType;
    code: ChatGatewayErrorCode;
    param?: string;
    trace_id?: string;
  };
};
