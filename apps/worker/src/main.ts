import app from "./routes";
import { OrchestratorEngine } from "./engine";
import type { Env } from "./engine";

const engine = new OrchestratorEngine(globalThis as unknown as Env);

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws/runs/")) {
      const runId = url.pathname.replace("/ws/runs/", "");
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      (client as unknown as WebSocket).accept();

      engine.registerWebSocket(runId, client as unknown as WebSocket);

      (client as unknown as WebSocket).addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "cancel") engine.cancelRun(runId);
        } catch {
          // Ignore malformed messages
        }
      });

      (client as unknown as WebSocket).addEventListener("close", () => {
        engine.registerWebSocket(runId, client as unknown as WebSocket);
      });

      return new Response(null, { status: 101, webSocket: server as unknown as WebSocket });
    }

    return app.fetch(request, env, ctx);
  },
};
