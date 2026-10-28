CREATE TABLE "order_line_modifiers" (
	"order_line_id" text NOT NULL,
	"position" integer NOT NULL,
	"modifier_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"price_amount" integer,
	"price_currency" text,
	CONSTRAINT "order_line_modifiers_pkey" PRIMARY KEY("order_line_id","position"),
	CONSTRAINT "order_line_modifiers_name_not_blank" CHECK (length(btrim("order_line_modifiers"."name")) > 0),
	CONSTRAINT "order_line_modifiers_kind" CHECK ("order_line_modifiers"."kind" in ('extra', 'exclusion')),
	CONSTRAINT "order_line_modifiers_position_gte_0" CHECK ("order_line_modifiers"."position" >= 0),
	CONSTRAINT "order_line_modifiers_price_by_kind" CHECK ((
        ("order_line_modifiers"."kind" = 'extra' and "order_line_modifiers"."price_amount" >= 0 and "order_line_modifiers"."price_currency" is not null)
        or
        ("order_line_modifiers"."kind" = 'exclusion' and "order_line_modifiers"."price_amount" is null and "order_line_modifiers"."price_currency" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_amount" integer NOT NULL,
	"unit_price_currency" text NOT NULL,
	"tax_basis_points" integer NOT NULL,
	"quantity" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_position" UNIQUE("order_id","position"),
	CONSTRAINT "order_lines_name_not_blank" CHECK (length(btrim("order_lines"."name")) > 0),
	CONSTRAINT "order_lines_unit_price_amount_gte_0" CHECK ("order_lines"."unit_price_amount" >= 0),
	CONSTRAINT "order_lines_unit_price_currency_len_3" CHECK (length("order_lines"."unit_price_currency") = 3),
	CONSTRAINT "order_lines_tax_basis_points_gte_0" CHECK ("order_lines"."tax_basis_points" >= 0),
	CONSTRAINT "order_lines_quantity_range" CHECK ("order_lines"."quantity" between 1 and 99),
	CONSTRAINT "order_lines_position_gte_0" CHECK ("order_lines"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text,
	"external_order_id" text,
	"status" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "orders_external_order_id_unique" UNIQUE("external_order_id"),
	CONSTRAINT "orders_table_id_len" CHECK ("orders"."table_id" is null or (length(btrim("orders"."table_id")) between 1 and 40)),
	CONSTRAINT "orders_external_order_id_len" CHECK ("orders"."external_order_id" is null or (length(btrim("orders"."external_order_id")) between 1 and 64)),
	CONSTRAINT "orders_origin_exactly_one" CHECK (("orders"."table_id" is null) <> ("orders"."external_order_id" is null)),
	CONSTRAINT "orders_status" CHECK ("orders"."status" in ('OPEN', 'IN_KITCHEN', 'READY', 'CLOSED', 'CANCELLED')),
	CONSTRAINT "orders_version_gte_0" CHECK ("orders"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_line_modifiers" ADD CONSTRAINT "order_line_modifiers_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_status_opened_at_idx" ON "orders" USING btree ("status","opened_at");