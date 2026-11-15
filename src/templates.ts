export const MEASUREMENT_UNITS = ["minutes", "counts"] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_CEILINGS: Record<MeasurementUnit, number> = {
  minutes: 1440,
  counts: 1_000_000,
};

export const TEMPLATE_NAME_MAX_LENGTH = 120;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;
export const DEFAULT_TEMPLATE_PAGE_SIZE = 50;
export const MAX_TEMPLATE_PAGE_SIZE = 200;

export interface TemplateCursor {
  name: string;
  createdAt: string;
  id: string;
}

export interface TemplateListQuery {
  cursor?: TemplateCursor | null;
  limit?: number;
}

export interface ActivityTemplatePage {
  items: ActivityTemplate[];
  nextCursor: TemplateCursor | null;
}

export interface ActivityTemplate {
  id: string;
  name: string;
  description: string;
  unit: MeasurementUnit;
  entryMinimum: number;
  entryMaximum: number;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTemplateDraft {
  name: string;
  description: string;
  unit: MeasurementUnit;
  entryMinimum: number;
  entryMaximum: number;
}

export type TemplateField = keyof ActivityTemplateDraft;

export type TemplateFieldErrors = Partial<Record<TemplateField, string>>;

export type TemplateValidationResult =
  | { ok: true; value: ActivityTemplateDraft }
  | { ok: false; message: string; fieldErrors: TemplateFieldErrors };

export const isMeasurementUnit = (value: unknown): value is MeasurementUnit =>
  value === "minutes" || value === "counts";

export const formatTemplateRange = (
  template: Pick<ActivityTemplate, "entryMinimum" | "entryMaximum" | "unit">
): string => {
  const min = template.entryMinimum.toLocaleString("en-US");
  const max = template.entryMaximum.toLocaleString("en-US");
  return `${min}–${max} ${template.unit}`;
};

const tooLongMessage = (label: string, max: number) =>
  `${label} must be ${max} characters or fewer.`;

const ceilingExceededMessage = (
  bound: "Minimum" | "Maximum",
  ceiling: number,
  unit: MeasurementUnit
) => {
  const limit = ceiling.toLocaleString("en-US");
  return `${bound} cannot exceed ${limit} ${unit}.`;
};

const WHOLE_NUMBER_PATTERN = /^\d+$/u;

export const parseWholeNumberInput = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const isWholePositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const validateTemplateName = (
  raw: unknown,
  fieldErrors: TemplateFieldErrors
): string | undefined => {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) {
    fieldErrors.name = "Enter a template name.";
    return undefined;
  }
  if (trimmed.length > TEMPLATE_NAME_MAX_LENGTH) {
    fieldErrors.name = tooLongMessage(
      "Template name",
      TEMPLATE_NAME_MAX_LENGTH
    );
    return undefined;
  }
  return trimmed;
};

const validateTemplateDescription = (
  raw: unknown,
  fieldErrors: TemplateFieldErrors
): string => {
  if (raw !== undefined && typeof raw !== "string") {
    fieldErrors.description = "Description must be text.";
    return "";
  }
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length > TEMPLATE_DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description = tooLongMessage(
      "Description",
      TEMPLATE_DESCRIPTION_MAX_LENGTH
    );
  }
  return trimmed;
};

