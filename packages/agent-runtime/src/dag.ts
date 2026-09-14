import type {
  AgentId,
  AgentNode,
  AgentStatus,
  AgentEvent,
  DAGExecutionResult,
  ToolDefinition,
  ToolContext,
  ToolResult,
} from "@collab-forge/shared";

export class DAGExecutor {
  private nodes: Map<AgentId, AgentNode>;
  private statuses: Map<AgentId, AgentStatus>;
  private results: Map<AgentId, unknown>;
  private eventBus: (event: AgentEvent) => void;
  private cancelled = false;
  private abortController: AbortController;

  constructor(
    nodes: AgentNode[],
    eventBus: (event: AgentEvent) => void,
    abortController: AbortController = new AbortController()
  ) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.statuses = new Map(nodes.map((n) => [n.id, "pending"]));
    this.results = new Map();
    this.eventBus = eventBus;
    this.abortController = abortController;
  }

  async execute(
    runAgent: (node: AgentNode, input: unknown, signal: AbortSignal) => Promise<unknown>,
    tools: Map<string, ToolDefinition>
  ): Promise<DAGExecutionResult> {
    const startTime = Date.now();
    const completed: AgentId[] = [];
    const failed: AgentId[] = [];
    const skipped: AgentId[] = [];

    while (this.hasPending()) {
      if (this.cancelled || this.abortController.signal.aborted) {
        for (const [id, status] of this.statuses) {
          if (status === "running" || status === "pending") {
            this.statuses.set(id, "cancelled");
            skipped.push(id);
          }
        }
        break;
      }

      const ready = this.getReadyNodes();
      if (ready.length === 0) {
        const pending = Array.from(this.statuses.entries()).filter(
          ([, s]) => s === "pending"
        );
        if (pending.length > 0) {
          for (const [id] of pending) {
            this.statuses.set(id, "skipped");
            skipped.push(id);
          }
        }
        break;
      }

      const results = await Promise.allSettled(
        ready.map((node) => this.runNode(node, runAgent, tools))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const node = ready[i];
        if (result.status === "fulfilled") {
          completed.push(node.id);
          this.results.set(node.id, result.value);
        } else {
          failed.push(node.id);
          this.statuses.set(node.id, "error");
          this.emit({
            type: "error",
            agentId: node.id,
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
            recoverable: false,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return {
      runId: "",
      completed,
      failed,
      skipped,
      durationMs: Date.now() - startTime,
    };
  }

  cancel() {
    this.cancelled = true;
    this.abortController.abort();
  }

  private hasPending(): boolean {
    for (const status of this.statuses.values()) {
      if (status === "pending" || status === "running") return true;
    }
    return false;
  }

  private getReadyNodes(): AgentNode[] {
    const ready: AgentNode[] = [];
    for (const [id, node] of this.nodes) {
      if (this.statuses.get(id) !== "pending") continue;
      const deps = node.dependsOn;
      const allDepsDone = deps.every(
        (depId) => this.statuses.get(depId) === "done"
      );
      if (allDepsDone) ready.push(node);
    }
    return ready;
  }

  private async runNode(
    node: AgentNode,
    runAgent: (node: AgentNode, input: unknown, signal: AbortSignal) => Promise<unknown>,
    tools: Map<string, ToolDefinition>
  ): Promise<unknown> {
    this.statuses.set(node.id, "running");
    this.emit({
      type: "transition",
      agentId: node.id,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    const depResults = new Map(
      node.dependsOn.map((depId) => [depId, this.results.get(depId)])
    );

    let retries = 0;
    while (retries <= node.maxRetries) {
      try {
        const signal = AbortSignal.any([this.abortController.signal, AbortSignal.timeout(node.timeoutMs)]);
        const result = await runAgent(node, Object.fromEntries(depResults), signal);
        this.statuses.set(node.id, "done");
        this.emit({
          type: "transition",
          agentId: node.id,
          status: "done",
          timestamp: new Date().toISOString(),
        });
        return result;
      } catch (err) {
        retries++;
        if (retries > node.maxRetries) throw err;
        this.emit({
          type: "log",
          agentId: node.id,
          level: "warn",
          message: `Agent ${node.name} failed, retrying (${retries}/${node.maxRetries})`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    throw new Error(`Agent ${node.name} exhausted retries`);
  }

  private emit(event: AgentEvent) {
    this.eventBus(event);
  }
}
