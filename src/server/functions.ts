import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import { isRole } from "../identity";
import { AuthError, authenticationError } from "./auth-error";
import { getAuthentication, getTemplateService } from "./runtime";
import { TemplateError } from "./templates";

const serverErrors = (mapUnexpected: (error: unknown) => AuthError) =>
  createMiddleware({ type: "function" }).server(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof AuthError || error instanceof TemplateError) {
        setResponseStatus(error.status);
        throw error;
      }
      const failure = mapUnexpected(error);
      setResponseStatus(failure.status);
      throw failure;
    }
  });

const authenticationErrors = serverErrors(authenticationError);
const templateErrors = serverErrors(
  () => new AuthError(503, "Service temporarily unavailable")
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

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([templateErrors])
  .handler(async () => {
    const actor = await getAuthentication().identity(getRequestHeaders());
    if (!actor) {
      throw new AuthError(401, "Sign in required");
    }
    return await getTemplateService().listTemplates(actor);
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([templateErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const actor = await getAuthentication().authorizeWorkspace(
      getRequestHeaders(),
      "program-manager"
    );
    return await getTemplateService().createTemplate(actor, data);
  });
