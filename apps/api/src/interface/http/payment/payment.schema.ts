import { z } from 'zod';

const payment = z.discriminatedUnion('method', [
  z.object({ method: z.literal('cash'), tendered: z.number() }).strict(),
  z.object({ method: z.literal('card'), cardLast4: z.string() }).strict(),
  z.object({ method: z.literal('digitalGateway'), payerReference: z.string() }).strict(),
]);

export const closeOrderBodySchema = z.object({ expectedTotal: z.number(), payment }).strict();
