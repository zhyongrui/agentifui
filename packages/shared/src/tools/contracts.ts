export type ToolJsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export type ToolInputSchema = {
  type?: ToolJsonSchemaType | ToolJsonSchemaType[];
  description?: string;
  enum?: Array<string | number | boolean | null>;
  format?: string;
  default?: string | number | boolean | null;
  properties?: Record<string, ToolInputSchema>;
  required?: string[];
  items?: ToolInputSchema;
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
};

export type ToolAuthScope =
  | "none"
  | "user_session"
  | "active_group"
  | "tenant"
  | "tenant_admin";

export type ToolAuthRequirement = {
  scope: ToolAuthScope;
  requiresFreshMfa?: boolean;
  requiresApproval?: boolean;
  policyTag?: string;
};

export type ToolFunctionDescriptor = {
  name: string;
  description?: string;
  inputSchema: ToolInputSchema;
  strict?: boolean;
};

export type ToolExecutionPolicy = {
  timeoutMs?: number;
  maxAttempts?: number;
  idempotencyScope?: "conversation" | "run";
};

export type ChatToolDescriptor = {
  type: "function";
  function: ToolFunctionDescriptor;
  auth: ToolAuthRequirement;
  execution?: ToolExecutionPolicy;
  enabled?: boolean;
  tags?: string[];
};

export type ChatToolChoice =
  | "auto"
  | "none"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type WorkspaceAppToolSummary = {
  name: string;
  description: string | null;
  enabled: boolean;
  defaultEnabled: boolean;
  isOverridden: boolean;
  auth: ToolAuthRequirement;
  tags: string[];
  inputSchema: ToolInputSchema;
  strict: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
};
