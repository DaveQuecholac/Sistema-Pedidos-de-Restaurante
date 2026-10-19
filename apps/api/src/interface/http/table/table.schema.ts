import { z } from 'zod';

export const createTableBodySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    zone: z.string().optional(),
  })
  .strict();

export const updateTableBodySchema = z
  .object({
    label: z.string(),
    zone: z.string(),
  })
  .strict();

export const emptyTableBodySchema = z.object({}).strict();

export type CreateTableBody = z.infer<typeof createTableBodySchema>;
export type UpdateTableBody = z.infer<typeof updateTableBodySchema>;
