ALTER TABLE "orders" DROP CONSTRAINT "orders_discount_shape";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_tip_shape";--> statement-breakpoint
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
          and "orders"."discount_basis_points" is null
          and "orders"."discount_amount" is not null
          and "orders"."discount_amount" > 0
          and "orders"."discount_currency" is not null
          and length("orders"."discount_currency") = 3
        )
      ));--> statement-breakpoint
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
          and "orders"."tip_basis_points" is null
          and "orders"."tip_amount" is not null
          and "orders"."tip_amount" > 0
          and "orders"."tip_currency" is not null
          and length("orders"."tip_currency") = 3
        )
      ));