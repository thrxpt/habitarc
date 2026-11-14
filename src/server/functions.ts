import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import type { HabitCreationResponse } from "../habits";
import { isRole } from "../identity";
import { validateTemplateListQuery } from "../templates";
import { AuthError, authenticationError } from "./auth-error";
import { HabitError } from "./habits";
import {
  getAuthentication,
  getHabitService,
  getTemplateService,
} from "./runtime";
import { TemplateError } from "./templates";

const serverErrors = (mapUnexpected: (error: unknown) => AuthError) =>
  createMiddleware({ type: "function" }).server(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof TemplateError ||
        error instanceof HabitError
      ) {
        setResponseStatus(error.status);
        throw error;
      }
      const failure = mapUnexpected(error);
      setResponseStatus(failure.status);
      throw failure;
    }
  });

const authenticationErrors = serverErrors(authenticationError);
const applicationErrors = serverErrors(
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
  .middleware([applicationErrors])
  .validator((input: unknown) => {
    const validation = validateTemplateListQuery(input);
    if (!validation.ok) {
      throw new TemplateError(400, validation.message);
    }
    return validation.value;
  })
  .handler(async ({ data }) => {
    const actor = await getAuthentication().identity(getRequestHeaders());
    if (!actor) {
      throw new AuthError(401, "Sign in required");
    }
    return await getTemplateService().listTemplates(actor, data);
  });

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const actor = await getAuthentication().authorizeWorkspace(
      getRequestHeaders(),
      "program-manager"
    );
    return await getTemplateService().createTemplate(actor, data);
  });

export const listHabits = createServerFn({ method: "GET" })
  .middleware([applicationErrors])
  .handler(async () => {
    const actor = await getAuthentication().authorizeWorkspace(
      getRequestHeaders(),
      "participant"
    );
    return await getHabitService().listHabits(actor);
  });

export const createHabit = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<HabitCreationResponse> => {
    const actor = await getAuthentication().authorizeWorkspace(
      getRequestHeaders(),
      "participant"
    );
    try {
      return await getHabitService().createHabit(actor, data);
    } catch (error) {
      if (error instanceof HabitError && error.status === 400) {
        // Expected validation data must survive TanStack's Error serialization.
        setResponseStatus(error.status);
        return {
          kind: "invalid",
          message: error.message,
          fieldErrors: error.fieldErrors,
        };
      }
      throw error;
    }
  });
