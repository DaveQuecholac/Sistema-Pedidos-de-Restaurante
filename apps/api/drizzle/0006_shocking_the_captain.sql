ALTER TABLE "orders" ADD COLUMN "discount_kind" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_basis_points" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_currency" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_kind" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_basis_points" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_amount" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_currency" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_kind" CHECK ("orders"."discount_kind" is null or "orders"."discount_kind" in ('percentage', 'fixedAmount'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_shape" CHECK ((
        (
          "orders"."discount_kind" is null
          and "orders"."discount_basis_points" is null
          and "orders"."discount_amount" is null
          and "orders"."discount_currency" is null
        )
        or
        (
          "orders"."discount_kind" = 'percentage'
          and "orders"."discount_basis_points" between 1 and 10000
          and "orders"."discount_amount" is null
          and "orders"."discount_currency" is null
        )
        or
        (
          "orders"."discount_kind" = 'fixedAmount'
          and "orders"."discount_amount" > 0
          and length("orders"."discount_currency") = 3
          and "orders"."discount_basis_points" is null
        )
      ));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tip_kind" CHECK ("orders"."tip_kind" is null or "orders"."tip_kind" in ('percentage', 'fixedAmount'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tip_shape" CHECK ((
        (
          "orders"."tip_kind" is null
          and "orders"."tip_basis_points" is null
          and "orders"."tip_amount" is null
          and "orders"."tip_currency" is null
        )
        or
        (
          "orders"."tip_kind" = 'percentage'
          and "orders"."tip_basis_points" between 1 and 10000
          and "orders"."tip_amount" is null
          and "orders"."tip_currency" is null
        )
        or
        (
          "orders"."tip_kind" = 'fixedAmount'
          and "orders"."tip_amount" > 0
          and length("orders"."tip_currency") = 3
          and "orders"."tip_basis_points" is null
        )
      ));