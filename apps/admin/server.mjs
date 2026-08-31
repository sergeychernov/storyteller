import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("./dist/", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2",
};

export function createAdminServer({ root = defaultRoot, apiOrigin = process.env.ADMIN_API_ORIGIN ?? "http://localhost:3001" } = {}) {
  return createServer(async (request, response) => {
    applySecurityHeaders(response, apiOrigin);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      if (pathname === "/health") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
        return;
      }
      if (pathname === "/robots.txt") {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
        response.end(request.method === "HEAD" ? undefined : "User-agent: *\nDisallow: /\n");
        return;
      }
      const relative = safeRelativePath(pathname);
      const asset = relative ? join(root, relative) : undefined;
      const filePath = asset && await isFile(asset) ? asset : join(root, "index.html");
      if (!await isFile(filePath)) throw new Error("Admin build artifact is missing");
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": filePath.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Server error");
    }
  });
}

function applySecurityHeaders(response, apiOrigin) {
  for (const [name, value] of Object.entries(adminSecurityHeaders(apiOrigin))) response.setHeader(name, value);
}

export function adminSecurityHeaders(apiOrigin) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'", "base-uri 'none'", `connect-src 'self' ${apiOrigin}`, "font-src 'self' data:",
      "form-action 'none'", "frame-ancestors 'none'", "img-src 'self' data:", "object-src 'none'",
      "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function safeRelativePath(pathname) {
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  if (!relative || relative === "." || relative.startsWith("..") || relative.includes("\0")) return undefined;
  return relative;
}

async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createAdminServer();
  server.listen(Number(process.env.PORT ?? 3004), process.env.ADMIN_HOST ?? "0.0.0.0");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close(() => process.exit(0)));
}
