
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

# Cache downloaded npm packages between builds.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=600000

COPY prisma ./prisma
COPY prisma7.config.ts ./
COPY tsconfig*.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# Remove development dependencies after compiling.
RUN npm prune --omit=dev

FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated/prisma ./src/generated/prisma

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
