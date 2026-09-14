# Systems Design Interview Prep — 5 Narratives

These are the 5 narratives I use when interviewing for senior/staff backend
and AI infrastructure roles. Each one connects a real production decision to
a systems design concept.

---

## 1. How would you make your agent orchestrator handle 1000 concurrent runs?

**Current state**: Single TanStack Start app, sequential 6-agent pipeline, in-memory state.

**Target**: 1000 concurrent runs × 6 agents = 6000 concurrent agent executions.

### Approach

1. **Event sourcing in Postgres** — `run_events` is append-only and can be
   partitioned by `run_id`. Each run's events are independent, so Postgres can
   handle 1000 concurrent writes to different partitions without contention.

2. **Partitioned Redis streams** — For real-time event delivery, use Redis
   Streams partitioned by `run_id`. Each client subscribes to its own stream.
   This avoids the "broadcast to all" problem of pub/sub.

3. **DAG parallelism** — With a concurrent DAG executor, a 4-agent pipeline
   with 2 parallel branches runs 2 agents simultaneously. That doubles throughput
   without adding infrastructure.

4. **Provider-level rate limiting** — Each LLM provider has a token bucket.
   When a provider is rate-limited, the gateway backs off and retries with
   exponential backoff + jitter.

5. **Worker autoscaling** — Cloudflare Workers scale to zero and handle
   thousands of concurrent requests. No manual scaling needed.

### Trade-offs

- **Event sourcing vs. in-memory**: 2-3x write amplification, but infinite
  durability and replayability. Worth it for production.
- **Redis Streams vs. Supabase Realtime**: Redis Streams give better
  backpressure control. Supabase Realtime is simpler to set up.

---

## 2. How do you prevent a stuck agent from blocking the pipeline?

### Approach

1. **Per-agent timeout with `AbortSignal.timeout()`** — Each agent gets a
   hard timeout (15-30s). If the LLM call hangs, the signal fires and the
   agent is marked `error`.

2. **Cancellation propagation** — A single `AbortController` is shared across
   all in-flight agents. If the run is cancelled, every agent receives the
   abort signal.

3. **Circuit breaker pattern** — After 3 consecutive failures, a provider is
   disabled for 5 minutes. This prevents cascading failures.

4. **Dead letter queue** — Failed agents are moved to a `failed_agents` table
   with the error message and input. A worker can retry them later with
   backoff.

```typescript
const signal = AbortSignal.any([
  this.abortController.signal,
  AbortSignal.timeout(node.timeoutMs)
]);
```

---

## 3. How would you add human-in-the-loop approval?

### Approach

1. **New agent status: `awaiting_approval`** — When an agent reaches a
   checkpoint, its status changes from `running` to `awaiting_approval`.

2. **Event-sourced state machine** — The `run_events` table records the
   transition. The client subscribes via Supabase Realtime and shows a UI
   prompt.

3. **WebSocket push to client** — The worker emits a `approval_required` event
   with the agent ID, artifact preview, and options (approve / edit / reject).

4. **Resume from checkpoint** — When the user approves, the run continues from
   the awaiting agent. If rejected, the run moves to `failed` with the user's
   reason.

```typescript
// In DAGExecutor
if (node.requiresApproval && !this.approvalCache.has(node.id)) {
  this.statuses.set(node.id, "awaiting_approval");
  await this.waitForApproval(node.id); // Blocks until user responds
}
```

---

## 4. How do you scale the AI gateway?

### Approach

1. **Provider-level rate limiting** — Each provider has a token bucket with
   capacity = (rate limit / 60s) × refill interval. Requests that exceed the
   bucket are queued with exponential backoff.

2. **Request coalescing** — If 10 users ask the same question within 1 minute,
   the gateway sends 1 request to the LLM and broadcasts the response. Saves
   tokens and latency.

3. **Response caching by prompt hash** — Identical prompts return cached
   responses. Cache key = SHA-256(prompt + model + temperature). TTL = 1 hour.

4. **Priority queue** — Paid users' requests skip the queue. Free users' requests
   are rate-limited to 10 requests/minute.

5. **Provider health scoring** — Each provider has a health score based on
   success rate, P50 latency, and P95 latency. The gateway prefers providers
   with health > 0.95.

```typescript
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  async acquire(provider: string, tokens: number): Promise<void> {
    const bucket = this.buckets.get(provider) ?? new TokenBucket(100, 60_000);
    await bucket.acquire(tokens);
  }
}
```

---

## 5. How would you debug a production agent run?

### Approach

1. **Event store replay** — Read `run_events` ordered by `created_at ASC` and
   rehydrate the state machine in a local debugger. This reproduces the exact
   sequence of agent transitions, tool calls, and errors.

2. **Trace-level logging** — Every LLM call logs: prompt hash, model, provider,
   latency, tokens used, response status. This lets you correlate slow runs with
   specific providers.

3. **Artifact diffing** — Each agent's output is stored in `run_artifacts` with
   a content hash. If an agent produces bad output, you can diff it against the
   previous run's artifact to see what changed.

4. **Tool call telemetry** — The `tool_calls` table records every tool
   invocation with input, output, duration, and success/failure. This lets you
   identify flaky tools (e.g., `web_search` returning empty results).

```sql
-- Find the agent that caused the failure
SELECT ra.name, ra.status, ra.error, ra.latency_ms
FROM run_agents ra
WHERE ra.run_id = $runId
  AND ra.status = 'error'
ORDER BY ra.created_at;

-- Replay the event stream
SELECT payload
FROM run_events
WHERE run_id = $runId
ORDER BY created_at ASC;
```
