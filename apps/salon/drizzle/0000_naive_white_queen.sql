CREATE TABLE "tables" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"zone" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tables_id_len" CHECK (length(btrim("tables"."id")) between 1 and 40),
	CONSTRAINT "tables_label_not_blank" CHECK (length(btrim("tables"."label")) > 0),
	CONSTRAINT "tables_zone_not_blank" CHECK (length(btrim("tables"."zone")) > 0)
);
