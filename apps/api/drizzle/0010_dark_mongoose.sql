CREATE TABLE "table_sitting_payments" (
	"sitting_id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"tendered_amount" integer,
	"card_last4" text,
	"payer_reference" text,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "table_sitting_payments_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "table_sitting_payments_method" CHECK ("table_sitting_payments"."method" in ('cash', 'card', 'digitalGateway'))
);
--> statement-breakpoint
CREATE TABLE "table_sittings" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"status" text NOT NULL,
	"billing_mode" text NOT NULL,
	"discount_kind" text,
	"discount_basis_points" integer,
	"discount_amount" integer,
	"discount_currency" text,
	"tip_kind" text,
	"tip_basis_points" integer,
	"tip_amount" integer,
	"tip_currency" text,
	CONSTRAINT "table_sittings_status" CHECK ("table_sittings"."status" in ('OPEN', 'CLOSED')),
	CONSTRAINT "table_sittings_billing_mode" CHECK ("table_sittings"."billing_mode" in ('combined', 'separate')),
	CONSTRAINT "table_sittings_table_id_len" CHECK (length(btrim("table_sittings"."table_id")) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sitting_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "table_settlement_id" text;--> statement-breakpoint
ALTER TABLE "table_sitting_payments" ADD CONSTRAINT "table_sitting_payments_sitting_id_table_sittings_id_fk" FOREIGN KEY ("sitting_id") REFERENCES "public"."table_sittings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_settlement_when_closed" CHECK ("orders"."table_settlement_id" is null or "orders"."status" = 'CLOSED');