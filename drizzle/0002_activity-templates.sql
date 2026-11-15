CREATE TABLE "activity_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit" text NOT NULL,
	"entry_minimum" integer NOT NULL,
	"entry_maximum" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_template_name_nonempty" CHECK (char_length(btrim("activity_template"."name")) between 1 and 120),
	CONSTRAINT "activity_template_description_length" CHECK (char_length("activity_template"."description") <= 500),
	CONSTRAINT "activity_template_unit_check" CHECK ("activity_template"."unit" in ('minutes', 'counts')),
	CONSTRAINT "activity_template_bounds_check" CHECK ("activity_template"."entry_minimum" >= 1 and "activity_template"."entry_minimum" <= "activity_template"."entry_maximum" and (("activity_template"."unit" = 'minutes' and "activity_template"."entry_maximum" <= 1440) or ("activity_template"."unit" = 'counts' and "activity_template"."entry_maximum" <= 1000000))),
	CONSTRAINT "activity_template_version_positive" CHECK ("activity_template"."version" >= 1)
);
--> statement-breakpoint
CREATE INDEX "activity_template_active_name_idx" ON "activity_template" USING btree ("archived_at","name");