CREATE TABLE "release_votes" (
	"user_id" text NOT NULL,
	"release_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_votes_user_id_release_id_pk" PRIMARY KEY("user_id","release_id"),
	CONSTRAINT "release_votes_value_check" CHECK ("release_votes"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "release_votes" ADD CONSTRAINT "release_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_votes" ADD CONSTRAINT "release_votes_release_id_release_updates_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_votes_release_idx" ON "release_votes" USING btree ("release_id");