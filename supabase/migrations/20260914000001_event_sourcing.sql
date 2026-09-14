-- CollabForge — Event-sourced agent execution schema.
-- Durable run state, agent events, tool telemetry, and presence.

-- ── 1. runs (extended) ──────────────────────────────────────────────────
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS prompt text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_agent_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS trace_id text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS total_tokens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_latency_ms int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tool_calls int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS runs_user_created_idx ON public.runs (user_id, created_at DESC);

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_runs" ON public.runs;
CREATE POLICY "users_own_runs" ON public.runs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 2. agent_nodes (DAG definition) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_nodes (
  id text PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  name text NOT NULL,
  prompt text NOT NULL,
  tools jsonb NOT NULL DEFAULT '[]',
  depends_on jsonb NOT NULL DEFAULT '[]',
  timeout_ms int NOT NULL DEFAULT 30000,
  max_retries int NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_nodes_run_idx ON public.agent_nodes (run_id);

ALTER TABLE public.agent_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_agent_nodes" ON public.agent_nodes;
CREATE POLICY "users_own_agent_nodes" ON public.agent_nodes
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = agent_nodes.run_id AND runs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = agent_nodes.run_id AND runs.user_id = auth.uid())
  );

-- ── 3. run_events (event sourcing) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_events_run_created_idx ON public.run_events (run_id, created_at ASC);

ALTER TABLE public.run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_run_events" ON public.run_events;
CREATE POLICY "users_own_run_events" ON public.run_events
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = run_events.run_id AND runs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = run_events.run_id AND runs.user_id = auth.uid())
  );

-- ── 4. run_artifacts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.run_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  path text NOT NULL,
  content text NOT NULL,
  language text,
  size_bytes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS run_artifacts_run_idx ON public.run_artifacts (run_id);

ALTER TABLE public.run_artifacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_run_artifacts" ON public.run_artifacts;
CREATE POLICY "users_own_run_artifacts" ON public.run_artifacts
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = run_artifacts.run_id AND runs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = run_artifacts.run_id AND runs.user_id = auth.uid())
  );

-- ── 5. tool_calls (telemetry) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  success boolean NOT NULL DEFAULT false,
  error text,
  duration_ms int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON public.tool_calls (run_id, created_at DESC);

ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_tool_calls" ON public.tool_calls;
CREATE POLICY "users_own_tool_calls" ON public.tool_calls
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = tool_calls.run_id AND runs.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.runs WHERE runs.id = tool_calls.run_id AND runs.user_id = auth.uid())
  );

-- ── 6. user_presence (live cursors / presence) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  run_id uuid REFERENCES public.runs(id) ON DELETE CASCADE,
  cursor_x float,
  cursor_y float,
  selected_agent_id text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_presence" ON public.user_presence;
CREATE POLICY "users_own_presence" ON public.user_presence
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 7. Realtime enable ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.run_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
