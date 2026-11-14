import { randomUUID } from "node:crypto";

import { asc, isNull } from "drizzle-orm";

import type { Identity } from "../identity";
import { isRole } from "../identity";
import { isMeasurementUnit, validateActivityTemplateInput } from "../templates";
import type { ActivityTemplate, TemplateFieldErrors } from "../templates";
import { AuthError } from "./auth-error";
import type { Database } from "./database";
import { activityTemplate } from "./schema";

export class TemplateError extends Error {
  readonly status: number;
  readonly fieldErrors: TemplateFieldErrors;

  constructor(
    status: number,
    message: string,
    fieldErrors: TemplateFieldErrors = {}
  ) {
    super(message);
    this.name = "TemplateError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const toActivityTemplate = (
  row: typeof activityTemplate.$inferSelect
): ActivityTemplate => {
  if (!isMeasurementUnit(row.unit)) {
    throw new Error("Stored Activity Template has an unsupported unit.");
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    entryMinimum: row.entryMinimum,
    entryMaximum: row.entryMaximum,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

const MAX_LIST_TEMPLATES_LIMIT = 200;

export const createTemplateService = (database: Database) => {
  const listTemplates = async (
    actor: Identity,
    limit = MAX_LIST_TEMPLATES_LIMIT
  ): Promise<ActivityTemplate[]> => {
    if (!isRole(actor.role)) {
      throw new AuthError(403, "Forbidden");
    }
    const boundedLimit = Math.min(
      Math.max(1, Math.trunc(limit)),
      MAX_LIST_TEMPLATES_LIMIT
    );
    const rows = await database
      .select()
      .from(activityTemplate)
      .where(isNull(activityTemplate.archivedAt))
      .orderBy(
        asc(activityTemplate.name),
        asc(activityTemplate.createdAt),
        asc(activityTemplate.id)
      )
      .limit(boundedLimit);
    return rows.map(toActivityTemplate);
  };

  const createTemplate = async (
    actor: Identity,
    input: unknown
  ): Promise<ActivityTemplate> => {
    if (actor.role !== "program-manager") {
      throw new AuthError(403, "Forbidden");
    }
    const validation = validateActivityTemplateInput(input);
    if (!validation.ok) {
      throw new TemplateError(400, validation.message, validation.fieldErrors);
    }
    const rows = await database
      .insert(activityTemplate)
      .values({
        id: randomUUID(),
        name: validation.value.name,
        description: validation.value.description,
        unit: validation.value.unit,
        entryMinimum: validation.value.entryMinimum,
        entryMaximum: validation.value.entryMaximum,
      })
      .returning();
    const created = rows.at(0);
    if (created === undefined) {
      throw new Error("Activity Template creation did not return a record.");
    }
    return toActivityTemplate(created);
  };

  return { listTemplates, createTemplate };
};
