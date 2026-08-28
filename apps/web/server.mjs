import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { listPublicPages, publicSite } from "../../scripts/public-site.mjs";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const host = process.env.WEB_HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const publicPaths = new Set(listPublicPages().map((page) => page.path));
const publicPrefixes = Object.values(publicSite.locales).map((locale) => `/${locale.code}`);

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function sendFile(request, response, filePath, status = 200) {
  const basename = filePath.slice(filePath.lastIndexOf("/") + 1);
  const noCache = filePath.endsWith(".html") || basename === "robots.txt" || basename === "sitemap.xml";
  response.writeHead(status, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);

    if (pathname.length > 1 && pathname.endsWith("/") && publicPaths.has(pathname.slice(0, -1))) {
      response.writeHead(308, { Location: pathname.slice(0, -1), "Cache-Control": "public, max-age=3600" }).end();
      return;
    }

    const relativePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
    let filePath = join(root, relativePath || "index.html");

    if (publicPaths.has(pathname)) {
      filePath = pathname === "/" ? join(root, "index.html") : join(root, relativePath, "index.html");
      if (!(await isFile(filePath))) throw new Error(`Missing prerendered page: ${pathname}`);
      sendFile(request, response, filePath);
      return;
    }

    if (await isFile(filePath)) {
      sendFile(request, response, filePath);
      return;
    }

    const isUnknownPublicPath = publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (isUnknownPublicPath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }).end("Page not found");
      return;
    }

    const isApplicationRoute = pathname === "/sign-in" || /^\/stories(?:\/|$)/.test(pathname);
    if (isApplicationRoute) {
      sendFile(request, response, join(root, "app.html"));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }).end("Page not found");
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Server error");
  }
});

server.listen(port, host);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
