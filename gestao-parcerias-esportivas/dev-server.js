/**
 * Servidor local sem dependências: serve o app e a rota /api/extract-contract.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node dev-server.js
 *   → http://localhost:3000
 *
 * Também lê um arquivo .env na raiz (que está no .gitignore).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

// .env simples (CHAVE=valor)
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch (_) { /* sem .env */ }

const extractContract = require("./api/extract-contract");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const MAX_BODY = 4.5 * 1024 * 1024;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/extract-contract") {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413).end('{"error":"Arquivo grande demais."}'); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      req.body = Buffer.concat(chunks).toString("utf8");
      extractContract(req, res);
    });
    return;
  }

  const file = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  const blocked = !file.startsWith(ROOT + path.sep) || /[\\/](\.env|api|node_modules)([\\/]|$)/.test(file.slice(ROOT.length)) || file.endsWith("dev-server.js");
  if (blocked) return res.writeHead(404).end("Not found");
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end("Not found");
    res.writeHead(200, { "content-type": (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`App em http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("Aviso: ANTHROPIC_API_KEY não definida, a IA vai rodar só em modo demo.");
});
