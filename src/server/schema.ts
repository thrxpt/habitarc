// Generated with auth@1.7.23, then reviewed for application constraints and UTC instants.
import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  check,
  text,
  bigint,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

import {
  MEASUREMENT_CEILINGS,
  MEASUREMENT_UNITS,
  TEMPLATE_DESCRIPTION_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
} from "../templates";
import { DEFAULT_ACCOUNT_TIMEZONE } from "./account-policy";

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("emailVerified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    role: text("role").notNull(),
    timezone: text("timezone").default(DEFAULT_ACCOUNT_TIMEZONE).notNull(),
  },
  (table) => [
    check(
      "user_role_check",
      sql`${table.role} in ('participant', 'program-manager')`
    ),
  ]
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_userId_idx").on(table.userId),
    index("session_expiry_idx").on(table.expiresAt),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const rateLimit = pgTable("rateLimit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});

export const activityTemplate = pgTable(
  "activity_template",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    unit: text("unit").notNull(),
    entryMinimum: integer("entry_minimum").notNull(),
    entryMaximum: integer("entry_maximum").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "activity_template_name_nonempty",
      sql`char_length(btrim(${table.name})) between 1 and ${sql.raw(String(TEMPLATE_NAME_MAX_LENGTH))}`
    ),
    check(
      "activity_template_description_length",
      sql`char_length(${table.description}) <= ${sql.raw(String(TEMPLATE_DESCRIPTION_MAX_LENGTH))}`
    ),
    check(
      "activity_template_unit_check",
      sql`${table.unit} in (${sql.raw(
        MEASUREMENT_UNITS.map((unit) => `'${unit}'`).join(", ")
      )})`
    ),
    check(
      "activity_template_bounds_check",
      sql`${table.entryMinimum} >= 1 and ${table.entryMinimum} <= ${table.entryMaximum} and (${sql.join(
        MEASUREMENT_UNITS.map(
          (unit) =>
            sql`(${table.unit} = ${sql.raw(`'${unit}'`)} and ${table.entryMaximum} <= ${sql.raw(String(MEASUREMENT_CEILINGS[unit]))})`
        ),
        sql` or `
      )})`
    ),
    check("activity_template_version_positive", sql`${table.version} >= 1`),
    index("activity_template_active_name_idx").on(table.archivedAt, table.name),
  ]
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
