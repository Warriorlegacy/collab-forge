import { create } from "zustand";
import type { RunState, AgentEvent, AgentNode, AgentId, AgentStatus } from "@collab-forge/shared";

export interface AgentRunStore {
  runs: Map<string, RunState>;
  activeRunId: string | null;
  presence: Map<string, { userId: string; cursor: { x: number; y: number } | null }>;
  setActiveRun: (runId: string | null) => void;
  updateRunState: (runId: string, state: Partial<RunState>) => void;
  appendEvent: (runId: string, event: AgentEvent) => void;
  createRun: (userId: string, prompt: string, nodes: AgentNode[]) => string;
  updateAgentStatus: (runId: string, agentId: AgentId, status: AgentStatus) => void;
  setPresence: (userId: string, cursor: { x: number; y: number } | null) => void;
}

export const useAgentRunStore = create<AgentRunStore>((set, get) => ({
  runs: new Map(),
  activeRunId: null,
  presence: new Map(),

  setActiveRun: (runId) => set({ activeRunId: runId }),

  updateRunState: (runId, state) =>
    set((s) => {
      const runs = new Map(s.runs);
      const existing = runs.get(runId);
      if (existing) runs.set(runId, { ...existing, ...state, updatedAt: new Date().toISOString() });
      return { runs };
    }),

  appendEvent: (runId, event) =>
    set((s) => {
      const runs = new Map(s.runs);
      const existing = runs.get(runId);
      if (existing) {
        runs.set(runId, {
          ...existing,
          events: [...existing.events, event],
        });
      }
      return { runs };
    }),

  createRun: (userId, prompt, nodes) => {
    const runId = crypto.randomUUID();
    const run: RunState = {
      runId,
      userId,
      prompt,
      status: "queued",
      nodes,
      events: [],
      artifacts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentAgentId: null,
      metrics: { totalTokens: 0, totalLatencyMs: 0, toolCalls: 0 },
    };
    set((s) => {
      const runs = new Map(s.runs);
      runs.set(runId, run);
      return { runs, activeRunId: runId };
    });
    return runId;
  },

  updateAgentStatus: (runId, agentId, status) =>
    set((s) => {
      const runs = new Map(s.runs);
      const existing = runs.get(runId);
      if (existing) {
        runs.set(runId, {
          ...existing,
          currentAgentId: agentId,
          updatedAt: new Date().toISOString(),
        });
      }
      return { runs };
    }),

  setPresence: (userId, cursor) =>
    set((s) => {
      const presence = new Map(s.presence);
      presence.set(userId, { userId, cursor });
      return { presence };
    }),
}));
