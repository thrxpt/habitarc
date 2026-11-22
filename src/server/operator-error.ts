const SAFE_NAME = /^[A-Za-z0-9_]{1,64}$/u;
const SAFE_CODE = /^[A-Za-z0-9_-]{1,64}$/u;

export class OperatorStageError extends Error {
  readonly underlying?: unknown;

  constructor(
    message: string,
    options?: { cause?: unknown; underlying?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = "OperatorStageError";
    this.underlying = options?.underlying;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const safeString = (value: unknown, pattern: RegExp): string | undefined =>
  typeof value === "string" && pattern.test(value) ? value : undefined;

const safeStatus = (record: Record<string, unknown>): number | undefined => {
  for (const key of ["statusCode", "status"] as const) {
    const candidate = record[key];
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 100 &&
      candidate <= 599
    ) {
      return candidate;
    }
  }
  return undefined;
};

const safeCode = (record: Record<string, unknown>): string | undefined => {
  const direct = safeString(record.code, SAFE_CODE);
  if (direct !== undefined) {
    return direct;
  }
  if (isRecord(record.body)) {
    return safeString(record.body.code, SAFE_CODE);
  }
  return undefined;
};

const prefixedKey = (prefix: string, field: string): string => {
  if (!prefix) {
    return field;
  }
  return `${prefix}${field.charAt(0).toUpperCase()}${field.slice(1)}`;
};

const extractFields = (prefix: string, candidate: unknown): string[] => {
  if (!isRecord(candidate)) {
    return [];
  }
  const parts: string[] = [];
  const name = safeString(candidate.name, SAFE_NAME);
  const code = safeCode(candidate);
  const status = safeStatus(candidate);
  const constraint = safeString(candidate.constraint, SAFE_NAME);

  if (name !== undefined) {
    parts.push(`${prefixedKey(prefix, "name")}=${name}`);
  }
  if (code !== undefined) {
    parts.push(`${prefixedKey(prefix, "code")}=${code}`);
  }
  if (status !== undefined) {
    parts.push(`${prefixedKey(prefix, "status")}=${status}`);
  }
  if (constraint !== undefined) {
    parts.push(`${prefixedKey(prefix, "constraint")}=${constraint}`);
  }
  return parts;
};

const readCause = (candidate: unknown): unknown =>
  isRecord(candidate) ? candidate.cause : undefined;

/**
 * Formats an allowlisted, secret-free diagnostic line from operator errors.
 * Never reads messages, stack traces, SQL queries, parameters, or URLs.
 */
export const formatOperatorDiagnostic = (
  stage: string,
  error: unknown
): string => {
  const safeStage = safeString(stage, SAFE_CODE) ?? "unknown";
  const entries: readonly [string, unknown][] =
    error instanceof OperatorStageError
      ? [
          ["", error.cause],
          ["cause", readCause(error.cause)],
          ["underlying", error.underlying],
          ["underlyingCause", readCause(error.underlying)],
        ]
      : [
          ["", error],
          ["cause", readCause(error)],
          ["root", readCause(readCause(error))],
        ];

  const fields: string[] = [];
  for (const [prefix, candidate] of entries) {
    fields.push(...extractFields(prefix, candidate));
  }

  if (!fields.some((entry) => entry.startsWith("name="))) {
    fields.unshift("name=UnknownError");
  }

  return `stage=${safeStage} ${fields.join(" ")}`;
};
