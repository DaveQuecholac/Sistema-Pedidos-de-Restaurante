ALTER TABLE "menu_item_modifiers" DROP CONSTRAINT "menu_item_modifiers_price_by_kind";--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD COLUMN "ingredient_id" text;--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_id_item" UNIQUE("id","menu_item_id");--> statement-breakpoint
UPDATE "menu_item_modifiers" AS modifier
SET "ingredient_id" = ingredient."id"
FROM "menu_item_ingredients" AS ingredient
WHERE modifier."kind" = 'exclusion'
  AND modifier."menu_item_id" = ingredient."menu_item_id"
  AND modifier."name" = ingredient."name";--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_same_item_ingredient_fk" FOREIGN KEY ("ingredient_id","menu_item_id") REFERENCES "public"."menu_item_ingredients"("id","menu_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_price_by_kind" CHECK ((
        ("menu_item_modifiers"."kind" = 'extra' and "menu_item_modifiers"."ingredient_id" is null and "menu_item_modifiers"."price_amount" >= 0 and "menu_item_modifiers"."price_currency" is not null)
        or
        ("menu_item_modifiers"."kind" = 'exclusion' and "menu_item_modifiers"."ingredient_id" is not null and "menu_item_modifiers"."price_amount" is null and "menu_item_modifiers"."price_currency" is null)
      ));
