ALTER TABLE "orders" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "table_sittings" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "table_sittings" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_and_reference" CHECK ((
        ("orders"."payment_id" is null and "orders"."payment_reference" is null)
        or
        (
          "orders"."payment_id" is not null
          and length(btrim("orders"."payment_id")) > 0
          and "orders"."payment_reference" is not null
          and length(btrim("orders"."payment_reference")) > 0
        )
      ));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_no_payment_when_settled" CHECK ("orders"."table_settlement_id" is null or ("orders"."payment_id" is null and "orders"."payment_reference" is null));--> statement-breakpoint
ALTER TABLE "table_sittings" ADD CONSTRAINT "table_sittings_payment_id_and_reference" CHECK ((
        ("table_sittings"."payment_id" is null and "table_sittings"."payment_reference" is null)
        or
        (
          "table_sittings"."payment_id" is not null
          and length(btrim("table_sittings"."payment_id")) > 0
          and "table_sittings"."payment_reference" is not null
          and length(btrim("table_sittings"."payment_reference")) > 0
        )
      ));