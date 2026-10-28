import { defineConfig } from 'drizzle-kit';

const url = process.env.PAYMENTS_DATABASE_URL;

if (!url) {
  throw new Error('PAYMENTS_DATABASE_URL is required');
}

export default defineConfig({
  schema: ['./src/infrastructure/persistence/drizzle/schema/payment.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
