FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Build stage - install deps and use pnpm deploy to create pruned output
FROM base AS build
WORKDIR /app

# Set CI environment variable for pnpm (Docker has no TTY)
ENV CI=true

# Copy entire monorepo
COPY . .

# Install all dependencies (including dev for building)
RUN pnpm install --frozen-lockfile

# Build all workspace dependencies in correct order
RUN pnpm --filter=@hodlbonds-api/server... build

# Use pnpm deploy to create standalone deployment
RUN pnpm --filter=@hodlbonds-api/server --prod --legacy deploy /pruned

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production essentials
COPY --from=build /pruned/dist ./dist
COPY --from=build /pruned/node_modules ./node_modules
COPY --from=build /pruned/package.json ./package.json

# Cloud Run uses PORT env var (default 8080)
EXPOSE 8080

CMD ["node", "dist/index.mjs"]
