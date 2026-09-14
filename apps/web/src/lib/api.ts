const API_BASE = "http://localhost:8787";

export async function createRun(userId: string, prompt: string): Promise<{ id: string; trace_id: string }> {
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, prompt }),
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
