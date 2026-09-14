# CollabForge Architecture

## Overview

CollabForge is a real-time collaborative AI agent IDE. Multiple users can
orchestrate, edit, and debug AI agent pipelines together — think Figma for AI
workflows.

## System Diagram

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

## Request Flow

```
User clicks "Run Pipeline"
  │
  ▼
POST /api/runs
  → insert run + agent_nodes rows (status: queued)
  → return run_id
  │
  ▼
Worker picks up run (polling or push)
  │
  ▼
DAGExecutor.execute(run)
  │
  ├── getReadyNodes() → agents whose dependsOn are all "done"
  ├── Promise.allSettled(ready.map(runAgent))
  │     ├── per-agent timeout (AbortSignal.timeout)
  │     ├── LLM call with provider fallback
  │     ├── tool execution via ToolRegistry
  │     └── emit transition + log + artifact events
  │
  ▼
All agents done
  → update runs.status = completed
  → persist final metrics
  → emit complete event
```

## Key Decisions

See [ADR-001](ADR-001-dag-executor.md) and [ADR-002](ADR-002-event-sourcing.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Zustand + Framer Motion |
| Realtime | Y.js (CRDT) + Liveblocks (presence) |
| Worker | Cloudflare Workers + Hono |
| Agent Runtime | Pure TypeScript (DAGExecutor, ToolRegistry) |
| Persistence | Supabase Postgres (event sourcing) |
| Realtime DB | Supabase Realtime (run_events, user_presence) |
| Tools | Web Worker sandbox (code_interpreter), DuckDuckGo (web_search) |
