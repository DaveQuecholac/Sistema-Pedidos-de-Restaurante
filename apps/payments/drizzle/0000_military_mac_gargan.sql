CREATE TABLE "payments" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"tendered_amount" integer,
	"card_last4" text,
	"payer_reference" text,
	"reference" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payments_method" CHECK ("payments"."method" in ('cash', 'card', 'digitalGateway')),
	CONSTRAINT "payments_amount_gte_0" CHECK ("payments"."amount" >= 0),
	CONSTRAINT "payments_currency_len_3" CHECK (length("payments"."currency") = 3),
	CONSTRAINT "payments_reference_len" CHECK (length(btrim("payments"."reference")) between 1 and 64),
	CONSTRAINT "payments_status" CHECK ("payments"."status" in ('approved', 'voided')),
	CONSTRAINT "payments_shape" CHECK ((
        (
          "payments"."method" = 'cash'
          and "payments"."tendered_amount" is not null
          and "payments"."tendered_amount" >= "payments"."amount"
          and "payments"."card_last4" is null
          and "payments"."payer_reference" is null
        )
        or
        (
          "payments"."method" = 'card'
          and "payments"."card_last4" is not null
          and "payments"."card_last4" ~ '^[0-9]{4}$'
          and "payments"."tendered_amount" is null
          and "payments"."payer_reference" is null
        )
        or
        (
          "payments"."method" = 'digitalGateway'
          and "payments"."payer_reference" is not null
          and length(btrim("payments"."payer_reference")) between 3 and 64
          and "payments"."tendered_amount" is null
          and "payments"."card_last4" is null
        )
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_approved_per_subject" ON "payments" USING btree ("subject_id") WHERE "payments"."status" = 'approved';