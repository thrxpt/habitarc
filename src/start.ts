import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { authenticationErrorResponse } from "./server/auth-error";

const requestSecurity = createMiddleware().server(async ({ request, next }) => {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const [{ assertSameOrigin }, { readAuthConfig }] = await Promise.all([
      import("./server/auth"),
      import("./server/runtime"),
    ]);
    try {
      assertSameOrigin(request.headers, readAuthConfig().baseURL);
    } catch (error) {
      return authenticationErrorResponse(error);
    }
  }
  return await next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestSecurity],
}));
