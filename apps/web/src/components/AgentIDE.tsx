import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, RotateCcw, Zap, Activity, Users, GitBranch } from "lucide-react";
import type { AgentNode, AgentEvent, AgentId, AgentStatus } from "@collab-forge/shared";
import { useAgentRunStore } from "../store/agent-run";
import { createRun, connectWebSocket } from "../lib/api";

function buildDefaultNodes(prompt: string): AgentNode[] {
  return [
    { id: "planner", name: "Planner", prompt: "Break the user request into a structured plan.", tools: ["web_search"], dependsOn: [], timeoutMs: 15000, maxRetries: 2 },
    { id: "coder", name: "Coder", prompt: `Implement the plan: ${prompt}`, tools: ["code_interpreter", "read_file"], dependsOn: ["planner"], timeoutMs: 30000, maxRetries: 2 },
    { id: "reviewer", name: "Reviewer", prompt: "Review the code for quality, security, and correctness.", tools: ["code_interpreter"], dependsOn: ["coder"], timeoutMs: 20000, maxRetries: 1 },
    { id: "deployer", name: "Deployer", prompt: "Prepare deployment config and documentation.", tools: ["http_request"], dependsOn: ["reviewer"], timeoutMs: 15000, maxRetries: 1 },
  ];
}

export default function AgentIDE() {
  const [prompt, setPrompt] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [nodes, setNodes] = useState<AgentNode[]>(() => buildDefaultNodes(""));
  const eventLogRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { activeRunId, runs, createRun, updateRunState, appendEvent, updateAgentStatus } = useAgentRunStore();

  const activeRun = activeRunId ? runs.get(activeRunId) : undefined;

  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [activeRun?.events.length]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleRun = async () => {
    if (!prompt.trim()) return;
    setIsRunning(true);
    const runNodes = buildDefaultNodes(prompt);
    setNodes(runNodes);

    try {
      const result = await createRun("demo-user", prompt, runNodes);
      const runId = result.id;
      createRun("demo-user", prompt, runNodes);
      updateRunState(runId, { status: "running", currentAgentId: runNodes[0].id });

      const ws = connectWebSocket(runId, (event) => {
        appendEvent(runId, event);
        if ((event as AgentEvent).agentId) {
          const status = (event as AgentEvent).type === "error" ? "error" : "running";
          updateAgentStatus(runId, (event as AgentEvent).agentId!, status);
        }
      });
      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to create run:", err);
      setIsRunning(false);
    }
  };

  const getNodeStatus = (nodeId: AgentId): AgentStatus | undefined => {
    if (!activeRun) return undefined;
    const node = activeRun.nodes.find((n) => n.id === nodeId);
    if (!node) return "pending";
    const allDepsDone = node.dependsOn.every((depId) => {
      const depNode = activeRun.nodes.find((n) => n.id === depId);
      if (!depNode) return true;
      return getNodeStatus(depId) === "done";
    });
    if (!allDepsDone) return "pending";
    return "done";
  };

  const statusColor: Record<AgentStatus, string> = {
    pending: "bg-zinc-700 border-zinc-600",
    running: "bg-amber-500/20 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]",
    done: "bg-emerald-500/20 border-emerald-500",
    error: "bg-red-500/20 border-red-500",
    skipped: "bg-zinc-800 border-zinc-700",
    awaiting_approval: "bg-blue-500/20 border-blue-500",
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-amber-500" />
          <span className="font-semibold tracking-tight">CollabForge</span>
          <span className="text-xs text-zinc-500 hidden sm:inline">Real-Time Collaborative AI Agent IDE</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-md border border-zinc-800 hover:border-zinc-700">
            <Users className="w-3.5 h-3.5" /> 2 online
          </button>
          <button className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-md border border-zinc-800 hover:border-zinc-700">
            <Activity className="w-3.5 h-3.5" /> Metrics
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr_380px] gap-4 p-4 overflow-hidden">
        <aside className="hidden lg:flex flex-col gap-4 overflow-hidden">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Agent DAG</h3>
            <div className="flex flex-col gap-2">
              {nodes.map((node, i) => {
                const status = getNodeStatus(node.id);
                return (
                  <motion.div
                    key={node.id}
                    className={`rounded-lg border p-3 ${statusColor[status || "pending"]}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{node.name}</span>
                      <span className="text-[10px] text-zinc-400 uppercase">{status || "pending"}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 line-clamp-2">{node.prompt}</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Metrics</h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Tokens" value="0" />
              <Metric label="Latency" value="0ms" />
              <Metric label="Tool Calls" value="0" />
              <Metric label="Agents" value={`${nodes.length}`} />
            </div>
          </div>
        </aside>

        <section className="flex flex-col gap-4 overflow-hidden">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Prompt</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to build..."
              className="flex-1 bg-transparent text-sm resize-none outline-none text-zinc-200 placeholder:text-zinc-600 font-mono"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleRun}
                disabled={isRunning || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-medium text-sm hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" /> Run Pipeline
              </button>
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-sm hover:border-zinc-600">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        </section>

        <aside className="hidden lg:flex flex-col gap-4 overflow-hidden">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Live Event Stream</h3>
            <div ref={eventLogRef} className="flex-1 overflow-y-auto font-mono text-xs space-y-1 pr-1">
              <AnimatePresence>
                {activeRun?.events.map((event, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-zinc-400"
                  >
                    <span className="text-zinc-600">[{new Date((event as AgentEvent).timestamp).toLocaleTimeString()}]</span>{" "}
                    <span className="text-amber-400">{(event as AgentEvent).type}</span>
                    {(event as AgentEvent).type === "log" && (
                      <span className="text-zinc-300"> {(event as AgentEvent).message}</span>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {(!activeRun || activeRun.events.length === 0) && (
                <p className="text-zinc-600 italic">Events will appear here when you run a pipeline...</p>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 p-2">
      <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
      <div className="text-sm font-semibold text-amber-400">{value}</div>
    </div>
  );
}
