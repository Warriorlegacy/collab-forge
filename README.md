# CollabForge

**Real-Time Collaborative AI Agent IDE with Distributed Orchestration**

A production-grade AI coding platform where multiple users can orchestrate, edit, and debug AI agent pipelines together — with DAG-based concurrent execution, event-sourced state, live streaming, and sandboxed tool use.

## Why This Exists

Most AI coding tools are single-user, single-agent, and opaque. CollabForge proves three things that 45 LPA remote roles care about:

1. **Distributed systems**: Redis pub/sub, event sourcing in Postgres, causal ordering of agent events
2. **Real-time infra**: WebSocket presence, Y.js CRDT sync, 60 FPS live agent streaming
3. **AI runtime depth**: Concurrent DAG execution (not sequential), tool-use loops, sandboxed code execution

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────────────────┐
│   Browser   │◄──────────────────►│  Cloudflare Worker          │
│  (React +   │  Y.js CRDT sync    │  (DAG Orchestrator)         │
│   Y.js)     │                    │  - Agent DAG scheduler      │
└─────────────┘                    │  - Redis pub/sub stream     │
       ▲                           │  - Tool-use loop engine     │
       │ Liveblocks                └──────────┬──────────────────┘
       │ presence                              │
  ┌────┴────┐                                 │
  │ Redis   │◄──────── pub/sub ────────────────┤
  │ Streams │                                  │
  └─────────┘   ┌──────────────────────────────┘│
                │                              │
       ┌────────▼────────┐                     │
       │  Supabase        │                     │
       │  Postgres        │                     │
       │  - runs          │  ← event sourcing   │
       │  - run_events    │  ← causal ordering  │
       │  - run_artifacts │  ← content store    │
       │  - user_presence │  ← live cursors     │
       │  - tool_calls    │  ← telemetry        │
       └──────────────────┘                     │
                                                │
                                  ┌─────────────▼──────────────┐
                                  │  @collab-forge/agent-runtime│
                                  │  - DAGExecutor              │
                                  │  - ToolRegistry             │
                                  │  - CodeInterpreterTool      │
                                  │  - EventTracer              │
                                  └─────────────────────────────┘
```

## Key Technologies

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Zustand, Framer Motion |
| Realtime | Y.js (CRDT), Liveblocks (presence) |
| Worker | Cloudflare Workers, Hono |
| Agent Runtime | TypeScript (DAGExecutor, ToolRegistry) |
| Persistence | Supabase Postgres (event sourcing) |
| Realtime DB | Supabase Realtime |
| Tools | Web Worker sandbox, DuckDuckGo |

## Quick Start

```bash
# Install dependencies
bun install

# Run web app
cd apps/web && bun run dev

# Run worker (requires wrangler)
cd apps/worker && bun run dev
```

## Project Structure

```
collab-forge/
├── apps/
│   ├── web/                 ← React 19 + Vite + Zustand + Framer Motion
│   └── worker/              ← Cloudflare Worker + Hono
├── packages/
│   ├── agent-runtime/       ← DAG executor, tool registry, sandbox, tracer
│   └── shared/              ← Types, Zod schemas, event store interface
├── supabase/
│   └── migrations/
│       └── 20260914_event_sourcing.sql
└── docs/
    ├── ADR-001-dag-executor.md
    ├── ADR-002-event-sourcing.md
    └── ARCHITECTURE.md
```

## License

MIT
