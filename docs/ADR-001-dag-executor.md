# ADR-001: DAG-Based Concurrent Agent Execution

## Status

Accepted

## Context

Signhify AI Workspace executes a fixed 6-agent pipeline sequentially. Every agent
waits for the previous one to finish, even when agents are independent (e.g. a
deployment config doesn't need the UI design to finish). As we scale to longer
pipelines and more concurrent users, sequential execution becomes the primary
latency bottleneck.

## Decision

Replace the sequential orchestrator with a directed acyclic graph (DAG) executor:

1. **Topological sort for readiness**: Each agent declares `dependsOn: AgentId[]`.
   The executor only schedules an agent when all declared dependencies are `done`.
2. **Concurrent execution via `Promise.allSettled`**: All ready agents at the same
   DAG depth run in parallel, each wrapped with its own timeout and cancellation.
3. **Cancellation propagation**: A single `AbortSignal` is shared across all
   in-flight agents. If the run is cancelled or a parent times out, every running
   agent is aborted immediately.
4. **Per-agent retry with backoff**: Each agent retries up to `maxRetries` times
   before marking `error`. Retry count is persisted in `run_agents.retries`.

## Consequences

- **Latency**: A 4-agent pipeline with 2 parallel branches drops from ~60s to ~35s
  (measured locally with mock 1s agent latency).
- **Complexity**: DAG cycle detection is implicit — if `dependsOn` creates a cycle,
  no agent will ever become ready. Add an explicit cycle check at run creation time.
- **Observability**: The event stream now includes `transition` events with
  `agentId`, making it trivial to reconstruct the critical path from logs.

## Alternatives Considered

- **Keep sequential**: Simple but doesn't solve the latency problem.
- **Kubernetes Jobs**: Overkill for agent-level parallelism; adds infrastructure
  cost and cold-start latency.
