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
RUN pnpm --filter=@hodlbonds-blockchain-executor/executor... build

# Use pnpm deploy to create standalone deployment
RUN pnpm --filter=@hodlbonds-blockchain-executor/executor --prod --legacy deploy /pruned

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user and directories
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 executor && \
    mkdir -p /app/config && \
    chown -R executor:nodejs /app

# Copy the complete pruned deployment from build stage
COPY --from=build --chown=executor:nodejs /pruned .

USER executor

ENTRYPOINT ["node", "dist/index.mjs"]
