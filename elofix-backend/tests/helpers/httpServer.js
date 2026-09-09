const http = require("http");

function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        async close() {
          if (typeof server.closeIdleConnections === "function") {
            server.closeIdleConnections();
          }
          if (typeof server.closeAllConnections === "function") {
            server.closeAllConnections();
          }
          await new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });
    server.on("error", reject);
  });
}

async function httpRequest(baseUrl, method, pathname, opts = {}) {
  const url = new URL(pathname, baseUrl);
  const headers = { ...(opts.headers || {}) };
  let body = opts.body;
  if (opts.json != null) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(opts.json);
  }
  if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, text, body: parsed };
}

module.exports = { listenApp, httpRequest };
