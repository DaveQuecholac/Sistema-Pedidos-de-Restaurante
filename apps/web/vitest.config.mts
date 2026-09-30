import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/menu/menu-amount.spec.ts', 'app/menu/menu-api.spec.ts'],
  },
});
