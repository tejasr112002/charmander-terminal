# Mock trading terminal: Next.js UI + fake exchange + WebSocket, one process on :3100.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS run
ENV NODE_ENV=production
ENV PORT=3100
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/app ./app
COPY --from=build /app/components ./components
COPY --from=build /app/data ./data
# faults.json is rewritten at runtime by PUT /api/faults, so it must stay a normal writable file.
COPY --from=build /app/faults.json ./faults.json
RUN chown -R node:node /app
USER node
EXPOSE 3100
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
