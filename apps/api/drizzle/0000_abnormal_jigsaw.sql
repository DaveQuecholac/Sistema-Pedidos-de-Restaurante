CREATE TABLE "menu_item_modifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"price_amount" integer,
	"price_currency" text,
	CONSTRAINT "menu_item_modifiers_name_not_blank" CHECK (length(btrim("menu_item_modifiers"."name")) > 0),
	CONSTRAINT "menu_item_modifiers_kind" CHECK ("menu_item_modifiers"."kind" in ('extra', 'exclusion')),
	CONSTRAINT "menu_item_modifiers_price_by_kind" CHECK ((
        ("menu_item_modifiers"."kind" = 'extra' and "menu_item_modifiers"."price_amount" >= 0 and "menu_item_modifiers"."price_currency" is not null)
        or
        ("menu_item_modifiers"."kind" = 'exclusion' and "menu_item_modifiers"."price_amount" is null and "menu_item_modifiers"."price_currency" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_amount" integer NOT NULL,
	"price_currency" text NOT NULL,
	"tax_basis_points" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "menu_items_name_not_blank" CHECK (length(btrim("menu_items"."name")) > 0),
	CONSTRAINT "menu_items_price_amount_gte_0" CHECK ("menu_items"."price_amount" >= 0),
	CONSTRAINT "menu_items_price_currency_len_3" CHECK (length("menu_items"."price_currency") = 3),
	CONSTRAINT "menu_items_tax_basis_points_gte_0" CHECK ("menu_items"."tax_basis_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;