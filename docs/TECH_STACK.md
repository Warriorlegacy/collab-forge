# CollabForge — Technical Deep-Dive

Use this document when discussing CollabForge in interviews, demos, or technical
reviews. Every bullet below is a talking point that signals specific engineering
competencies.

## Architecture at a Glance

| Layer | Technology | What It Proves |
|-------|-----------|---------------|
| Frontend | React 19, Vite, Zustand, Framer Motion | Modern React patterns, state management, animation |
| Realtime | Y.js (CRDT), Liveblocks (presence) | Distributed systems, conflict resolution |
| Worker | Cloudflare Workers, Hono | Edge computing, serverless, low-latency APIs |
| Agent Runtime | TypeScript (DAGExecutor, ToolRegistry) | Concurrent execution, DAG algorithms, sandboxing |
| Persistence | Supabase Postgres (event sourcing) | Database design, event sourcing, RLS |
| Realtime DB | Supabase Realtime | WebSocket infrastructure, live data sync |

## Talking Points by Domain

### Distributed Systems

- **Event sourcing**: Every agent action is an append-only event in `run_events`.
  The run state is a projection of these events. Crash recovery = replay events.
- **Causal ordering**: Events are ordered by `created_at ASC`. No event can be
  processed before its dependencies are `done`.
- **DAG execution**: Agents declare `dependsOn: AgentId[]`. The executor uses
  topological sort to find ready agents and runs them concurrently via
  `Promise.allSettled`.
- **Cancellation propagation**: A single `AbortController` is shared across all
  in-flight agents. Abort signal = all agents stop immediately.

### AI Infrastructure

- **Multi-provider gateway**: 11 providers (LovableAI, Groq, Cerebras, NVIDIA,
  OpenRouter, Gemini, Ollama, Mistral, xAI, Anthropic, Cohere) with priority-based
  fallback and 3-strike cooldown.
- **BYOK encryption**: Client-side AES-256-GCM in browser via WebCrypto. Raw keys
  never leave the browser — only encrypted blobs hit the server.
- **Tool-use loops**: Agents can call `code_interpreter`, `web_search`, and
  `http_request` tools. The runtime handles tool invocation, result passing, and
  error recovery.
- **Sandboxed execution**: `code_interpreter` runs in a Web Worker with
  timeout/memory limits. No access to DOM, localStorage, or parent scope.

### Real-time Infrastructure

- **Y.js CRDT**: Conflict-free replicated data types for collaborative editing.
  Two users can edit the same agent node simultaneously without conflicts.
- **Liveblocks presence**: Real-time cursor positions, who's editing which node,
  and live chat.
- **Supabase Realtime**: `run_events` and `user_presence` tables are published
  via Supabase Realtime. The client subscribes via WebSocket and receives events
  instantly — no polling.

### Systems Design Decisions

| Decision | Rationale |
|----------|-----------|
| DAG over sequential | Parallel agents = 2x throughput for independent tasks |
| Postgres over Redis Streams | Durability, SQL joins, Realtime extension |
| Cloudflare Workers over containers | Zero cold-start, auto-scaling, global edge |
| Web Worker sandbox over iframe | Simpler lifecycle, no DOM access, easy timeout |
| Client-side encryption over server-side | Zero-knowledge: server never sees raw keys |

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent P50 latency | < 2s | `run_agents.latency_ms` |
| Agent P95 latency | < 5s | `run_agents.latency_ms` |
| Tool call P50 latency | < 500ms | `tool_calls.duration_ms` |
| Event delivery latency | < 100ms | Supabase Realtime |
| Concurrent runs | 1000+ | Cloudflare Workers auto-scale |

## Observability

- **Structured logging**: Every log line is JSON with `level`, `prefix`,
  `message`, `ts`. No string concatenation.
- **Metrics**: `runs.total_tokens`, `runs.total_latency_ms`, `tool_calls`
  count per run.
- **Tracing**: `EventTracer` records every transition, log, artifact, tool call,
  and error. Full replay = exact reproduction of a run.

## Security

- **RLS**: All tables have `user_id = auth.uid()` policies. No anon access.
- **BYOK**: Raw keys never hit the server. Encrypted blobs only.
- **CSP**: Strict Content-Security-Policy in Worker.
- **Rate limiting**: IP-based via Supabase `rate_limits` table.
- **Input validation**: All server functions use Zod validators.
