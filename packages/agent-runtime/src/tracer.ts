import type { AgentEvent } from "@collab-forge/shared";

export class EventTracer {
  private events: AgentEvent[] = [];
  private listeners: Set<(events: AgentEvent[]) => void> = new Set();

  emit(event: AgentEvent) {
    this.events.push(event);
    for (const listener of this.listeners) listener(this.events);
  }

  subscribe(listener: (events: AgentEvent[]) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEvents(): AgentEvent[] {
    return [...this.events];
  }

  getEventsForAgent(agentId: string): AgentEvent[] {
    return this.events.filter((e) => (e as { agentId?: string }).agentId === agentId);
  }

  toJSON(): string {
    return JSON.stringify(this.events, null, 2);
  }

  clear() {
    this.events = [];
  }
}

export class StructuredLogger {
  private prefix: string;

  constructor(prefix: string = "") {
    this.prefix = prefix;
  }

  info(message: string, meta?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: "info", prefix: this.prefix, message, ...meta, ts: new Date().toISOString() }));
  }

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: "warn", prefix: this.prefix, message, ...meta, ts: new Date().toISOString() }));
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: "error", prefix: this.prefix, message, error: error?.message, stack: error?.stack, ...meta, ts: new Date().toISOString() }));
  }
}
