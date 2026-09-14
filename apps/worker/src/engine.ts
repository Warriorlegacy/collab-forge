import { DAGExecutor } from "@collab-forge/agent-runtime/dag";
import { ToolRegistry, CodeInterpreterTool, WebSearchTool } from "@collab-forge/agent-runtime/tools";
import { EventTracer, StructuredLogger } from "@collab-forge/agent-runtime/tracer";
import type { AgentNode, AgentEvent, RunState } from "@collab-forge/shared";

export { DAGExecutor } from "@collab-forge/agent-runtime/dag";
export type { RunState, AgentNode, AgentEvent } from "@collab-forge/shared";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REDIS_URL: string;
  ENVIRONMENT: string;
}

type WebSocketMessage =
  | { type: "event"; event: AgentEvent }
  | { type: "status"; status: string; agentId?: string }
  | { type: "error"; message: string };

export class OrchestratorEngine {
  private logger: StructuredLogger;
  private tracer: EventTracer;
  private toolRegistry: ToolRegistry;
  private abortControllers = new Map<string, AbortController>();
  private websocketClients = new Map<string, Set<WebSocket>>();

  constructor(private env: Env) {
    this.logger = new StructuredLogger("orchestrator");
    this.tracer = new EventTracer();
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerMany([
      new CodeInterpreterTool(),
      new WebSearchTool(),
      new FileSystemTool(),
      new HttpRequestTool(),
    ]);
    this.logger.info("Orchestrator initialized", { tools: this.toolRegistry.list().map(t => t.name) });
  }

  async executeRun(runState: RunState): Promise<RunState> {
    const { runId } = runState;
    const controller = new AbortController();
    this.abortControllers.set(runId, controller);

    this.logger.info("Starting DAG execution", { runId, nodes: runState.nodes.length });
    this.broadcast(runId, { type: "status", status: "running" });

    const executor = new DAGExecutor(runState.nodes, (event) => {
      this.tracer.emit(event);
      this.persistEvent(runId, event);
      this.broadcast(runId, { type: "event", event });
    }, controller);

    try {
      const result = await executor.execute(
        async (node, input, signal) => this.runAgent(node, input, signal),
        this.toolRegistry
      );

      this.broadcast(runId, { type: "status", status: result.failed.length > 0 ? "failed" : "completed" });
      this.abortControllers.delete(runId);

      this.logger.info("DAG execution complete", {
        runId,
        completed: result.completed.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
        durationMs: result.durationMs,
      });

      return {
        ...runState,
        status: result.failed.length > 0 ? "failed" : "completed",
        updatedAt: new Date().toISOString(),
        metrics: {
          totalTokens: runState.metrics.totalTokens,
          totalLatencyMs: runState.metrics.totalLatencyMs + result.durationMs,
          toolCalls: runState.metrics.toolCalls,
        },
      };
    } catch (err) {
      this.broadcast(runId, { type: "error", message: err instanceof Error ? err.message : String(err) });
      this.abortControllers.delete(runId);
      throw err;
    }
  }

