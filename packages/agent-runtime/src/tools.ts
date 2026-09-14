import type { ToolDefinition, ToolContext, ToolResult } from "@collab-forge/shared";

const sandboxContexts = new WeakMap<object, { timeout: number; memory: number }>();

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private callCounts = new Map<string, { count: number; errors: number; lastCalled: number }>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: ToolDefinition[]) {
    for (const tool of tools) this.register(tool);
  }

  async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: null, error: `Unknown tool: ${name}`, durationMs: 0 };
    }

    const start = Date.now();
    const stats = this.callCounts.get(name) ?? { count: 0, errors: 0, lastCalled: 0 };
    stats.count++;
    stats.lastCalled = start;
    this.callCounts.set(name, stats);

    try {
      return await tool.execute(input, ctx);
    } catch (err) {
      stats.errors++;
      this.callCounts.set(name, stats);
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getStats(name: string) {
    return this.callCounts.get(name);
  }
}

export class CodeInterpreterTool implements ToolDefinition {
  name = "code_interpreter";
  description = "Execute JavaScript/TypeScript code in a sandboxed Web Worker. Use for data processing, calculations, or prototyping.";
  parameters = {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript/TypeScript code to execute" },
      timeout: { type: "number", description: "Max execution time in ms (default 5000)" },
    },
    required: ["code"],
  };

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { code, timeout = 5000 } = input as { code: string; timeout?: number };
    const start = Date.now();

    try {
      const result = await this.runInSandbox(code, timeout);
      return { success: true, output: result, durationMs: Date.now() - start };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private async runInSandbox(code: string, timeout: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        URL.createObjectURL(
          new Blob([`
            self.onmessage = (e) => {
              const { code, timeout } = e.data;
              try {
                const result = new Function('console', 'Math', 'JSON', 'Date', code)(
                  { log: (...args) => self.postMessage({ type: 'log', args }) },
                  Math,
                  JSON,
                  Date
                );
                self.postMessage({ type: 'result', value: result });
              } catch (err) {
                self.postMessage({ type: 'error', message: err.message });
              }
            };
          `], { type: "application/javascript" })
        )
      );

      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error(`Code execution timed out after ${timeout}ms`));
      }, timeout);

      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        if (e.data.type === "error") reject(new Error(e.data.message));
        else resolve(e.data.value);
      };

      worker.onerror = (err) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(err.message));
      };

      worker.postMessage({ code, timeout });
    });
  }
}

export class WebSearchTool implements ToolDefinition {
  name = "web_search";
  description = "Search the web for current information. Returns top results with titles, URLs, and snippets.";
  parameters = {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query string" },
      maxResults: { type: "number", description: "Max results to return (default 5)" },
    },
    required: ["query"],
  };

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { query, maxResults = 5 } = input as { query: string; maxResults?: number };
    const start = Date.now();

    try {
      const results = await this.performSearch(query, maxResults);
      return { success: true, output: results, durationMs: Date.now() - start };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  private async performSearch(query: string, maxResults: number): Promise<unknown> {
    const resp = await fetch(`https://api.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const text = await resp.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = regex.exec(text)) && results.length < maxResults) {
      results.push({
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        url: match[1],
        snippet: match[3].replace(/<[^>]+>/g, "").trim(),
      });
    }
    return { query, results };
  }
}
