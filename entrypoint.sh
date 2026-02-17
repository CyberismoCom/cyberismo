#!/bin/sh
set -e

CONFIG_FILE="/app/tools/backend/dist/public/config.json"

# Replace config values from environment variables if set
if [ -n "${APP_LOGOUT_URL:-}" ] && [ -f "$CONFIG_FILE" ]; then
  sed -i "s|\"logoutUrl\": \"[^\"]*\"|\"logoutUrl\": \"${APP_LOGOUT_URL}\"|" "$CONFIG_FILE"
fi

exec "$@"
