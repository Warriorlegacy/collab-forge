import { Hono } from "npm:hono";
import { cors } from "npm:@hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.get("/health", (c) => c.json({ status: "ok", service: "collab-forge-worker" }));

app.post("/api/runs", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
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
  return c.json(data);
});

app.get("/api/runs/:id", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
  const runId = c.req.param("id");
  const { data } = await supabase.from("runs").select("*").eq("id", runId).single();
  return c.json(data ?? {});
});

app.post("/api/runs/:id/cancel", async (c) => {
  return c.json({ cancelled: true });
});

export default app;
