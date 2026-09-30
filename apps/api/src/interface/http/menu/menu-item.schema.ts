import { z } from 'zod';

const priceSchema = z
  .object({
    amount: z.number(),
    currency: z.string(),
  })
  .strict();

const applicableTaxSchema = z
  .object({
    basisPoints: z.number(),
  })
  .strict();

const modifierSchema = z
  .object({
    name: z.string(),
    kind: z.string(),
    price: priceSchema.optional(),
  })
  .strict();

const menuItemFields = {
  name: z.string(),
  price: priceSchema,
  applicableTax: applicableTaxSchema,
  modifiers: z.array(modifierSchema),
};

export const createMenuItemBodySchema = z.object(menuItemFields).strict();

export const updateMenuItemBodySchema = createMenuItemBodySchema.extend({
  active: z.boolean(),
}).strict();

export const deactivateMenuItemBodySchema = z.object({}).strict();

export type CreateMenuItemBody = z.infer<typeof createMenuItemBodySchema>;
export type UpdateMenuItemBody = z.infer<typeof updateMenuItemBodySchema>;
