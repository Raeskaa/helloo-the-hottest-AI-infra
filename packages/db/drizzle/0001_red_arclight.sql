CREATE TYPE "public"."atom_status" AS ENUM('active', 'superseded', 'forgotten');--> statement-breakpoint
CREATE TYPE "public"."audit_kind" AS ENUM('tool_call', 'permission_request', 'permission_decision', 'termination');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'shared', 'org');--> statement-breakpoint
CREATE TABLE "atom" (
	"id" text PRIMARY KEY NOT NULL,
	"atom_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"org_id" text,
	"subject" text NOT NULL,
	"predicate" text NOT NULL,
	"object" jsonb NOT NULL,
	"fact_text" text NOT NULL,
	"valid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expired_at" timestamp with time zone,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"salience" real DEFAULT 0 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"status" "atom_status" DEFAULT 'active' NOT NULL,
	"supersedes" text,
	"provenance" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "audit_kind" NOT NULL,
	"request_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"digest" text
);
--> statement-breakpoint
CREATE TABLE "hello" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atom" ADD CONSTRAINT "atom_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atom" ADD CONSTRAINT "atom_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hello" ADD CONSTRAINT "hello_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atom_atomId_version_uidx" ON "atom" USING btree ("atom_id","version");--> statement-breakpoint
CREATE INDEX "atom_current_idx" ON "atom" USING btree ("hello_id","predicate") WHERE "atom"."expired_at" is null and "atom"."status" = 'active';--> statement-breakpoint
CREATE INDEX "atom_owner_atomId_idx" ON "atom" USING btree ("owner_id","atom_id");--> statement-breakpoint
CREATE INDEX "audit_hello_ts_idx" ON "audit" USING btree ("hello_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "hello_owner_uidx" ON "hello" USING btree ("owner_id");