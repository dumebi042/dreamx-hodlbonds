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

# Create minimal .npmrc to avoid copying potentially sensitive data
RUN echo 'inject-workspace-packages=true' > .npmrc

# Install only dependencies needed for this app (and its workspace deps)
RUN pnpm install --frozen-lockfile --filter=@hodlbonds-api/price-oracle...

# Build all workspace dependencies in correct order
RUN pnpm --filter=@hodlbonds-api/price-oracle... build

# Use pnpm deploy to create standalone deployment
RUN pnpm --filter=@hodlbonds-api/price-oracle --prod deploy /pruned

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only production essentials
COPY --from=build /pruned/dist ./dist
COPY --from=build /pruned/node_modules ./node_modules
COPY --from=build /pruned/package.json ./package.json

# Job runs to completion, no port needed
CMD ["node", "dist/index.mjs"]