const validateTemplateBounds = (
  rawMin: unknown,
  rawMax: unknown,
  unit: MeasurementUnit | undefined,
  fieldErrors: TemplateFieldErrors
): { entryMinimum: number; entryMaximum: number } | undefined => {
  const entryMinimum = isWholePositiveNumber(rawMin) ? rawMin : undefined;
  if (entryMinimum === undefined) {
    fieldErrors.entryMinimum = "Minimum must be a whole number of at least 1.";
  }

  const entryMaximum = isWholePositiveNumber(rawMax) ? rawMax : undefined;
  if (entryMaximum === undefined) {
    fieldErrors.entryMaximum = "Maximum must be a whole number of at least 1.";
  }

  if (unit) {
    const ceiling = MEASUREMENT_CEILINGS[unit];
    if (entryMinimum !== undefined && entryMinimum > ceiling) {
      fieldErrors.entryMinimum = ceilingExceededMessage(
        "Minimum",
        ceiling,
        unit
      );
    }
    if (entryMaximum !== undefined && entryMaximum > ceiling) {
      fieldErrors.entryMaximum = ceilingExceededMessage(
        "Maximum",
        ceiling,
        unit
      );
    }
  }

  if (
    entryMinimum !== undefined &&
    entryMaximum !== undefined &&
    entryMinimum > entryMaximum
  ) {
    fieldErrors.entryMaximum =
      "Maximum must be greater than or equal to minimum.";
  }

  if (
    entryMinimum === undefined ||
    entryMaximum === undefined ||
    fieldErrors.entryMinimum !== undefined ||
    fieldErrors.entryMaximum !== undefined
  ) {
    return undefined;
  }
  return { entryMinimum, entryMaximum };
};

export const validateActivityTemplateInput = (
  input: unknown
): TemplateValidationResult => {
  if (!isRecord(input)) {
    return {
      ok: false,
      message: "Enter the Activity Template details and try again.",
      fieldErrors: {},
    };
  }

  const fieldErrors: TemplateFieldErrors = {};
  const name = validateTemplateName(input.name, fieldErrors);
  const description = validateTemplateDescription(
    input.description,
    fieldErrors
  );
  const unit = isMeasurementUnit(input.unit) ? input.unit : undefined;
  if (!unit) {
    fieldErrors.unit = "Choose minutes or counts as the Measurement Unit.";
  }
  const bounds = validateTemplateBounds(
    input.entryMinimum,
    input.entryMaximum,
    unit,
    fieldErrors
  );

  if (
    Object.keys(fieldErrors).length > 0 ||
    name === undefined ||
    !unit ||
    !bounds
  ) {
    return {
      ok: false,
      message: "Check the highlighted fields and try again.",
      fieldErrors,
    };
  }

  return {
    ok: true,
    value: {
      name,
      description,
      unit,
      entryMinimum: bounds.entryMinimum,
      entryMaximum: bounds.entryMaximum,
    },
  };
};

const UTC_ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u;

const parseTemplateCursor = (raw: unknown): TemplateCursor | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { name, createdAt, id } = raw;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > TEMPLATE_NAME_MAX_LENGTH
  ) {
    return undefined;
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 128) {
    return undefined;
  }
  if (
    typeof createdAt !== "string" ||
    !UTC_ISO_TIMESTAMP_PATTERN.test(createdAt) ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return undefined;
  }
  // Date.parse normalizes impossible calendar dates; compare the UTC components
  // without discarding the original cursor's PostgreSQL microsecond precision.
  if (
    new Date(createdAt).toISOString().slice(0, 19) !== createdAt.slice(0, 19)
  ) {
    return undefined;
  }
  return { name, createdAt, id };
};

export type TemplateListQueryResult =
  | { ok: true; value: { cursor?: TemplateCursor; limit: number } }
  | { ok: false; message: string };

export const validateTemplateListQuery = (
  input: unknown
): TemplateListQueryResult => {
  if (input === undefined || input === null) {
    return { ok: true, value: { limit: DEFAULT_TEMPLATE_PAGE_SIZE } };
  }
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid template list request." };
  }

  let limit = DEFAULT_TEMPLATE_PAGE_SIZE;
  if (input.limit !== undefined) {
    if (!isWholePositiveNumber(input.limit)) {
      return {
        ok: false,
        message: "Template page size must be a whole number of at least 1.",
      };
    }
    limit = Math.min(input.limit, MAX_TEMPLATE_PAGE_SIZE);
  }

  if (input.cursor === undefined || input.cursor === null) {
    return { ok: true, value: { limit } };
  }

  const cursor = parseTemplateCursor(input.cursor);
  if (!cursor) {
    return { ok: false, message: "Invalid template pagination cursor." };
  }

  return { ok: true, value: { cursor, limit } };
};
