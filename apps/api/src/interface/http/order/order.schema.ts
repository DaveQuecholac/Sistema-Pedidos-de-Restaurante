import { z } from 'zod';
import { isOrderStatus, type OrderStatus } from '../../../domain/order/order-status';

export const openOrderBodySchema = z
  .object({
    tableId: z.string().optional(),
    externalOrderId: z.string().optional(),
  })
  .strict();

export const addLineBodySchema = z
  .object({
    menuItemId: z.string(),
    quantity: z.number(),
    modifierIds: z.array(z.string()),
  })
  .strict();

export const modifyLineBodySchema = z
  .object({
    quantity: z.number(),
    modifierIds: z.array(z.string()),
  })
  .strict();

export const emptyOrderBodySchema = z.object({}).strict();

const statusFilterSchema = z.string().superRefine((value, ctx) => {
  for (const part of value.split(',')) {
    if (!isOrderStatus(part)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid status filter',
      });
      return;
    }
  }
});

export const listOrdersQuerySchema = z
  .object({
    status: statusFilterSchema.optional(),
  })
  .strict()
  .transform((query): { statuses: OrderStatus[] | null } => {
    if (query.status === undefined) {
      return { statuses: null };
    }

    return {
      statuses: query.status.split(',') as OrderStatus[],
    };
  });

export type OpenOrderBody = z.infer<typeof openOrderBodySchema>;
export type AddLineBody = z.infer<typeof addLineBodySchema>;
export type ModifyLineBody = z.infer<typeof modifyLineBodySchema>;
