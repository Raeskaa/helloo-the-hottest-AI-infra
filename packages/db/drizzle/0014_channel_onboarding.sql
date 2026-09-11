CREATE TABLE "channel_onboarding" (
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"stage" text NOT NULL,
	"email" text,
	"attempts" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_identity_uidx" ON "channel_onboarding" USING btree ("channel","external_id");