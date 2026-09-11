CREATE TABLE "usage_counter" (
	"owner_id" text NOT NULL,
	"day" text NOT NULL,
	"turns" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counter_owner_id_day_pk" PRIMARY KEY("owner_id","day")
);
--> statement-breakpoint
ALTER TABLE "usage_counter" ADD CONSTRAINT "usage_counter_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;