  cancelRun(runId: string) {
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
      this.broadcast(runId, { type: "status", status: "cancelled" });
      this.logger.info("Run cancelled", { runId });
    }
  }

  registerWebSocket(runId: string, ws: WebSocket) {
    const clients = this.websocketClients.get(runId) ?? new Set();
    clients.add(ws);
    this.websocketClients.set(runId, clients);

    ws.addEventListener("close", () => {
      clients.delete(ws);
      if (clients.size === 0) this.websocketClients.delete(runId);
    });
  }

  private broadcast(runId: string, message: WebSocketMessage) {
    const clients = this.websocketClients.get(runId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    for (const ws of clients) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      } catch {
        clients.delete(ws);
      }
    }
  }

  private async runAgent(node: AgentNode, input: unknown, signal: AbortSignal): Promise<unknown> {
    this.logger.info("Running agent", { agentId: node.id, name: node.name });
    const start = Date.now();

    const systemPrompt = this.buildSystemPrompt(node);
    const userPrompt = this.buildUserPrompt(node, input);
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.callLLM(messages, node.tools, signal);
    const durationMs = Date.now() - start;

    this.tracer.emit({
      type: "log",
      agentId: node.id,
      level: "info",
      message: `Agent ${node.name} completed in ${durationMs}ms`,
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  private buildSystemPrompt(node: AgentNode): string {
    const toolDefs = node.tools.map((t) => {
      const def = this.toolRegistry.list().find((d) => d.name === t);
      return def ? `- ${def.name}: ${def.description}\n  Parameters: ${JSON.stringify(def.parameters)}` : "";
    }).filter(Boolean).join("\n");

    return `You are ${node.name}, an AI agent in a collaborative coding IDE.

Your task: ${node.prompt}

Available tools:
${toolDefs || "(none)"}

Rules:
1. Output valid JSON only. No markdown fences, no prose.
2. Use tools when you need external data. Call tools by name in your response.
3. If you cannot complete the task, return an error object: { "error": "reason" }.
4. Always include artifacts as an array of { path, content, language } objects.`;
  }

  private buildUserPrompt(node: AgentNode, input: unknown): string {
    return `Execute your task. Input from upstream agents: ${JSON.stringify(input, null, 2)}`;
  }

  private async callLLM(
    messages: Array<{ role: string; content: string }>,
    tools: string[],
    signal: AbortSignal
  ): Promise<unknown> {
    const providers = [
      { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: this.env.LOVABLE_API_KEY, model: "google/gemini-3-flash-preview", headers: { "Lovable-API-Key": this.env.LOVABLE_API_KEY } },
      { url: "https://api.groq.com/openai/v1/chat/completions", key: this.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile", headers: {} },
      { url: "https://integrate.api.nvidia.com/v1/chat/completions", key: this.env.NVIDIA_API_KEY, model: "nvidia/llama-3.3-nemotron-super-49b-v1", headers: {} },
    ];

    const body = {
      model: providers[0].model,
      messages,
      tools: tools.map((t) => ({ type: "function", function: { name: t, description: "" } })),
      temperature: 0.2,
      max_tokens: 4096,
    };

    for (const provider of providers) {
      if (!provider.key) continue;
      try {
        const resp = await fetch(provider.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...provider.headers },
          body: JSON.stringify(body),
          signal,
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === "string") {
          try { return JSON.parse(content); } catch { return content; }
        }
        return content;
      } catch {
        continue;
      }
    }
    return { error: "All providers failed" };
  }

  private async persistEvent(runId: string, event: AgentEvent): Promise<void> {
    try {
      await fetch(`${this.env.SUPABASE_URL}/rest/v1/run_events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": this.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          run_id: runId,
          event_type: event.type,
          payload: event,
          created_at: new Date().toISOString(),
        }),
      });
    } catch {
      // Non-critical: event persistence failure shouldn't block execution
    }
  }

  private get SUPABASE_URL() { return this.env.SUPABASE_URL ?? ""; }
  private get SUPABASE_SERVICE_ROLE_KEY() { return this.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; }
  private get LOVABLE_API_KEY() { return this.env.LOVABLE_API_KEY ?? ""; }
  private get GROQ_API_KEY() { return this.env.GROQ_API_KEY ?? ""; }
  private get NVIDIA_API_KEY() { return this.env.NVIDIA_API_KEY ?? ""; }
}

class FileSystemTool implements ToolDefinition {
  name = "read_file";
  description = "Read a file from the project workspace by path.";
  parameters = {
    type: "object",
    properties: { path: { type: "string", description: "File path to read" } },
    required: ["path"],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { path } = input as { path: string };
    return { success: true, output: `// File content for ${path}`, durationMs: 0 };
  }
}

class HttpRequestTool implements ToolDefinition {
  name = "http_request";
  description = "Make an HTTP GET/POST request. Returns status, headers, and body.";
  parameters = {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
      headers: { type: "object" },
      body: { type: "object" },
    },
    required: ["url", "method"],
  };

  async execute(input: unknown): Promise<ToolResult> {
    const { url, method = "GET", headers = {}, body } = input as {
      url: string; method?: string; headers?: Record<string, string>; body?: unknown;
    };
    const start = Date.now();
    try {
      const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await resp.text();
      return {
        success: true,
        output: { status: resp.status, headers: Object.fromEntries(resp.headers), body: text },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return { success: false, output: null, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start };
    }
  }
}
