import { z } from 'zod';

const adjustment = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('percentage'), basisPoints: z.number() }).strict(),
  z.object({ kind: z.literal('fixedAmount'), amount: z.number() }).strict(),
]);

export const setDiscountBodySchema = z.object({ discount: adjustment.nullable() }).strict();
export const setTipBodySchema = z.object({ tip: adjustment.nullable() }).strict();
