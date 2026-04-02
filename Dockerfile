FROM node:22-alpine AS builder

# Enable corepack to use pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install OS build dependencies for native module compilation
RUN apk add --no-cache g++ python3 make cmake

WORKDIR /app

# Copy whole monorepo
COPY . /app
RUN pnpm install --frozen-lockfile --no-scripts
RUN pnpm build

# make sure a prebuild is done
RUN cd /app/tools/node-clingo && pnpm run build-prebuildify



FROM node:22-alpine AS runtime

# required environment variables for pnpm
ENV SHELL=/bin/bash
ENV PATH=/usr/local/share/pnpm:$PATH
ENV PNPM_HOME=/usr/local/share/pnpm

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

# install tools needed for PDF export
# - ruby & rubygems for installing asciidoctor/asciidoctor-pdf
# - chromium for mermaid CLI (mmdc) diagram rendering
RUN apk add --no-cache git ruby-full chromium \
  && gem install --no-document asciidoctor-pdf rouge \
  && npm install -g @mermaid-js/mermaid-cli

# Configure Puppeteer to use system chromium instead of downloading its own
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

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
COPY --from=builder /app/tools/node-clingo/prebuilds ./tools/node-clingo/prebuilds

# setup bin
RUN pnpm setup
RUN pnpm link -g

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

WORKDIR /project
