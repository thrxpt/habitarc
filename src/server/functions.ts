import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import { isRole } from "../identity";
import { AuthError, authenticationError } from "./auth-error";
import { getAuthentication } from "./runtime";

const authenticationErrors = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      const failure = authenticationError(error);
      setResponseStatus(failure.status);
      throw failure;
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
      await getAuthentication().authorizeWorkspace(getRequestHeaders(), data)
  );
