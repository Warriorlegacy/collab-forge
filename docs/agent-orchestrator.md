# How I Built a Durable Agent Orchestrator

The hardest part of multi-agent AI systems isn't the LLM calls — it's keeping
the state consistent when things fail. Here's how I built an orchestrator that
survives edge function timeouts, provider outages, and bad LLM output.

## The Problem

Most agent frameworks keep state in-memory. When the process crashes (and it
will), the entire run is lost. For a product studio shipping real client work,
that's unacceptable.

## The Solution: Event Sourcing in Postgres

Every agent action is an append-only event in a `run_events` table:

```sql
CREATE TABLE run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id),
  event_type text NOT NULL,        -- transition, log, artifact, tool_call, error
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

The run state is a projection of these events. If the worker crashes, a resume
worker reads the last `pending` agent and continues from there.

## Key Decisions

### 1. Per-Agent Validation, Not Post-Hoc

Each agent has a typed validator that enforces JSON shape before artifacts are
persisted. Bad LLM output is caught early and retried up to 2×.

```typescript
const validateFrontendOutput = (json: unknown): files[] => {
  if (!Array.isArray(json)) throw new Error("Expected array");
  return json.filter(f => /\.(tsx|ts|css|json|md)$/.test(f.path));
};
```

### 2. DAG Execution, Not Sequential

Agents that don't depend on each other run in parallel via `Promise.allSettled`.
A 4-agent pipeline with 2 parallel branches drops from ~60s to ~35s.

### 3. Cancellation Propagation

A single `AbortController` is shared across all in-flight agents. If the run is
cancelled or a parent times out, every running agent is aborted immediately.

```typescript
const signal = AbortSignal.any([
  this.abortController.signal,
  AbortSignal.timeout(node.timeoutMs)
]);
```

### 4. Mock Fallback Is Labeled, Never Silent

When all providers fail, the output is `{ provider_used: 'mock', status: 'fallback' }`
with a warn log. Silent mocks fake reliability metrics.

## The Result

- 6-agent pipeline runs in ~35s (was ~60s sequential)
- Survives edge function timeouts up to 10 minutes
- Live event stream via Supabase Realtime — no polling
- Zero data loss on crash: resume from last `pending` agent

## Full Code

See **[CollabForge](https://github.com/Warriorlegacy/collab-forge)** for the
complete implementation, including DAG executor, tool registry, and Cloudflare
Worker orchestrator.
