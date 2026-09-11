CREATE TABLE "chat_session" (
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_session_identity_uidx" ON "chat_session" USING btree ("channel","external_id");