import { createFileRoute } from "@tanstack/react-router";

import { getAuthentication } from "../server/runtime";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => await getAuthentication().handle(request),
      POST: async ({ request }) => await getAuthentication().handle(request),
    },
  },
});
