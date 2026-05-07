# Build clingo's static libraries in an isolated stage. Cache key
# depends only on the clingo submodule and its build script, so this
# stage hits ~100% across PRs that don't touch clingo itself —
# avoiding the ~5min cmake compile on every build.
FROM node:22-alpine AS clingo-builder
RUN apk add --no-cache g++ python3 make cmake
WORKDIR /app
COPY tools/node-clingo/external/clingo ./tools/node-clingo/external/clingo
COPY tools/node-clingo/scripts/build-clingo.cmake ./tools/node-clingo/scripts/build-clingo.cmake
RUN cmake -P tools/node-clingo/scripts/build-clingo.cmake


FROM node:22-alpine AS builder

# Enable corepack to use pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# OS build deps for node-gyp (clingo itself is built in the
# clingo-builder stage above and copied in below)
RUN apk add --no-cache g++ python3 make

WORKDIR /app

# Copy whole monorepo
COPY . /app

# Pull in clingo static libs from the clingo-builder stage so the
# binding step below links against them without rebuilding clingo.
COPY --from=clingo-builder \
     /app/tools/node-clingo/external/clingo/build \
     /app/tools/node-clingo/external/clingo/build

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm build

# node-clingo's `install` hook would run build:native (clingo + binding)
# but we ran `pnpm install --ignore-scripts` above. clingo libs are
# already present from the clingo-builder stage; just compile the JS
# binding via node-gyp here.
RUN cd /app/tools/node-clingo && pnpm run build:binding



FROM node:22-alpine AS runtime

# required environment variables for pnpm
ENV SHELL=/bin/bash
ENV PATH=/usr/local/share/pnpm:$PATH
ENV PNPM_HOME=/usr/local/share/pnpm

# bind the backend to all interfaces so published ports are reachable
ENV HOST=0.0.0.0

WORKDIR /app

# make sure logs directory exists and is writable
RUN mkdir /app/logs && chmod 777 /app/logs

# enable corepack to use pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo root manifest files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# frontend (copy package.json for dependency resolution)
RUN mkdir -p ./tools/app
COPY --from=builder /app/tools/app/package.json ./tools/app/package.json

# Configure Puppeteer to use system chromium instead of downloading its own.
# These must be set BEFORE npm install so mermaid-cli skips bundling Chromium.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

# install tools needed for PDF export
# - ruby & rubygems for installing asciidoctor/asciidoctor-pdf
# - chromium for mermaid CLI (mmdc) diagram rendering
RUN apk add --no-cache git ruby-full chromium \
  && gem install --no-document asciidoctor-pdf rouge \
  && npm install -g @mermaid-js/mermaid-cli

# node-clingo
RUN mkdir -p ./tools/node-clingo
COPY --from=builder /app/tools/node-clingo/package.json ./tools/node-clingo/package.json
COPY --from=builder /app/tools/node-clingo/dist ./tools/node-clingo/dist

# backend
RUN mkdir -p ./tools/backend
COPY --from=builder /app/tools/backend/package.json ./tools/backend/package.json
COPY --from=builder /app/tools/backend/dist ./tools/backend/dist
RUN chmod 666 ./tools/backend/dist/public/config.json

# cli
RUN mkdir -p ./tools/cli
COPY --from=builder /app/tools/cli/package.json ./tools/cli/package.json
COPY --from=builder /app/tools/cli/dist ./tools/cli/dist
COPY --from=builder /app/tools/cli/bin ./tools/cli/bin

# data-handler
RUN mkdir -p ./tools/data-handler
COPY --from=builder /app/tools/data-handler/package.json ./tools/data-handler/package.json
COPY --from=builder /app/tools/data-handler/dist ./tools/data-handler/dist

# assets
RUN mkdir -p ./tools/assets
COPY --from=builder /app/tools/assets/package.json ./tools/assets/package.json
COPY --from=builder /app/tools/assets/dist ./tools/assets/dist

# mcp
RUN mkdir -p ./tools/mcp
COPY --from=builder /app/tools/mcp/package.json ./tools/mcp/package.json
COPY --from=builder /app/tools/mcp/dist ./tools/mcp/dist

# migrations
RUN mkdir -p ./tools/migrations
COPY --from=builder /app/tools/migrations/package.json ./tools/migrations/package.json
COPY --from=builder /app/tools/migrations/dist ./tools/migrations/dist

# install deps without dev dependencies
RUN pnpm install --prod --ignore-scripts

# copy prebuilds
COPY --from=builder /app/tools/node-clingo/build ./tools/node-clingo/build

# setup bin
RUN pnpm setup
RUN pnpm link -g

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

WORKDIR /project
