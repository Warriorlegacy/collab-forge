import { describe, it, expect, vi } from "vitest";
import { DAGExecutor } from "./dag";
import { ToolRegistry } from "./tools";

type AgentNode = {
  id: string;
  name: string;
  prompt: string;
  tools: string[];
  dependsOn: string[];
  timeoutMs: number;
  maxRetries: number;
};

type AgentEvent = {
  type: string;
  agentId?: string;
  status?: string;
  timestamp: string;
  message?: string;
  level?: string;
};

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: unknown, ctx: { runId: string; agentId: string }) => Promise<{ success: boolean; output: unknown; error?: string; durationMs: number }>;
};

type ToolContext = {
  runId: string;
  agentId: string;
};

type ToolResult = {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
};

function createNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: overrides.id ?? "test-node",
    name: overrides.name ?? "Test Agent",
    prompt: overrides.prompt ?? "Test prompt",
    tools: overrides.tools ?? [],
    dependsOn: overrides.dependsOn ?? [],
    timeoutMs: overrides.timeoutMs ?? 5000,
    maxRetries: overrides.maxRetries ?? 0,
  };
}

describe("DAGExecutor", () => {
  it("runs a single node with no dependencies", async () => {
    const events: AgentEvent[] = [];
    const executor = new DAGExecutor([createNode({ id: "a" })], (event) => events.push(event));

    const result = await executor.execute(async () => ({ output: "ok" }), new Map());

    expect(result.completed).toContain("a");
    expect(result.failed).toHaveLength(0);
    expect(events.some((e) => e.type === "transition" && (e as { agentId?: string }).agentId === "a" && (e as { status?: string }).status === "done")).toBe(true);
  });

  it("runs independent nodes concurrently", async () => {
    const order: string[] = [];
    const executor = new DAGExecutor(
      [
        createNode({ id: "a", dependsOn: [] }),
        createNode({ id: "b", dependsOn: [] }),
      ],
      () => {}
    );

    await executor.execute(
      async (node) => {
        order.push(node.id);
        await new Promise((r) => setTimeout(r, 50));
        return node.id;
      },
      new Map()
    );

    expect(order).toContain("a");
    expect(order).toContain("b");
  });

  it("respects dependency ordering", async () => {
    const order: string[] = [];
    const executor = new DAGExecutor(
      [
        createNode({ id: "a", dependsOn: [] }),
        createNode({ id: "b", dependsOn: ["a"] }),
      ],
      () => {}
    );

    await executor.execute(
      async (node) => {
        order.push(node.id);
        await new Promise((r) => setTimeout(r, 10));
        return node.id;
      },
      new Map()
    );

    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
  });

  it("retries failed nodes up to maxRetries", async () => {
    let attempts = 0;
    const executor = new DAGExecutor([createNode({ id: "a", maxRetries: 2 })], () => {});

    await executor.execute(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("fail");
        return "ok";
      },
      new Map()
    );

    expect(attempts).toBe(3);
  });

  it("cancels all in-flight agents on abort", async () => {
    const events: AgentEvent[] = [];
    const controller = new AbortController();
    const executor = new DAGExecutor(
      [createNode({ id: "a", timeoutMs: 2000 }), createNode({ id: "b", timeoutMs: 2000 })],
      (event) => events.push(event),
      controller
    );

    setTimeout(() => controller.abort(), 50);

    const result = await executor.execute(
      async (_, __, signal) => {
        await new Promise((r) => setTimeout(r, 5000));
        if (signal.aborted) throw new Error("cancelled");
        return "should not complete";
      },
      new Map()
    );

    expect(result.skipped.length + result.failed.length).toBeGreaterThan(0);
  }, 10000);
});

describe("ToolRegistry", () => {
  it("registers and executes a tool", async () => {
    const tool: ToolDefinition = {
      name: "echo",
      description: "Echo input",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      execute: async (input) => ({ success: true, output: { text: (input as { text: string }).text }, durationMs: 0 }),
    };

    const registry = new ToolRegistry();
    registry.register(tool);

    const result = await registry.execute("echo", { text: "hello" }, { runId: "r1", agentId: "a1" } as ToolContext);
    expect(result.success).toBe(true);
    expect((result.output as { text: string }).text).toBe("hello");
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nonexistent", {}, { runId: "r1", agentId: "a1" } as ToolContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("tracks call stats", async () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition = {
      name: "fast",
      description: "Fast tool",
      parameters: { type: "object" },
      execute: async () => ({ success: true, output: null, durationMs: 1 }),
    };
    registry.register(tool);
    await registry.execute("fast", {}, { runId: "r1", agentId: "a1" } as ToolContext);
    await registry.execute("fast", {}, { runId: "r1", agentId: "a1" } as ToolContext);

    const stats = registry.getStats("fast");
    expect(stats?.count).toBe(2);
    expect(stats?.errors).toBe(0);
  });
});
