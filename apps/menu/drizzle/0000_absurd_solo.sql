CREATE TABLE "menu_item_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_ingredients_item_name" UNIQUE("menu_item_id","name"),
	CONSTRAINT "menu_item_ingredients_id_item" UNIQUE("id","menu_item_id"),
	CONSTRAINT "menu_item_ingredients_name_not_blank" CHECK (length(btrim("menu_item_ingredients"."name")) > 0),
	CONSTRAINT "menu_item_ingredients_position_gte_0" CHECK ("menu_item_ingredients"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"ingredient_id" text,
	"price_amount" integer,
	"price_currency" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_modifiers_name_not_blank" CHECK (length(btrim("menu_item_modifiers"."name")) > 0),
	CONSTRAINT "menu_item_modifiers_kind" CHECK ("menu_item_modifiers"."kind" in ('extra', 'exclusion')),
	CONSTRAINT "menu_item_modifiers_position_gte_0" CHECK ("menu_item_modifiers"."position" >= 0),
	CONSTRAINT "menu_item_modifiers_price_by_kind" CHECK ((
        ("menu_item_modifiers"."kind" = 'extra' and "menu_item_modifiers"."ingredient_id" is null and "menu_item_modifiers"."price_amount" >= 0 and "menu_item_modifiers"."price_currency" is not null)
        or
        ("menu_item_modifiers"."kind" = 'exclusion' and "menu_item_modifiers"."ingredient_id" is not null and "menu_item_modifiers"."price_amount" is null and "menu_item_modifiers"."price_currency" is null)
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
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_same_item_ingredient_fk" FOREIGN KEY ("ingredient_id","menu_item_id") REFERENCES "public"."menu_item_ingredients"("id","menu_item_id") ON DELETE cascade ON UPDATE no action;