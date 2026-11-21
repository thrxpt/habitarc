ALTER TABLE "habit" ADD COLUMN "reminder_time" text;--> statement-breakpoint
ALTER TABLE "habit" ADD CONSTRAINT "habit_reminder_time_check" CHECK ("habit"."reminder_time" is null or "habit"."reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
