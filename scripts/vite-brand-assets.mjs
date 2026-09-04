import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exportsRoot = new URL("../packages/web-ui/brand/exports/", import.meta.url);

export const brandAssetFiles = Object.freeze({
  "/favicon.ico": "web/favicon.ico",
  "/favicon.svg": "web/favicon.svg",
  "/favicon-16x16.png": "web/favicon-16x16.png",
  "/favicon-32x32.png": "web/favicon-32x32.png",
  "/apple-touch-icon.png": "web/apple-touch-icon.png",
  "/brand/make-it-a-story-mark-dark.svg": "svg/make-it-a-story-mark-dark.svg",
  "/brand/make-it-a-story-mark-black.svg": "svg/make-it-a-story-mark-black.svg",
  "/brand/make-it-a-story-mark-light.svg": "svg/make-it-a-story-mark-light.svg",
  "/brand/make-it-a-story-mark-olive.svg": "svg/make-it-a-story-mark-olive.svg",
  "/brand/make-it-a-story-lockup.svg": "svg/make-it-a-story-lockup.svg",
  "/brand/make-it-a-story-lockup-black.svg": "svg/make-it-a-story-lockup-black.svg",
  "/brand/make-it-a-story-lockup-light.svg": "svg/make-it-a-story-lockup-light.svg",
  "/brand/make-clip-a-story-lockup.svg": "svg/make-clip-a-story-lockup.svg",
  "/brand/make-clip-a-story-lockup-black.svg": "svg/make-clip-a-story-lockup-black.svg",
  "/brand/make-clip-a-story-lockup-light.svg": "svg/make-clip-a-story-lockup-light.svg",
  "/brand/make-travel-a-story-lockup.svg": "svg/make-travel-a-story-lockup.svg",
  "/brand/make-travel-a-story-lockup-black.svg": "svg/make-travel-a-story-lockup-black.svg",
  "/brand/make-travel-a-story-lockup-light.svg": "svg/make-travel-a-story-lockup-light.svg",
});

const contentTypes = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

export function brandAssetsPlugin() {
  return {
    name: "storyteller-brand-assets",
    async buildStart() {
      for (const [publicPath, relativePath] of Object.entries(brandAssetFiles)) {
        this.emitFile({
          type: "asset",
          fileName: publicPath.slice(1),
          source: await readFile(new URL(relativePath, exportsRoot)),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const relativePath = brandAssetFiles[pathname];
        if (!relativePath) {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" }).end();
          return;
        }
        try {
          const source = await readFile(new URL(relativePath, exportsRoot));
          const extension = relativePath.slice(relativePath.lastIndexOf("."));
          response.writeHead(200, {
            "Content-Type": contentTypes[extension] ?? "application/octet-stream",
            "Cache-Control": "no-cache",
            "Content-Length": source.byteLength,
            "X-Content-Type-Options": "nosniff",
          });
          response.end(request.method === "HEAD" ? undefined : source);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export function resolveBrandAssetPath(publicPath) {
  const relativePath = brandAssetFiles[publicPath];
  return relativePath ? fileURLToPath(new URL(relativePath, exportsRoot)) : undefined;
}
