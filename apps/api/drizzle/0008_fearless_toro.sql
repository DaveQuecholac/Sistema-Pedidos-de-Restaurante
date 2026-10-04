CREATE TABLE "order_payments" (
	"order_id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"tendered_amount" integer,
	"card_last4" text,
	"payer_reference" text,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_payments_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "order_payments_method" CHECK ("order_payments"."method" in ('cash', 'card', 'digitalGateway')),
	CONSTRAINT "order_payments_amount_gte_0" CHECK ("order_payments"."amount" >= 0),
	CONSTRAINT "order_payments_currency_len_3" CHECK (length("order_payments"."currency") = 3),
	CONSTRAINT "order_payments_reference_len" CHECK (length(btrim("order_payments"."reference")) between 1 and 64),
	CONSTRAINT "order_payments_shape" CHECK ((
        (
          "order_payments"."method" = 'cash'
          and "order_payments"."tendered_amount" is not null
          and "order_payments"."tendered_amount" >= "order_payments"."amount"
          and "order_payments"."card_last4" is null
          and "order_payments"."payer_reference" is null
        )
        or
        (
          "order_payments"."method" = 'card'
          and "order_payments"."card_last4" is not null
          and "order_payments"."card_last4" ~ '^[0-9]{4}$'
          and "order_payments"."tendered_amount" is null
          and "order_payments"."payer_reference" is null
        )
        or
        (
          "order_payments"."method" = 'digitalGateway'
          and "order_payments"."payer_reference" is not null
          and length(btrim("order_payments"."payer_reference")) between 3 and 64
          and "order_payments"."tendered_amount" is null
          and "order_payments"."card_last4" is null
        )
      ))
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;