CREATE TABLE "agent_skill_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"previous_revision" text NOT NULL,
	"new_revision" text NOT NULL,
	"previous_tree" text,
	"new_tree" text,
	"evidence" jsonb,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis_attempts" integer DEFAULT 0 NOT NULL,
	"analysis_error" text,
	"report" jsonb,
	"telemetry" jsonb,
	"analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_skill_updates_transition_unique" UNIQUE("skill_id","previous_revision","new_revision"),
	CONSTRAINT "agent_skill_updates_status" CHECK ("agent_skill_updates"."analysis_status" in ('pending', 'analyzing', 'failed', 'complete')),
	CONSTRAINT "agent_skill_updates_attempts" CHECK ("agent_skill_updates"."analysis_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"repository" text NOT NULL,
	"directory" text NOT NULL,
	"description" text NOT NULL,
	"source_url" text NOT NULL,
	"tracking" boolean DEFAULT true NOT NULL,
	"baseline_revision" text,
	"observed_revision" text,
	"observed_tree" text,
	"branch" text,
	"check_status" text DEFAULT 'not_checked' NOT NULL,
	"check_error" text,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_skills_slug_unique" UNIQUE("slug"),
	CONSTRAINT "agent_skills_source_unique" UNIQUE("repository","directory"),
	CONSTRAINT "agent_skills_repository_normalized" CHECK ("agent_skills"."repository" = lower("agent_skills"."repository")),
	CONSTRAINT "agent_skills_directory_normalized" CHECK ("agent_skills"."directory" ~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' and "agent_skills"."directory" !~ '(^|/)[.]{1,2}(/|$)'),
	CONSTRAINT "agent_skills_check_status" CHECK ("agent_skills"."check_status" in ('not_checked', 'ok', 'changed', 'missing', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_skill_updates" ADD CONSTRAINT "agent_skill_updates_skill_id_agent_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."agent_skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_skill_updates_skill_created_idx" ON "agent_skill_updates" USING btree ("skill_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_skill_updates_pending_idx" ON "agent_skill_updates" USING btree ("analysis_status","created_at");
