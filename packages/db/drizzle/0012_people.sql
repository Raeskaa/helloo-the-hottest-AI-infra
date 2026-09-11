CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"kind" text DEFAULT 'person' NOT NULL,
	"display_name" text NOT NULL,
	"norm" text NOT NULL,
	"is_self" boolean DEFAULT false NOT NULL,
	"mentions" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"person_id" text NOT NULL,
	"channel" text NOT NULL,
	"value" text NOT NULL,
	"norm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identity" ADD CONSTRAINT "person_identity_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identity" ADD CONSTRAINT "person_identity_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_identity" ADD CONSTRAINT "person_identity_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_owner_norm_uidx" ON "person" USING btree ("owner_id","norm");--> statement-breakpoint
CREATE INDEX "person_hello_idx" ON "person" USING btree ("hello_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_identity_owner_channel_norm_uidx" ON "person_identity" USING btree ("owner_id","channel","norm");--> statement-breakpoint
CREATE INDEX "person_identity_person_idx" ON "person_identity" USING btree ("person_id");