import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const staticRoot = resolve("out");
const port = Number.parseInt(process.env.PORT || "3000", 10);
const basePath = "/radar";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function fileForPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const underBase = decoded === basePath || decoded.startsWith(`${basePath}/`)
    ? decoded.slice(basePath.length) || "/"
    : decoded;
  const safePath = normalize(underBase).replace(/^((\.\.(\/|\\|$))+)/, "");
  const candidate = resolve(join(staticRoot, safePath));
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${sep}`)) return null;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) return join(candidate, "index.html");
  if (!extname(candidate)) {
    const index = join(candidate, "index.html");
    if (existsSync(index)) return index;
  }
  return candidate;
}

const server = createServer((request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  let filePath;
  try {
    filePath = fileForPath(pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=86400",
    "Content-Type": contentTypes[extension] || "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => console.log(`Surveillance Radar listening on ${port}`));
