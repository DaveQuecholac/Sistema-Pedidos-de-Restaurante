FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /repo

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @restaurante/api --filter @restaurante/payments --filter @restaurante/menu --filter @restaurante/salon --filter @restaurante/gateway build

ENV NODE_ENV=production

CMD ["node", "apps/gateway/dist/main.js"]
