CREATE TABLE "channel_link" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text,
	"link_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_link" ADD CONSTRAINT "channel_link_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_link_identity_uidx" ON "channel_link" USING btree ("channel","external_id") WHERE "channel_link"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "channel_link_code_idx" ON "channel_link" USING btree ("link_code");