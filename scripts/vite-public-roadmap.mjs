import { loadPublicRoadmap } from "./public-roadmap.mjs";

export function publicRoadmapPlugin(getProductRoadmap = loadPublicRoadmap) {
  return {
    name: "vite-plugin-public-roadmap",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/product-roadmap.json") {
          next();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" }).end();
          return;
        }
        try {
          const body = JSON.stringify(await getProductRoadmap());
          response.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
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
      });
    },
  };
}
