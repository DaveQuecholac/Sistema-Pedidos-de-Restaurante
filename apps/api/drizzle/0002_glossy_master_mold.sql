CREATE TABLE "menu_item_ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_ingredients_item_name" UNIQUE("menu_item_id","name"),
	CONSTRAINT "menu_item_ingredients_name_not_blank" CHECK (length(btrim("menu_item_ingredients"."name")) > 0),
	CONSTRAINT "menu_item_ingredients_position_gte_0" CHECK ("menu_item_ingredients"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;