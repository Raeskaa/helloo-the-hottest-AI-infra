CREATE TABLE "atom_embedding" (
	"atom_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atom_embedding" ADD CONSTRAINT "atom_embedding_atom_id_atom_id_fk" FOREIGN KEY ("atom_id") REFERENCES "public"."atom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atom_embedding" ADD CONSTRAINT "atom_embedding_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atom_embedding" ADD CONSTRAINT "atom_embedding_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atom_embedding_hello_idx" ON "atom_embedding" USING btree ("hello_id");