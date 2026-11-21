import { randomUUID } from "node:crypto";

import { and, asc, eq, exists, isNull, sql } from "drizzle-orm";

import type { Identity } from "../identity";
import { isRole } from "../identity";
import {
  isMeasurementUnit,
  parseTemplateReference,
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
import type { Database, Transaction } from "./database";
import { activityTemplate, habit } from "./schema";

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

export const lockActivityTemplate = async (
  transaction: Transaction,
  templateId: string
) => {
  const [row] = await transaction
    .select()
    .from(activityTemplate)
    .where(eq(activityTemplate.id, templateId))
    .for("update");
  return row;
};

const templateHabits = (
  database: Database | Transaction,
  templateId: string | typeof activityTemplate.id
) =>
  database
    .select({ id: habit.id })
    .from(habit)
    .where(eq(habit.templateId, templateId));

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
    const isManager = actor.role === "program-manager";
    const whereClause = cursor
      ? and(
          isNull(activityTemplate.archivedAt),
          sql`(${activityTemplate.name}, ${activityTemplate.createdAt}, ${activityTemplate.id}) > (${cursor.name}, ${cursor.createdAt}::timestamptz, ${cursor.id})`
        )
      : isNull(activityTemplate.archivedAt);
    const rows = await database
      .select({
        template: activityTemplate,
        measurementLocked: isManager
          ? exists(templateHabits(database, activityTemplate.id)).mapWith(
              Boolean
            )
          : sql<boolean>`false`,
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
      items: pageRows.map((row) => ({
        ...toActivityTemplate(row.template),
        ...(isManager ? { measurementLocked: row.measurementLocked } : {}),
      })),
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

  const maintainTemplate = async (
    actor: Identity,
    input: unknown,
    operation: "update" | "archive"
  ): Promise<ActivityTemplate> => {
    if (actor.role !== "program-manager") {
      throw new AuthError(403, "Forbidden");
    }
    const reference = parseTemplateReference(input);
    if (reference === undefined) {
      throw new TemplateError(
        400,
        "Reload the Activity Template and try again."
      );
    }
    const edit =
      operation === "update" ? validateActivityTemplateInput(input) : null;
    if (edit !== null && !edit.ok) {
      throw new TemplateError(400, edit.message, edit.fieldErrors);
    }

    return await database.transaction(async (transaction) => {
      const row = await lockActivityTemplate(transaction, reference.templateId);
      if (row === undefined || row.archivedAt !== null) {
        throw new TemplateError(
          409,
          "This Activity Template is no longer published. Reload the library."
        );
      }
      if (row.version !== reference.templateVersion) {
        throw new TemplateError(
          409,
          "This Activity Template changed. Reload the library before trying again."
        );
      }
      const draft = edit?.value;
      const measurementChanged =
        draft !== undefined &&
        (draft.unit !== row.unit ||
          draft.entryMinimum !== row.entryMinimum ||
          draft.entryMaximum !== row.entryMaximum);
      if (measurementChanged) {
        // Read after locking so this check sees any first Habit that just committed.
        const [usage] = await templateHabits(transaction, row.id).limit(1);
        if (usage !== undefined) {
          throw new TemplateError(
            409,
            "This Activity Template is in use. Its unit and entry bounds are fixed. Reload to edit its name or description."
          );
        }
      }
      const timestamp = sql`statement_timestamp()`;
      const [saved] = await transaction
        .update(activityTemplate)
        .set({
          ...(draft ?? { archivedAt: timestamp }),
          updatedAt: timestamp,
          version: row.version + 1,
        })
        .where(eq(activityTemplate.id, row.id))
        .returning();
      if (saved === undefined) {
        throw new Error(
          "Activity Template maintenance did not return a record."
        );
      }
      return toActivityTemplate(saved);
    });
  };

  return {
    listTemplates,
    createTemplate,
    updateTemplate: async (actor: Identity, input: unknown) =>
      await maintainTemplate(actor, input, "update"),
    archiveTemplate: async (actor: Identity, input: unknown) =>
      await maintainTemplate(actor, input, "archive"),
  };
};
