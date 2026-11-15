import { randomUUID } from "node:crypto";

import { and, asc, isNull, sql } from "drizzle-orm";

import type { Identity } from "../identity";
import { isRole } from "../identity";
import {
  isMeasurementUnit,
  validateActivityTemplateInput,
  validateTemplateListQuery,
} from "../templates";
import type {
  ActivityTemplate,
  ActivityTemplatePage,
  TemplateFieldErrors,
  TemplateListQuery,
} from "../templates";
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

export const toActivityTemplate = (
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

export const createTemplateService = (database: Database) => {
  const listTemplates = async (
    actor: Identity,
    query: TemplateListQuery = {}
  ): Promise<ActivityTemplatePage> => {
    if (!isRole(actor.role)) {
      throw new AuthError(403, "Forbidden");
    }
    const validation = validateTemplateListQuery(query);
    if (!validation.ok) {
      throw new TemplateError(400, validation.message);
    }
    const { cursor, limit } = validation.value;
    const whereClause = cursor
      ? and(
          isNull(activityTemplate.archivedAt),
          sql`(${activityTemplate.name}, ${activityTemplate.createdAt}, ${activityTemplate.id}) > (${cursor.name}, ${cursor.createdAt}::timestamptz, ${cursor.id})`
        )
      : isNull(activityTemplate.archivedAt);
    const rows = await database
      .select({
        template: activityTemplate,
        cursorCreatedAt: sql<string>`to_char(${activityTemplate.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(activityTemplate)
      .where(whereClause)
      .orderBy(
        asc(activityTemplate.name),
        asc(activityTemplate.createdAt),
        asc(activityTemplate.id)
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows.at(-1);
    return {
      items: pageRows.map((row) => toActivityTemplate(row.template)),
      nextCursor:
        hasMore && lastRow !== undefined
          ? {
              name: lastRow.template.name,
              createdAt: lastRow.cursorCreatedAt,
              id: lastRow.template.id,
            }
          : null,
    };
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
