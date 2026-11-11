import { defineConfig } from 'drizzle-kit';

const url = process.env.MENU_DATABASE_URL;

if (!url) {
  throw new Error('MENU_DATABASE_URL is required');
}

export default defineConfig({
  schema: ['./src/infrastructure/persistence/drizzle/schema/menu.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
