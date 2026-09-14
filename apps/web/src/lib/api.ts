const API_BASE = "http://localhost:8787";

export async function createRun(userId: string, prompt: string, nodes: AgentNode[]): Promise<{ id: string; trace_id: string; websocketUrl: string }> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, prompt, nodes }),
  });
  if (!res.ok) throw new Error("Failed to create run");
  return res.json();
}

export async function getRun(runId: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  if (!res.ok) throw new Error("Failed to get run");
  return res.json();
}

export async function cancelRun(runId: string): Promise<{ cancelled: boolean }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to cancel run");
  return res.json();
}

export function connectWebSocket(runId: string, onEvent: (event: AgentEvent) => void): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/runs/${runId}`;
  const ws = new WebSocket(wsUrl);

  ws.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "event" && msg.event) onEvent(msg.event);
    } catch {
      // Ignore malformed messages
    }
  });

  ws.addEventListener("close", () => {
    console.log(`WebSocket closed for run ${runId}`);
  });

  ws.addEventListener("error", (err) => {
    console.error(`WebSocket error for run ${runId}:`, err);
  });

  return ws;
}
