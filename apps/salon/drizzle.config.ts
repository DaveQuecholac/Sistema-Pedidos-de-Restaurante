import { defineConfig } from 'drizzle-kit';

const url = process.env.SALON_DATABASE_URL;

if (!url) {
  throw new Error('SALON_DATABASE_URL is required');
}

export default defineConfig({
  schema: ['./src/infrastructure/persistence/drizzle/schema/table.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
