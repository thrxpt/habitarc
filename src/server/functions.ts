import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import { isRole } from "../identity";
import { AuthError } from "./auth";
import { getAuthentication } from "./runtime";

const authenticationErrors = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof AuthError) {
        setResponseStatus(error.status);
        throw error;
      }
      setResponseStatus(503);
      throw new AuthError(503, "Authentication temporarily unavailable.");
    }
  }
);

export const getIdentity = createServerFn({ method: "GET" })
  .middleware([authenticationErrors])
  .handler(async () => await getAuthentication().identity(getRequestHeaders()));

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authenticationErrors])
  .validator((role: unknown) => {
    if (!isRole(role)) {
      throw new AuthError(400, "Invalid workspace.");
    }
    return role;
  })
  .handler(
    async ({ data }) =>
      await getAuthentication().workspace(getRequestHeaders(), data)
  );
