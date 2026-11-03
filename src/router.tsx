import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Builds the router with a shared query client and scroll restoration disabled so every load opens fresh.
export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Every page load opens on Home, so a saved scroll position is never restored.
    scrollRestoration: false,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
