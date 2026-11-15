CREATE TABLE "activity_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"habit_id" text NOT NULL,
	"activity_date" date NOT NULL,
	"amount" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_entry_amount_check" CHECK ("activity_entry"."amount" between 1 and 1000000),
	CONSTRAINT "activity_entry_version_positive" CHECK ("activity_entry"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "mutation_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" text NOT NULL,
	"operation" text NOT NULL,
	"payload_fingerprint" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutation_receipt_actor_key_unique" UNIQUE("actor_id","request_key"),
	CONSTRAINT "mutation_receipt_request_key_nonempty" CHECK (char_length(btrim("mutation_receipt"."request_key")) between 1 and 128),
	CONSTRAINT "mutation_receipt_operation_nonempty" CHECK (char_length(btrim("mutation_receipt"."operation")) between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "activity_entry" ADD CONSTRAINT "activity_entry_habit_id_habit_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_receipt" ADD CONSTRAINT "mutation_receipt_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entry_habit_date_idx" ON "activity_entry" USING btree ("habit_id","activity_date","created_at","id");
--> statement-breakpoint
-- Serialize direct database writes and enforce tracking-period, bounds, and daily-ceiling invariants.
CREATE FUNCTION enforce_activity_entry_invariants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  h_start_date date;
  h_archived_from date;
  t_unit text;
  t_min integer;
  t_max integer;
  daily_ceiling integer;
  existing_total integer;
BEGIN
  SELECT h.start_date, h.archived_from, t.unit, t.entry_minimum, t.entry_maximum
    INTO h_start_date, h_archived_from, t_unit, t_min, t_max
    FROM habit h
    JOIN activity_template t ON t.id = h.template_id
   WHERE h.id = NEW.habit_id
   FOR UPDATE OF h;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habit not found for Activity Entry.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.activity_date < h_start_date
     OR (h_archived_from IS NOT NULL AND NEW.activity_date >= h_archived_from) THEN
    RAISE EXCEPTION 'Activity Entry date is outside the Habit tracking period.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.amount < t_min OR NEW.amount > t_max THEN
    RAISE EXCEPTION 'Activity Entry amount is outside the Activity Template bounds.'
      USING ERRCODE = '23514';
  END IF;

  daily_ceiling := CASE WHEN t_unit = 'minutes' THEN 1440 ELSE 1000000 END;

  SELECT COALESCE(SUM(amount), 0)
    INTO existing_total
    FROM activity_entry
   WHERE habit_id = NEW.habit_id
     AND activity_date = NEW.activity_date
     AND id <> NEW.id;

  IF existing_total + NEW.amount > daily_ceiling THEN
    RAISE EXCEPTION 'Daily total cannot exceed unit ceiling.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER activity_entry_enforce_invariants
BEFORE INSERT OR UPDATE ON activity_entry
FOR EACH ROW EXECUTE FUNCTION enforce_activity_entry_invariants();
