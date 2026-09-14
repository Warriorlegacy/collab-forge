export type AgentId = string;
export type RunId = string;
export type ToolName = string;

export type AgentStatus = "pending" | "running" | "done" | "error" | "skipped" | "awaiting_approval";

export type Artifact = {
  path: string;
  content: string;
  language?: string;
  sizeBytes?: number;
};

export type AgentEvent =
  | { type: "transition"; agentId: AgentId; status: AgentStatus; timestamp: string }
  | { type: "log"; agentId: AgentId; level: "info" | "warn" | "error"; message: string; timestamp: string }
  | { type: "artifact"; agentId: AgentId; artifact: Artifact; timestamp: string }
  | { type: "tool_call"; agentId: AgentId; tool: ToolName; input: unknown; timestamp: string }
  | { type: "tool_result"; agentId: AgentId; tool: ToolName; output: unknown; durationMs: number; timestamp: string }
  | { type: "error"; agentId: AgentId; message: string; recoverable: boolean; timestamp: string }
  | { type: "complete"; runId: RunId; timestamp: string };

export type AgentNode = {
  id: AgentId;
  name: string;
  prompt: string;
  tools: ToolName[];
  dependsOn: AgentId[];
  timeoutMs: number;
  maxRetries: number;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

export type ToolResult = {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
};

export type ToolContext = {
  runId: RunId;
  agentId: AgentId;
  userId?: string;
};

export type RunState = {
  runId: RunId;
  userId: string;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  nodes: AgentNode[];
  events: AgentEvent[];
  artifacts: Artifact[];
  createdAt: string;
  updatedAt: string;
  currentAgentId: AgentId | null;
  metrics: {
    totalTokens: number;
    totalLatencyMs: number;
    toolCalls: number;
  };
};

export type DAGExecutionResult = {
  runId: RunId;
  completed: AgentId[];
  failed: AgentId[];
  skipped: AgentId[];
  durationMs: number;
};
