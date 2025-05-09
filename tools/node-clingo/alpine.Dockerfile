FROM node:22-alpine

# Enable corepack to use pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install OS build dependencies for native module compilation
RUN apk add --no-cache clingo-dev g++ python3 make

WORKDIR /app

# Copy whole monorepo
# Would be better to have a dockerignore file
COPY . /app

# remove node_modules from also subfolders
RUN pnpm clean

WORKDIR /app/tools/node-clingo


RUN pnpm install --frozen-lockfile
CMD [ "sh", "-c", "pnpm run build-prebuildify && mkdir -p /output && cp -R /app/tools/node-clingo/prebuilds/. /output/ && echo 'Build complete. Prebuilds copied to /output/'; ls -R /output" ] 