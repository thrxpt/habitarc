CREATE TABLE "goal_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"habit_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"daily_target" integer NOT NULL,
	"weekday_mask" integer NOT NULL,
	CONSTRAINT "goal_revision_habit_date_unique" UNIQUE("habit_id","effective_from"),
	CONSTRAINT "goal_revision_target_check" CHECK ("goal_revision"."daily_target" between 1 and 1000000),
	CONSTRAINT "goal_revision_weekdays_check" CHECK ("goal_revision"."weekday_mask" between 1 and 127)
);
--> statement-breakpoint
CREATE TABLE "habit" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_id" text NOT NULL,
	"template_id" text NOT NULL,
	"start_date" date NOT NULL,
	"archived_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_tracking_period_check" CHECK ("habit"."archived_from" is null or "habit"."archived_from" > "habit"."start_date")
);
--> statement-breakpoint
ALTER TABLE "goal_revision" ADD CONSTRAINT "goal_revision_habit_id_habit_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit" ADD CONSTRAINT "habit_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit" ADD CONSTRAINT "habit_template_id_activity_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."activity_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_participant_idx" ON "habit" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "habit_template_idx" ON "habit" USING btree ("template_id");
--> statement-breakpoint
-- Drizzle does not model exclusion constraints. Keep this database invariant in SQL.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "habit" ADD CONSTRAINT "habit_no_overlapping_periods"
EXCLUDE USING gist (
  "participant_id" WITH =,
  "template_id" WITH =,
  daterange("start_date", "archived_from", '[)') WITH &&
);
--> statement-breakpoint
-- UPDATE owns the template row lock that createHabit also takes before using it.
CREATE FUNCTION preserve_used_template_measurement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.unit, NEW.entry_minimum, NEW.entry_maximum)
       IS DISTINCT FROM (OLD.unit, OLD.entry_minimum, OLD.entry_maximum)
     AND EXISTS (SELECT 1 FROM habit WHERE template_id = OLD.id) THEN
    RAISE EXCEPTION 'Used Activity Template measurement rules are frozen.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER activity_template_preserve_measurement
BEFORE UPDATE OF unit, entry_minimum, entry_maximum ON activity_template
FOR EACH ROW EXECUTE FUNCTION preserve_used_template_measurement();
