import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicRoadmap } from "../../scripts/public-roadmap.mjs";
import { listPublicPages } from "../../scripts/public-site.mjs";

const defaultSiteRoot = fileURLToPath(new URL("./dist/", import.meta.url));
const defaultStoryRoot = fileURLToPath(new URL("../story-web/dist/", import.meta.url));
const defaultClipRoot = fileURLToPath(new URL("../clip-web/dist/", import.meta.url));

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const publicPaths = new Set(listPublicPages().map((page) => page.path));
const siteStaticPaths = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);

export function createFrontendHost({
  siteRoot = defaultSiteRoot,
  storyRoot = defaultStoryRoot,
  clipRoot = defaultClipRoot,
  getProductRoadmap = loadPublicRoadmap,
} = {}) {
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === "/product-roadmap.json") {
        await sendProductRoadmap(request, response, getProductRoadmap);
        return;
      }

      const legacyStoryMatch = pathname.match(/^\/stories(?=\/|$)(.*)$/);
      if (legacyStoryMatch) {
        redirect(response, `/app/stories${legacyStoryMatch[1] ?? ""}${url.search}`, 308);
        return;
      }

      if (pathname === "/app/" || pathname === "/app/profile/") {
        redirect(response, `${pathname.slice(0, -1)}${url.search}`, 308);
        return;
      }

      if (pathname.length > 1 && pathname.endsWith("/") && publicPaths.has(pathname.slice(0, -1))) {
        redirect(response, `${pathname.slice(0, -1)}${url.search}`, 308, true);
        return;
      }

      if (publicPaths.has(pathname)) {
        const pagePath = pathname === "/" ? join(siteRoot, "index.html") : join(siteRoot, pathname.slice(1), "index.html");
        if (!(await isFile(pagePath))) throw new Error(`Missing prerendered page: ${pathname}`);
        sendFile(request, response, pagePath);
        return;
      }

      if (pathname === "/sign-in" || pathname === "/app" || pathname === "/app/profile") {
        await sendRequiredFile(request, response, join(siteRoot, "app.html"), true);
        return;
      }

      if (await serveApplication(request, response, pathname, "/app/stories", storyRoot)) return;
      if (await serveApplication(request, response, pathname, "/app/clips", clipRoot)) return;

      if (pathname.startsWith("/assets/") || siteStaticPaths.has(pathname)) {
        const siteRelativePath = safeRelativePath(pathname);
        if (!siteRelativePath) {
          respondNotFound(response, "File not found");
          return;
        }
        const filePath = join(siteRoot, siteRelativePath);
        if (await isFile(filePath)) {
          sendFile(request, response, filePath);
          return;
        }
        respondNotFound(response, "File not found");
        return;
      }

      respondNotFound(response, "Page not found");
    } catch {
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      }).end("Server error");
    }
  });
}

async function sendProductRoadmap(request, response, getProductRoadmap) {
  try {
    const roadmap = await getProductRoadmap();
    const body = JSON.stringify(roadmap);
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      // The process-level loader already limits GitHub requests. Keeping this
      // response in browser caches can strand an open roadmap on old counts.
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(502, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }).end(request.method === "HEAD" ? undefined : JSON.stringify({ error: "product_roadmap_unavailable" }));
  }
}

export function registerFrontendHostShutdown(server, {
  processTarget = process,
  exit = (code) => process.exit(code),
} = {}) {
  const signals = ["SIGINT", "SIGTERM"];
  let closing = false;
  const cleanup = () => {
    for (const signal of signals) processTarget.removeListener(signal, shutdown);
  };
  const shutdown = () => {
    if (closing) return;
    closing = true;
    cleanup();
    server.close((error) => exit(error ? 1 : 0));
  };
  for (const signal of signals) processTarget.once(signal, shutdown);
  return cleanup;
}

async function serveApplication(request, response, pathname, prefix, root) {
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return false;
  const suffix = pathname.slice(prefix.length).replace(/^\/+/, "");
  if (suffix && (suffix.startsWith("assets/") || extname(suffix))) {
    const relativePath = safeRelativePath(suffix);
    if (!relativePath) {
      respondNotFound(response, "File not found");
      return true;
    }
    const filePath = join(root, relativePath);
    if (!(await isFile(filePath))) {
      respondNotFound(response, "File not found");
      return true;
    }
    sendFile(request, response, filePath, 200, true);
    return true;
  }

  await sendRequiredFile(request, response, join(root, "index.html"), true);
  return true;
}

async function sendRequiredFile(request, response, filePath, application) {
  if (!(await isFile(filePath))) throw new Error(`Missing build artifact: ${filePath}`);
  sendFile(request, response, filePath, 200, application);
}

function sendFile(request, response, filePath, status = 200, application = false) {
  const basename = filePath.slice(filePath.lastIndexOf("/") + 1);
  const noCache = filePath.endsWith(".html") || basename === "robots.txt" || basename === "sitemap.xml";
  response.writeHead(status, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : "public, max-age=31536000, immutable",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    ...(application ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

function safeRelativePath(pathname) {
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  if (!relative || relative === "." || relative.startsWith("..") || relative.includes("\0")) return null;
  return relative;
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function redirect(response, location, status, cacheable = false) {
  response.writeHead(status, {
    Location: location,
    "Cache-Control": cacheable ? "public, max-age=3600" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  }).end();
}

function respondNotFound(response, message) {
  response.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  }).end(message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.WEB_HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000);
  const server = createFrontendHost();
  server.listen(port, host);
  registerFrontendHostShutdown(server);
}
