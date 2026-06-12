# syntax=docker/dockerfile:1
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

# Install all dependencies using secret mount for GitHub Package Registry auth
# The secret is mounted only during this RUN instruction and never persists in the image
RUN --mount=type=secret,id=GITHUB_TOKEN \
    echo "inject-workspace-packages=true" > .npmrc && \
    echo "@dreamx-development:registry=https://npm.pkg.github.com" >> .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/GITHUB_TOKEN)" >> .npmrc && \
    pnpm install --frozen-lockfile --filter=@hodlbonds-api/trading-api...

# Build all workspace dependencies in correct order
RUN pnpm --filter=@hodlbonds-api/trading-api... build

# Use pnpm deploy to create standalone deployment, then clean up .npmrc
RUN pnpm --filter=@hodlbonds-api/trading-api --prod deploy /pruned && \
    rm -f .npmrc

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
