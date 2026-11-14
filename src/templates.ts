export const MEASUREMENT_UNITS = ["minutes", "counts"] as const;

export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_CEILINGS: Record<MeasurementUnit, number> = {
  minutes: 1440,
  counts: 1_000_000,
};

export const TEMPLATE_NAME_MAX_LENGTH = 120;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;

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

export type TemplateField =
  | "name"
  | "description"
  | "unit"
  | "entryMinimum"
  | "entryMaximum";

export type TemplateFieldErrors = Partial<Record<TemplateField, string>>;

export type TemplateValidationResult =
  | { ok: true; value: ActivityTemplateDraft }
  | { ok: false; message: string; fieldErrors: TemplateFieldErrors };

export const isMeasurementUnit = (value: unknown): value is MeasurementUnit =>
  value === "minutes" || value === "counts";

export const formatTemplateRange = (
  template: Pick<ActivityTemplate, "entryMinimum" | "entryMaximum" | "unit">
): string =>
  `${template.entryMinimum.toLocaleString("en-US")}–${template.entryMaximum.toLocaleString("en-US")} ${template.unit}`;

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
    fieldErrors.name = `Template name must be ${TEMPLATE_NAME_MAX_LENGTH} characters or fewer.`;
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
    fieldErrors.description = `Description must be ${TEMPLATE_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
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
    fieldErrors.entryMinimum =
      "Minimum must be a whole number of at least 1.";
  }

  const entryMaximum = isWholePositiveNumber(rawMax) ? rawMax : undefined;
  if (entryMaximum === undefined) {
    fieldErrors.entryMaximum =
      "Maximum must be a whole number of at least 1.";
  }

  if (unit) {
    const ceiling = MEASUREMENT_CEILINGS[unit];
    if (entryMinimum !== undefined && entryMinimum > ceiling) {
      fieldErrors.entryMinimum = `Minimum cannot exceed ${ceiling.toLocaleString("en-US")} ${unit}.`;
    }
    if (entryMaximum !== undefined && entryMaximum > ceiling) {
      fieldErrors.entryMaximum = `Maximum cannot exceed ${ceiling.toLocaleString("en-US")} ${unit}.`;
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
