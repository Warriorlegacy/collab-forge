# Piyush Raj Singh

**AI Systems Engineer · Distributed Systems · Remote (India)**

---

## Summary

Engineer building production-grade AI infrastructure, agent runtimes, and full-stack SaaS. 24 shipped products across Fintech, LegalTech, HealthTech, DevOps, and MarTech. Registered MSME. Open to remote full-time roles at **₹45 LPA+**.

---

## Core Competencies

| Domain | Skills |
|--------|--------|
| **Distributed Systems** | Event sourcing, DAG execution, Redis pub/sub, causal ordering, idempotency |
| **AI Infrastructure** | Multi-provider LLM gateway, BYOK AES-256-GCM, tool-use loops, function calling |
| **Real-time** | WebSocket streaming, Y.js CRDT, Supabase Realtime, live presence |
| **Full-Stack** | React 19, TanStack Start, Supabase, Stripe, Cloudflare Workers, Edge Functions |
| **Systems Design** | ADRs, performance benchmarks, P99 latency targets, security boundaries |

---

## Featured Project: CollabForge

**Real-Time Collaborative AI Agent IDE** — [github.com/Warriorlegacy/collab-forge](https://github.com/Warriorlegacy/collab-forge)

- **DAGExecutor**: Topological-sort concurrent execution with per-agent timeouts, `AbortSignal` cancellation propagation, automatic retries
- **Event Sourcing**: Append-only `run_events` in Postgres + Supabase Realtime for live streaming without polling
- **Tool Runtime**: `code_interpreter` in Web Worker sandbox, `web_search` via DuckDuckGo, `http_request` — all with structured telemetry
- **Cloudflare Worker**: Hono-based orchestrator with multi-provider LLM fallback (LovableAI, Groq, NVIDIA)
- **Tests**: 8 passing unit tests (DAGExecutor concurrency, dependency ordering, retry, cancellation + ToolRegistry)
- **CI**: GitHub Actions running `bun test` + `typecheck` on every push

**Stack**: TypeScript · React 19 · Cloudflare Workers · Supabase · Y.js · Liveblocks

---

## Selected Projects

### Signhify_Studio
**AI-Powered Product Studio** — [github.com/Warriorlegacy/Signhify_Studio](https://github.com/Warriorlegacy/Signhify_Studio)

- 6-agent durable orchestrator with Postgres-backed state machine, per-agent validation, SSE streaming
- Multi-provider AI gateway (11 providers) with priority-based fallback, 3-strike cooldown, health checks
- BYOK AES-256-GCM encryption — client-side WebCrypto, server-side master key, zero-knowledge key storage
- Stripe Connect marketplace with one-time + subscription billing, idempotent webhook handling
- GitHub Git Data API export — single commit per export, proper base-tree merge, no merge conflicts
- **Stack**: TanStack Start, React 19, Supabase, Stripe, Cloudflare Workers, Three.js

### 24 Shipped Products (Signhify Portfolio)
- **AuditMind AI** — R&D credit qualification engine (React 19, Groq Llama-3.3, jsPDF, Canvas)
- **ContractSentinel AI** — Autonomous contract risk assessment with DOCX redlining (React 19, JSZip, OOXML)
- **CodeVortex SRE** — Kubernetes incident triage engine converting stack traces to code diffs (AST Engine, Groq AI)
- **SynthMed AI** — Clinical scribe with ICD-10/CPT billing codes (Web Speech API, Medical Ontology)
- **AdGenesis AI** — Multi-platform ad generator with bandit reinforcement (Recharts, Tailwind)
- **TenderBot Global** — Government contracting intelligence (FAR Matrix Scanner, Groq AI)
- **QualiCheck AI** — In-browser CV metrology at 60 FPS (HTML5 Canvas, Web Workers)
- **TalentPulse AI** — Browser-based Python code execution with AST anti-cheat (Pyodide WASM)
- **DataLightning AI** — SQL analytics on million-row Parquet/CSV (DuckDB-WASM)
- **HyperLocalize AI** — Video subtitle localization with cultural idiom adaptation (SRT Engine, Web Audio)
- **NexusVIP** — P2P sports betting exchange with sub-millisecond order matching (React 18, Node.js)
- **AutoTube** — YouTube channel automation with AI scripts and auto-publish (OpenAI, YouTube API, n8n)

---

## Technical Writing

- *How I Built a Durable Agent Orchestrator* — event-sourced state machines for AI pipelines
- *BYOK Encryption in a Multi-Provider AI Gateway* — zero-knowledge key management at scale
- *Systems Design Interview Prep* — 5 narratives on scaling, cancellation, human-in-the-loop, gateway design, debugging

---

## Education

Self-taught systems engineer. Focus: distributed systems, AI infrastructure, production-grade SaaS.

---

## Links

- **Portfolio**: [signhify.dpdns.org](https://signhify.dpdns.org)
- **GitHub**: [github.com/Warriorlegacy](https://github.com/Warriorlegacy)
- **Email**: piyushrajsingh092@gmail.com
- **WhatsApp**: +91 62024 42690
- **LinkedIn**: [linkedin.com/in/piyushraj-singh](https://linkedin.com/in/piyushraj-singh)
