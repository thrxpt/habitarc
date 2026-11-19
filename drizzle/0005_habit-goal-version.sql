ALTER TABLE "habit" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "habit" ADD CONSTRAINT "habit_version_positive" CHECK ("habit"."version" >= 1);