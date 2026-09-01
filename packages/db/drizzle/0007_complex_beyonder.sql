CREATE TYPE "public"."policy_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'allowed', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'med', 'high', 'irreversible');--> statement-breakpoint
CREATE TABLE "permission_request" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"tool" text NOT NULL,
	"action_class" text,
	"contact" text,
	"args" jsonb NOT NULL,
	"risk" "risk_level" NOT NULL,
	"reason" text,
	"untrusted_args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"reviewer" text,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "policy" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"scope" jsonb NOT NULL,
	"effect" "policy_effect" NOT NULL,
	"expires_at" timestamp with time zone,
	"source_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "permission_request" ADD CONSTRAINT "permission_request_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_request" ADD CONSTRAINT "permission_request_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permission_request_queue_idx" ON "permission_request" USING btree ("hello_id","status");--> statement-breakpoint
CREATE INDEX "policy_lookup_idx" ON "policy" USING btree ("hello_id","effect");