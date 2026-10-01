# st-internal-test

Tiny Node app that tests whether an app running on OSC can reach a SuperTokens core
over the cluster-internal address with no OSC service access token.

- `GET /diag` probes the core over the internal address (`/hello`, `/apiversion`) with no token, and the public URL for comparison.
- `GET /` is a sign-in form.
- `POST /signin` forwards to the core `/recipe/signin` over the internal address with no token.

Config via env vars only, no secrets in code: `ST_INTERNAL_HOST`, `ST_INTERNAL_PORTS`, `ST_INTERNAL_URL`, `ST_PUBLIC_URL`.
Listens on `process.env.PORT` (8080 on OSC).
