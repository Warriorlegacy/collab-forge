import React from "react";
import ReactDOM from "react-dom/client";
import { Router, Route, RootRoute, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AgentIDE from "./components/AgentIDE";

const rootRoute = new RootRoute({
  component: () => (
    <QueryClientProvider client={new QueryClient()}>
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <Outlet />
      </div>
    </QueryClientProvider>
  ),
});

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AgentIDE,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = new Router({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router provider={router} />
  </React.StrictMode>
);
