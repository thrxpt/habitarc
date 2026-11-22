import { describe, expect, test } from "vite-plus/test";

import {
  OperatorStageError,
  formatOperatorDiagnostic,
} from "../src/server/operator-error";

describe("formatOperatorDiagnostic", () => {
  test("extracts allowlisted metadata from OperatorStageError, APIError, and Drizzle/PostgreSQL causes", () => {
    const pgError = Object.assign(
      new Error("permission denied for secret postgres://user:pass@host/db"),
      {
        code: "42501",
        constraint: "user_role_check",
        query: "INSERT INTO user VALUES ($1)",
        params: ["super-secret-password"],
      }
    );
    pgError.name = "DatabaseError";

    const drizzleError = new Error(
      "Failed query: INSERT INTO user ... super-secret-password",
      { cause: pgError }
    );
    drizzleError.name = "DrizzleQueryError";

    const apiError = Object.assign(new Error("Failed to create user"), {
      statusCode: 422,
      body: { code: "FAILED_TO_CREATE_USER", message: "Failed to create user" },
    });
    apiError.name = "APIError";

    const wrapped = new OperatorStageError(
      "Sign-up failed during account provisioning.",
      {
        cause: apiError,
        underlying: drizzleError,
      }
    );

    const output = formatOperatorDiagnostic("provision", wrapped);
    expect(output).toBe(
      "stage=provision name=APIError code=FAILED_TO_CREATE_USER status=422 underlyingName=DrizzleQueryError underlyingCauseName=DatabaseError underlyingCauseCode=42501 underlyingCauseConstraint=user_role_check"
    );
    expect(output).not.toContain("super-secret-password");
    expect(output).not.toContain("postgres://");
    expect(output).not.toContain("INSERT INTO");
    expect(output).not.toContain("permission denied");
  });

  test("omits unsafe fields and rejects non-allowlisted strings", () => {
    const unsafeError = Object.assign(
      new Error("postgresql://db:top-secret-value@127.0.0.1/habitarc"),
      {
        code: "secret://leak with spaces",
        status: 999,
        constraint: "bad constraint name!",
        query: "SELECT 1",
        params: ["top-secret-value"],
      }
    );
    unsafeError.name = "Unsafe Name!";

    const output = formatOperatorDiagnostic("bad stage!", unsafeError);
    expect(output).toBe("stage=unknown name=UnknownError");
    expect(output).not.toContain("top-secret-value");
    expect(output).not.toContain("postgresql://");
  });

  test("handles standard nested error causes and non-Error throwables", () => {
    const root = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const middle = new Error("query failed", { cause: root });
    const outer = new Error("migration failed", { cause: middle });

    expect(formatOperatorDiagnostic("migrate", outer)).toBe(
      "stage=migrate name=Error causeName=Error rootName=Error rootCode=ECONNREFUSED"
    );
    expect(formatOperatorDiagnostic("config", "raw secret string")).toBe(
      "stage=config name=UnknownError"
    );
  });
});
