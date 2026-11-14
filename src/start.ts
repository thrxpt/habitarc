import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const requestSecurity = createMiddleware().server(async ({ request, next }) => {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const [{ assertSameOrigin, AuthError }, { readAuthConfig }] =
      await Promise.all([import("./server/auth"), import("./server/runtime")]);
    try {
      assertSameOrigin(request.headers, readAuthConfig().baseURL);
    } catch (error) {
      if (error instanceof AuthError) {
        return new Response(error.message, { status: error.status });
      }
      return new Response("Service configuration unavailable", { status: 503 });
    }
  }
  return await next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestSecurity],
}));
