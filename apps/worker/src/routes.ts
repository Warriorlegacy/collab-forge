import { Hono } from "npm:hono";
import { cors } from "npm:@hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { OrchestratorEngine } from "./engine";
import type { Env } from "./engine";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.get("/health", (c) => c.json({ status: "ok", service: "collab-forge-worker" }));

app.post("/api/runs", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const engine = new OrchestratorEngine(c.env);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("runs")
    .insert({
      user_id: body.userId,
      prompt: body.prompt,
      status: "queued",
      trace_id: crypto.randomUUID(),
    })
    .select("id, trace_id")
    .single();

  if (error || !data) return c.json({ error: error?.message ?? "Failed" }, 500);

  const { data: nodesData } = await supabase
    .from("agent_nodes")
    .select("*")
    .eq("run_id", data.id)
    .order("created_at", { ascending: true });

  if (!nodesData || nodesData.length === 0) {
    await supabase.from("runs").delete().eq("id", data.id);
    return c.json({ error: "No agent nodes found for run" }, 400);
  }

  const nodes: AgentNode[] = nodesData.map((row) => ({
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    tools: Array.isArray(row.tools) ? row.tools : [],
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on : [],
    timeoutMs: row.timeout_ms,
    maxRetries: row.max_retries,
  }));

  const runState: RunState = {
    runId: data.id,
    userId: body.userId,
    prompt: body.prompt,
    status: "running",
    nodes,
    events: [],
    artifacts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentAgentId: null,
    metrics: { totalTokens: 0, totalLatencyMs: 0, toolCalls: 0 },
  };

  c.executionCtx.waitUntil(
    engine.executeRun(runState).then((updated) => {
      return supabase
        .from("runs")
        .update({
          status: updated.status,
          result: updated,
          total_tokens: updated.metrics.totalTokens,
          total_latency_ms: updated.metrics.totalLatencyMs,
          tool_calls: updated.metrics.toolCalls,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
    })
  );

  const host = c.req.header("host");
  return c.json({
    ...data,
    websocketUrl: `wss://${host}/ws/runs/${data.id}`,
  });
});

app.get("/api/runs/:id", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = c.req.param("id");
  const { data } = await supabase.from("runs").select("*").eq("id", runId).single();
  return c.json(data ?? {});
});

app.post("/api/runs/:id/cancel", async (c) => {
  const runId = c.req.param("id");
  const engine = new OrchestratorEngine(c.env);
  engine.cancelRun(runId);
  return c.json({ cancelled: true, runId });
});

export default app;
