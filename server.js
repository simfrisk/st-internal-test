// Probes a SuperTokens core on OSC over the cluster-internal address, with no OSC token.
// Config comes from env vars, no secrets in code:
//   ST_INTERNAL_HOST   cluster-internal host of the core
//   ST_INTERNAL_PORTS  comma-separated ports to try (first that answers /hello wins)
//   ST_INTERNAL_URL    optional explicit base, e.g. http://host:3567 (skips port scan)
//   ST_PUBLIC_URL      public ingress URL, used for the no-token comparison
//   ST_API_KEY         API key of the core, sent as the api-key header. Never shown or logged.
const http = require("http");

const API_KEY = process.env.ST_API_KEY || "";

const INTERNAL_HOST =
  process.env.ST_INTERNAL_HOST ||
  "testsimon-sbmigst.supertokens-supertokens-core.svc.cluster.local";
const PORTS = (process.env.ST_INTERNAL_PORTS || "3567,80,8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PUBLIC_URL =
  process.env.ST_PUBLIC_URL ||
  "https://testsimon-sbmigst.supertokens-supertokens-core.auto.prod-se.osaas.io";
const CDI = "5.3";
let workingBase = process.env.ST_INTERNAL_URL || null;

async function probe(url, opts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {}));
    const full = await r.text();
    return { url, status: r.status, body: full.slice(0, 300), full: full };
  } catch (e) {
    const cause = e && e.cause ? e.cause.code || e.cause.message || String(e.cause) : e.message;
    return { url, error: String(cause) };
  } finally {
    clearTimeout(timer);
  }
}

async function findBase() {
  if (workingBase) return workingBase;
  for (const p of PORTS) {
    const base = "http://" + INTERNAL_HOST + ":" + p;
    const r = await probe(base + "/hello");
    if (typeof r.status === "number") {
      workingBase = base;
      return base;
    }
  }
  return null;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

function headers(key) {
  const h = { "Content-Type": "application/json", "cdi-version": CDI };
  if (key) h["api-key"] = key;
  return h;
}

function show(r) {
  // Display form: status and a short body only, never request headers.
  if (typeof r.status !== "number") return { error: r.error };
  return { status: r.status, body: r.body };
}

async function coreSignin(base, key, email, password) {
  return probe(base + "/recipe/signin", {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ email: email, password: password }),
  });
}

async function diag() {
  const out = {
    internalHost: INTERNAL_HOST,
    portsTried: PORTS,
    apiKeyConfigured: API_KEY.length > 0,
    internal: {},
    publicNoTokenNoKey: {},
  };
  const base = await findBase();
  out.internalBaseUsed = base;
  if (base) {
    const wrong = "wrong-" + Math.random().toString(36).slice(2);
    out.internal.a_noKey_usersCount = show(await probe(base + "/users/count", { headers: headers("") }));
    out.internal.a_noKey_signin = show(await coreSignin(base, "", "test1@example.com", "not-the-password"));
    out.internal.b_wrongKey_usersCount = show(await probe(base + "/users/count", { headers: headers(wrong) }));
    out.internal.b_wrongKey_signin = show(await coreSignin(base, wrong, "test1@example.com", "not-the-password"));
    out.internal.c_correctKey_usersCount = API_KEY
      ? show(await probe(base + "/users/count", { headers: headers(API_KEY) }))
      : { skipped: "ST_API_KEY not set" };
    out.internal.d_correctKey_wrongPassword_signin = API_KEY
      ? show(await coreSignin(base, API_KEY, "test1@example.com", "not-the-password"))
      : { skipped: "ST_API_KEY not set" };
    out.internal.noKey_hello = show(await probe(base + "/hello"));
  } else {
    out.internal.error = "no internal port answered";
    for (const p of PORTS) {
      const b = "http://" + INTERNAL_HOST + ":" + p;
      out.internal["port_" + p] = show(await probe(b + "/hello"));
    }
  }
  out.publicNoTokenNoKey.hello = show(await probe(PUBLIC_URL + "/hello", { redirect: "manual" }));
  out.publicNoTokenNoKey.usersCount = show(await probe(PUBLIC_URL + "/users/count", { redirect: "manual" }));
  return out;
}

async function signin(email, password) {
  const base = await findBase();
  if (!base) return { ok: false, coreStatus: null, result: "NO INTERNAL CORE REACHABLE" };
  const r = await coreSignin(base, API_KEY, email, password);
  if (typeof r.status !== "number") {
    return { ok: false, coreStatus: null, result: "REQUEST FAILED: " + (r.error || "unknown") };
  }
  let status = null;
  try {
    status = JSON.parse(r.full).status;
  } catch (e) {
    status = null;
  }
  const result =
    status === "OK"
      ? "SIGN-IN OK"
      : status === "WRONG_CREDENTIALS_ERROR"
      ? "WRONG_CREDENTIALS"
      : r.status === 401
      ? "REFUSED BY CORE (401): " + r.body.slice(0, 120)
      : "OTHER: " + (status || r.body.slice(0, 120));
  return { ok: true, coreStatus: r.status, result: result };
}

function formPage(msg) {
  return (
    "<!doctype html><html><head><meta charset=utf-8><title>SuperTokens internal test</title>" +
    "<style>body{font-family:system-ui;margin:2rem;max-width:40rem}label{display:block;margin:.5rem 0}" +
    "input{padding:.4rem;width:16rem}button{padding:.5rem 1rem;margin-top:.5rem}" +
    "code{background:#f0f0f0;padding:.1rem .3rem}.m{margin:1rem 0;padding:.6rem;background:#eef;border-radius:4px}</style>" +
    "</head><body><h1>SuperTokens internal-address test</h1>" +
    "<p>This app calls the SuperTokens core over the cluster-internal address with no OSC token, sending the core API key from its config. " +
    "See <a href=/diag>/diag</a> for the raw probe.</p>" +
    (msg ? '<div class="m">' + msg + "</div>" : "") +
    '<form method="POST" action="/signin">' +
    "<label>Email <input name=email type=email required></label>" +
    "<label>Password <input name=password type=password required></label>" +
    "<button type=submit>Sign in</button></form></body></html>"
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      return send(res, 200, "text/html", formPage(""));
    }
    if (req.method === "GET" && req.url === "/diag") {
      const d = await diag();
      return send(res, 200, "application/json", JSON.stringify(d, null, 2));
    }
    if (req.method === "POST" && req.url === "/signin") {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
        if (raw.length > 4096) req.destroy();
      });
      req.on("end", async () => {
        const p = new URLSearchParams(raw);
        const email = (p.get("email") || "").trim();
        const password = p.get("password") || "";
        const r = await signin(email, password);
        const msg =
          "Core HTTP status: <code>" +
          esc(r.coreStatus) +
          "</code><br>Result: <strong>" +
          esc(r.result) +
          "</strong>";
        send(res, 200, "text/html", formPage(msg));
      });
      return;
    }
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, 500, "text/plain", "error: " + e.message);
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("st-internal-test listening on " + PORT));
