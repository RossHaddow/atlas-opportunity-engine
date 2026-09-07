const http = require("node:http");
const { URL } = require("node:url");
const { server: atlasServer, storage, intelligenceQueue, authConfig, isAuthorized, requireValidAuthConfig } = require("./server");
const { buildDailyFocus } = require("./daily-focus");

const PORT = Number(process.env.PORT || 3000);
const APP_VERSION = require("./package.json").version;

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/daily-focus") {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    if (!isAuthorized(req, authConfig())) return unauthorized(res);
    const queue = intelligenceQueue(storage.read(), Date.now());
    return json(res, 200, buildDailyFocus(queue, Date.now()));
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

module.exports = { server };
