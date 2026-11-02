import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/src/app.js", ["src/app.js", "text/javascript"]],
  ["/src/core.js", ["src/core.js", "text/javascript"]],
  ["/src/style.css", ["src/style.css", "text/css"]],
]);
const privateHistory = process.argv.includes("--private-history");
if (privateHistory)
  files.set("/api/local-history", [".local/historico.csv", "text/csv"]);
const server = http.createServer(async (req, res) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (
    req.headers.host !== `127.0.0.1:${server.address().port}` &&
    req.headers.host !== `localhost:${server.address().port}`
  ) {
    res.writeHead(403);
    res.end("Host no autorizado");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const entry = files.get(new URL(req.url, "http://localhost").pathname);
  if (!entry) {
    res.writeHead(404);
    res.end("No encontrado");
    return;
  }
  try {
    const data = await readFile(root + entry[0]);
    res.setHeader("Content-Type", entry[1] + "; charset=utf-8");
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Archivo no disponible");
  }
});
server.listen(Number(process.env.PORT || 5173), "127.0.0.1", () =>
  console.log(
    `Finanzas local en puerto ${server.address().port}. Histórico privado: ${privateHistory ? "habilitado" : "deshabilitado"}.`,
  ),
);
