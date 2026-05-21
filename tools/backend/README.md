Hono backend server for [Cyberismo Solution](https://cyberismo.com/solution)

## Manual smoke test: migration system routes

Verifies the mutations and module-update routes end-to-end against a
running backend. Requires `jq`. The example uses the `decision-records`
fixture from `tools/data-handler/test/test-data/valid/decision-records`
copied to a writable temp project, with one seeded link reference and
one seeded `shared/foo` module installation.

```bash
# 1. Build the backend.
pnpm --filter @cyberismo/backend build

# 2. Stage a writable project. Seed a link reference and a module so
#    the rename has something to cascade and the module-update has a
#    sealed log to replay.
SMOKE_DIR=$(mktemp -d -t cyberismo-smoke-XXXXXX)
cp -r tools/data-handler/test/test-data/valid/decision-records "$SMOKE_DIR/project"

python3 -c "
import json
p = '$SMOKE_DIR/project/cardRoot/decision_5/index.json'
d = json.load(open(p))
d['links'] = [{'linkType': 'decision/linkTypes/test', 'cardKey': 'decision_6'}]
json.dump(d, open(p, 'w'), indent=4)
"

mkdir -p "$SMOKE_DIR/project/.cards/modules/shared/foo/migrations"
touch "$SMOKE_DIR/project/.cards/modules/shared/foo/migrations/migrationLog_1.0.0.jsonl"
touch "$SMOKE_DIR/project/.cards/modules/shared/foo/migrations/migrationLog_1.6.0.jsonl"
cat > "$SMOKE_DIR/project/.cards/local/appliedModules.json" <<'EOF'
{
  "modules": [
    { "prefix": "shared/foo", "installedVersion": "1.0.0", "appliedVersion": "1.0.0" }
  ]
}
EOF

# 3. Start the backend with mock auth on a free port in 3000-3100.
(cd "$SMOKE_DIR/project" && AUTH_MODE=mock PORT=3055 \
  node "$PWD/tools/backend/dist/main.js") &
sleep 3

# 4. Preview a mutation.
curl -s http://localhost:3055/api/projects/decision/mutations/preview \
  -H "Content-Type: application/json" \
  -d '{"input":{"kind":"rename","target":{"prefix":"decision","type":"linkTypes","identifier":"test"},"newIdentifier":"is-caused-by"}}' \
  > /tmp/preview.json
jq . /tmp/preview.json

# 5. Apply the mutation with the round-tripped fingerprint.
BODY=$(jq -n --argjson p "$(cat /tmp/preview.json)" '{input: $p.input, fingerprint: $p.fingerprint}')
curl -s -X POST http://localhost:3055/api/projects/decision/mutations/apply \
  -H "Content-Type: application/json" \
  -d "$BODY"

# 6. Stale-fingerprint case returns 409 with a fresh PreviewResult inside details.preview.
curl -s -w "\nHTTP %{http_code}\n" -X POST \
  http://localhost:3055/api/projects/decision/mutations/apply \
  -H "Content-Type: application/json" \
  -d '{"input":{"kind":"rename","target":{"prefix":"decision","type":"linkTypes","identifier":"is-caused-by"},"newIdentifier":"causes-2"},"fingerprint":{"digest":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}}'

# 7. Module update preview.
curl -s -X POST http://localhost:3055/api/projects/decision/modules/update/preview \
  -H "Content-Type: application/json" \
  -d '{"module":"shared/foo","toVersion":"1.6.0"}'

# 8. Module update with SSE.
curl -s -N -X POST http://localhost:3055/api/projects/decision/modules/update \
  -H "Content-Type: application/json" \
  -d '{"module":"shared/foo","toVersion":"1.6.0"}'
# Streams:
#   event: step.started
#   data: ...
#   event: step.completed
#   data: ...
#   event: complete
#   data: ...
```
