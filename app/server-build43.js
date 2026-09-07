const http = require("node:http");
const { URL } = require("node:url");
const { server: atlasServer, storage, intelligenceQueue, authConfig, isAuthorized, requireValidAuthConfig } = require("./server");
const { buildDailyFocus } = require("./daily-focus");

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = require("./package.json").version;
const EXECUTION_STATUSES = ["Open", "Completed", "Blocked", "Deferred"];

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function unauthorized(res) {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Atlas", charset="UTF-8"',
    "Cache-Control": "no-store"
  });
  res.end("Authentication required.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let value = "";
    req.on("data", chunk => {
      value += chunk;
      if (value.length > 200000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try { resolve(value ? JSON.parse(value) : {}); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function dailyFocusQueue(now = Date.now()) {
  const opportunities = storage.read();
  const states = new Map(opportunities.map(item => [Number(item.id), item.daily_focus_state || null]));
  return intelligenceQueue(opportunities, now).map(item => ({ ...item, daily_focus_state: states.get(Number(item.id)) || null }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/daily-focus")) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    if (!isAuthorized(req, authConfig())) return unauthorized(res);

    if (req.method === "GET" && url.pathname === "/api/daily-focus") {
      return json(res, 200, buildDailyFocus(dailyFocusQueue(Date.now()), Date.now()));
    }

    const match = url.pathname.match(/^\/api\/daily-focus\/(\d+)$/);
    if (req.method === "PATCH" && match) {
      try {
        const input = await readBody(req);
        const status = String(input.status || "");
        if (!EXECUTION_STATUSES.includes(status)) {
          return json(res, 400, { error: `Status must be one of: ${EXECUTION_STATUSES.join(", ")}` });
        }
        const id = Number(match[1]);
        const data = storage.read();
        const index = data.findIndex(item => Number(item.id) === id);
        if (index < 0) return json(res, 404, { error: "Opportunity not found" });
        const now = new Date();
        const state = status === "Open" ? null : {
          date: now.toISOString().slice(0, 10),
          status,
          note: String(input.note || "").trim(),
          updated_at: now.toISOString()
        };
        data[index] = { ...data[index], daily_focus_state: state, updated_at: now.toISOString() };
        storage.write(data);
        return json(res, 200, {
          opportunity_id: id,
          daily_focus_state: state,
          plan: buildDailyFocus(dailyFocusQueue(Date.now()), Date.now())
        });
      } catch (error) {
        return json(res, error.message === "Invalid JSON" ? 400 : 500, { error: error.message });
      }
    }

    return json(res, 404, { error: "Not found." });
  }

  atlasServer.emit("request", req, res);
});

function shutdown(signal) {
  console.log(`Atlas received ${signal}; shutting down.`);
  server.close(() => {
    try { storage.close(); } finally { process.exit(0); }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
  const access = requireValidAuthConfig();
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  server.listen(PORT, "0.0.0.0", () => console.log(`Atlas ${APP_VERSION} is running on port ${PORT} (${access.enabled ? "access protected" : "local/unlocked"})`));
}

module.exports = { server, EXECUTION_STATUSES, dailyFocusQueue };
