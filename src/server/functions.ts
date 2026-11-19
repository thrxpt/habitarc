import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseStatus,
} from "@tanstack/react-start/server";

import type { EntryMutationFailure } from "../entries";
import type { GoalRevisionResponse, HabitCreationResponse } from "../habits";
import { isRole } from "../identity";
import type { Identity } from "../identity";
import { validateTemplateListQuery } from "../templates";
import { AuthError, authenticationError } from "./auth-error";
import { EntryError } from "./entries";
import { HabitError } from "./habits";
import {
  getAuthentication,
  getEntryService,
  getHabitService,
  getTemplateService,
  readTrackingWorkspace,
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
        error instanceof HabitError ||
        error instanceof EntryError
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

const authorizeParticipant = async () =>
  await getAuthentication().authorizeWorkspace(
    getRequestHeaders(),
    "participant"
  );

const trackingWriteFailure = <Fields>(
  error: Error & { status: number; fieldErrors: Fields }
) => {
  const { status, message, fieldErrors } = error;
  if (status !== 400 && status !== 404 && status !== 409) {
    throw error;
  }
  // Expected validation and conflict data must survive TanStack's Error serialization.
  setResponseStatus(status);
  const kind = status === 400 ? "invalid" : "conflict";
  return { kind, message, fieldErrors } as const;
};

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
    const actor = await authorizeParticipant();
    return await getHabitService().listHabits(actor);
  });

export const createHabit = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<HabitCreationResponse> => {
    const actor = await authorizeParticipant();
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

export const reviseGoal = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }): Promise<GoalRevisionResponse> => {
    const actor = await authorizeParticipant();
    try {
      return await getHabitService().reviseGoal(actor, data);
    } catch (error) {
      if (error instanceof HabitError) {
        return trackingWriteFailure(error);
      }
      throw error;
    }
  });

export const getToday = createServerFn({ method: "GET" })
  .middleware([applicationErrors])
  .handler(async () => {
    const actor = await authorizeParticipant();
    return await getEntryService().getToday(actor);
  });

export const getTrackingWorkspace = createServerFn({ method: "GET" })
  .middleware([applicationErrors])
  .handler(async () => {
    const actor = await authorizeParticipant();
    return await readTrackingWorkspace(actor);
  });

export const getHistory = createServerFn({ method: "GET" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    try {
      const actor = await authorizeParticipant();
      const history = await getEntryService().getHistory(actor, data);
      return { history, viewer: { id: actor.id, name: actor.name } };
    } catch (error) {
      if (
        (error instanceof AuthError &&
          (error.status === 401 || error.status === 403)) ||
        (error instanceof EntryError && error.status === 404)
      ) {
        setResponseStatus(error.status);
        return null;
      }
      throw error;
    }
  });

const entryWrite = async <Result>(
  write: (actor: Identity) => Promise<Result>
): Promise<Result | EntryMutationFailure> => {
  const actor = await authorizeParticipant();
  try {
    return await write(actor);
  } catch (error) {
    if (error instanceof EntryError) {
      return trackingWriteFailure(error);
    }
    throw error;
  }
};

export const createEntry = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(
    async ({ data }) =>
      await entryWrite(
        async (actor) => await getEntryService().createEntry(actor, data)
      )
  );

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(
    async ({ data }) =>
      await entryWrite(
        async (actor) => await getEntryService().updateEntry(actor, data)
      )
  );

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([applicationErrors])
  .validator((input: unknown) => input)
  .handler(
    async ({ data }) =>
      await entryWrite(
        async (actor) => await getEntryService().deleteEntry(actor, data)
      )
  );
