# st-internal-test

Tiny Node app that tests whether an app running on OSC can reach a SuperTokens core
over the cluster-internal address with no OSC service access token.

- `GET /diag` probes the core over the internal address with no OSC token: (a) no api-key, (b) a wrong api-key, (c) the configured api-key, (d) sign-in for test1 with a wrong password. Also the public URL with no token and no key. The key itself is never shown.
- `GET /` is a sign-in form.
- `POST /signin` forwards to the core `/recipe/signin` over the internal address with no OSC token, sending the configured api-key.

Config via env vars only, no secrets in code: `ST_INTERNAL_HOST`, `ST_INTERNAL_PORTS`, `ST_INTERNAL_URL`, `ST_PUBLIC_URL`, `ST_API_KEY`.
Listens on `process.env.PORT` (8080 on OSC).
