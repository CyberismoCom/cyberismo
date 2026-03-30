#!/bin/bash
set -euo pipefail

echo "=== Installing dependencies ==="
corepack enable
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install

npm install -g @anthropic-ai/claude-code

echo "=== Setting up environment files ==="
if [ ! -f tools/backend/.env ]; then
    cp tools/backend/env.example tools/backend/.env
    echo "Created tools/backend/.env from env.example"
else
    echo "tools/backend/.env already exists, skipping"
fi

echo "=== Configuring git safe directory ==="
git config --global --add safe.directory "${containerWorkspaceFolder:-/workspaces/${PWD##*/}}"

echo "=== Building project ==="
pnpm build

echo "=== Installing Cypress binary ==="
pnpm --filter=app exec cypress install

echo "=== Dev environment ready! ==="
echo "Run 'pnpm dev' to start development servers"
echo "  Backend: http://localhost:3000"
echo "  Frontend: http://localhost:5173"
