# ADR-002: Event Sourcing in Postgres for Agent Runs

## Status

Accepted

## Context

Agent run state in Signhify AI Workspace is stored as a single JSON blob in `runs.result`.
This makes it impossible to:
- Replay a run to debug why an agent produced bad output
- Show a live event stream in the UI without polling
- Partition runs by user and time for multi-tenant isolation
- Audit tool calls and artifacts independently of the run

## Decision

Use Postgres as the event store with three tables:

1. **`runs`**: Aggregate root — `run_id`, `user_id`, `status`, `trace_id`, metrics.
2. **`run_events`**: Append-only event log — `event_type` (transition, log, artifact,
   tool_call, tool_result, error, complete), `payload` (full event JSON), `created_at`.
3. **`run_artifacts`**: Content-addressed artifact storage — `path`, `content`,
   `language`, `size_bytes`. Kept separate from events for query performance.

Realtime: Enable Supabase Realtime on `run_events` so the client can subscribe to
a live event stream via WebSocket without polling.

## Consequences

- **Query performance**: `run_events` grows unbounded per run. Add a TTL or
  archive policy after 30 days for completed runs.
- **Write amplification**: Each agent action now writes 2-3 rows instead of 1.
  Negligible at current scale; add batching for >100 events/second.
- **Replay**: To replay a run, read `run_events` ordered by `created_at ASC` and
  rehydrate the state machine. This is the primary debugging mechanism.

## Alternatives Considered

- **Redis Streams**: Faster, but no durability across restarts and no SQL joins
  with user/run metadata.
- **Kafka**: Industry standard for event sourcing, but requires a separate cluster
  and doesn't fit the "minimal new infra" constraint.
