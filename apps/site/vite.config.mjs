import { defineConfig } from "vite";
import { publicRoadmapPlugin } from "../../scripts/vite-public-roadmap.mjs";
import { publicSitePlugin } from "../../scripts/vite-public-site.mjs";

export default defineConfig({
  envDir: "../../",
  plugins: [publicRoadmapPlugin(), publicSitePlugin()],
});
