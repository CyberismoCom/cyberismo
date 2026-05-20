#!/bin/sh
set -e

CONFIG_FILE="/app/tools/backend/dist/public/config.json"

# Map environment variables to config.json keys
# Format: ENV_VAR_NAME:jsonKey
CONFIG_VARS="
APP_LOGOUT_URL:logoutUrl
APP_PRESENCE_ENABLED:presenceEnabled
"

# Replace config values from environment variables if set
if [ -f "$CONFIG_FILE" ]; then
  for entry in $CONFIG_VARS; do
    env_name="${entry%%:*}"
    json_key="${entry##*:}"
    eval "value=\${${env_name}:-}"
    if [ -n "$value" ]; then
      sed -i "s|\"${json_key}\": *\"[^\"]*\"|\"${json_key}\": \"${value}\"|; s|\"${json_key}\": *[a-z0-9][a-z0-9]*|\"${json_key}\": ${value}|" "$CONFIG_FILE"
    fi
  done
fi

exec "$@"
