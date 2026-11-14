import { betterAuth } from "better-auth";
import { eq, sql } from "drizzle-orm";

import { isAccountTimezone, isRole } from "../identity";
import { authOptions } from "./auth";
import type { AuthConfig } from "./auth";
import type { Database, Transaction } from "./database";
import { user } from "./schema";

export const ACCOUNT_PROVISIONING_LOCK = 480_104;

const parseAccounts = (input: unknown) => {
  if (!Array.isArray(input)) {
    throw new TypeError("Provide a private JSON array of synthetic accounts.");
  }
  const accounts = input.map((value: unknown) => {
    if (
      value === null ||
      typeof value !== "object" ||
      !("name" in value) ||
      !("email" in value) ||
      !("password" in value) ||
      !("role" in value)
    ) {
      throw new Error("Each account requires name, email, password, and role.");
    }
    const { name, email, password, role } = value;
    const timezone = "timezone" in value ? value.timezone : "Asia/Bangkok";
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128 ||
      !isRole(role) ||
      !isAccountTimezone(timezone)
    ) {
      throw new Error(
        "Invalid account. Use a valid email, role, IANA timezone and a 12–128 character password."
      );
    }
    return {
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      role,
      timezone,
    };
  });
  if (
    accounts.filter((account) => account.role === "participant").length < 2 ||
    !accounts.some((account) => account.role === "program-manager") ||
    new Set(accounts.map((account) => account.email)).size !== accounts.length
  ) {
    throw new Error(
      "Provide at least two distinct Participants and one Program Manager."
    );
  }
  return accounts;
};

export const provisionAccounts = async (
  database: Database | Transaction,
  config: AuthConfig,
  input: unknown
) => {
  const accounts = parseAccounts(input);
  return await database.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(${ACCOUNT_PROVISIONING_LOCK})`
    );
    const options = authOptions(transaction, config);
    // This signup-enabled instance is private to operator tooling and is never mounted.
    const provisioner = betterAuth({
      ...options,
      emailAndPassword: { ...options.emailAndPassword, disableSignUp: false },
      user: {
        additionalFields: {
          role: { ...options.user.additionalFields.role, input: true },
          timezone: { ...options.user.additionalFields.timezone, input: true },
        },
      },
    });
    let created = 0;
    for (const account of accounts) {
      // Credential operations must remain sequential inside this transaction.
      // eslint-disable-next-line no-await-in-loop
      const existing = await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, account.email))
        .limit(1);
      if (existing.length) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- Do not interleave credential transactions.
      await provisioner.api.signUpEmail({ body: account });
      created += 1;
    }
    return { created, preserved: accounts.length - created };
  });
};
